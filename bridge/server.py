"""GrapeRoot-Viz bridge server.

Loads a project's info_graph.json and re-emits Claude Code tool events
to a 3D viewer over WebSocket.

Endpoints:
  GET  /graph         -> {nodes, links, meta}
  POST /event         -> ingest a hook event {tool, paths[], phase, ts}
  WS   /ws            -> broadcast stream of events to the viewer
  GET  /health        -> liveness

Run:
  python server.py --graph /path/to/.dual-graph/info_graph.json --port 8765
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn


# ---------- graph loading ----------

def load_graph(path: Path, *, max_nodes: int = 600) -> dict[str, Any]:
    """Read info_graph.json and reshape it for force-graph rendering.

    The raw graph is huge (100k+ nodes). We need file→file connectivity, but
    GrapeRoot's edges fall into three buckets:
      - references: file → file (the real file-graph)
      - imports:    file → bare module name (not a graph node — drops out)
      - contains:   file → file::symbol
      - requires:   file → bare module name

    To get a connected file graph we (a) keep all `references` edges, then
    (b) synthesise file→file edges from `imports` by resolving the target
    through `contains`: if A imports X and some file F contains X, add A→F.
    """
    raw = json.loads(path.read_text())
    nodes_raw = raw.get("nodes", [])
    edges_raw = raw.get("edges", [])

    files = [n for n in nodes_raw if n.get("kind") == "file"]
    file_ids = {n["id"] for n in files}

    # symbol_id -> owning file_id  (from `contains`)
    symbol_to_file: dict[str, str] = {}
    for e in edges_raw:
        if e.get("rel") == "contains":
            sym = e.get("to")
            f = e.get("from")
            if isinstance(sym, str) and isinstance(f, str):
                symbol_to_file[sym] = f

    # Suffix index for resolving import targets that look like paths.
    # Key examples: "src/engine/foo", "app/models/bar", "components/Btn".
    # We index every file id under several truncated forms so a target like
    # "app.models.platform_customer" or "src/foo/bar" can find it.
    CODE_EXTS = (".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java",
                 ".kt", ".cs", ".rb", ".php", ".swift", ".mjs", ".cjs")
    suffix_index: dict[str, str] = {}

    def index_keys(file_id: str) -> list[str]:
        # Generate the path stem (no extension, no trailing /index).
        stem = file_id
        for ext in CODE_EXTS:
            if stem.endswith(ext):
                stem = stem[: -len(ext)]
                break
        for ext in CODE_EXTS:
            if stem.endswith(f"/index"):  # already extension-stripped
                stem = stem[: -len("/index")]
                break

        keys: list[str] = [file_id, stem]
        # Every progressive path suffix of the stem so an import like
        # "object-record/types/ObjectRecord" matches a file under any monorepo
        # root.
        parts = stem.split("/")
        for i in range(1, len(parts)):
            keys.append("/".join(parts[i:]))
        return keys

    for fid in file_ids:
        for k in index_keys(fid):
            suffix_index.setdefault(k, fid)

    def resolve_import(target: str) -> str | None:
        # 1. exact match (rare for this corpus)
        if target in file_ids:
            return target
        # 2. via contains (file::symbol form)
        f = symbol_to_file.get(target)
        if f:
            return f
        # 3. path-ish target: strip aliases, normalise dots, try suffix index
        normalized = target
        # strip common aliases (@/foo, ~/foo)
        if normalized.startswith("@/") or normalized.startswith("~/"):
            normalized = normalized[2:]
        # python-style dots → slashes (only if it doesn't already contain slashes)
        if "/" not in normalized and "." in normalized and not normalized.startswith("."):
            normalized = normalized.replace(".", "/")
        if normalized in suffix_index:
            return suffix_index[normalized]
        # 4. last-segment fallback for path-style imports under any root
        if "/" in normalized:
            parts = normalized.split("/")
            for n_drop in range(1, min(4, len(parts))):
                tail = "/".join(parts[n_drop:])
                if tail in suffix_index:
                    return suffix_index[tail]
        return None

    edges: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()

    def add(src: str, dst: str, rel: str) -> None:
        if src == dst or src not in file_ids or dst not in file_ids:
            return
        key = (src, dst, rel)
        if key in seen:
            return
        seen.add(key)
        edges.append({"from": src, "to": dst, "rel": rel})

    for e in edges_raw:
        rel = e.get("rel")
        src, dst = e.get("from"), e.get("to")
        if not isinstance(src, str) or not isinstance(dst, str):
            continue
        if rel == "references":
            add(src, dst, "references")
        elif rel == "imports":
            resolved = resolve_import(dst)
            if resolved:
                add(src, resolved, "imports")

    # Rank by degree and keep the top max_nodes; drop disconnected stragglers.
    degree: dict[str, int] = {}
    for e in edges:
        degree[e["from"]] = degree.get(e["from"], 0) + 1
        degree[e["to"]] = degree.get(e["to"], 0) + 1

    # Keep all file nodes — connected first, then disconnected — up to cap.
    # Disconnected files render as orphan dots, which is what we want when
    # showing the full repo (e.g. Go imports often resolve to packages we
    # skipped, leaving real source files edgeless).
    ranked = sorted(files, key=lambda n: degree.get(n["id"], 0), reverse=True)
    kept = ranked[:max_nodes]
    kept_ids = {n["id"] for n in kept}
    edges = [e for e in edges if e["from"] in kept_ids and e["to"] in kept_ids]

    nodes = [
        {
            "id": n["id"],
            "path": n.get("path", n["id"]),
            "ext": n.get("ext", ""),
            "size": n.get("size", 0),
            "degree": degree.get(n["id"], 0),
        }
        for n in kept
    ]
    links = [{"source": e["from"], "target": e["to"], "rel": e["rel"]} for e in edges]

    return {
        "nodes": nodes,
        "links": links,
        "meta": {
            "root": raw.get("root", ""),
            "total_nodes": raw.get("node_count", len(nodes_raw)),
            "total_edges": raw.get("edge_count", len(edges_raw)),
            "rendered_nodes": len(nodes),
            "rendered_edges": len(links),
        },
    }


# ---------- broadcast hub ----------

class Hub:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self.clients.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self.clients.discard(ws)

    async def broadcast(self, payload: dict[str, Any]) -> None:
        msg = json.dumps(payload)
        dead: list[WebSocket] = []
        async with self._lock:
            for ws in self.clients:
                try:
                    await ws.send_text(msg)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.clients.discard(ws)


# ---------- app ----------

class HookEvent(BaseModel):
    tool: str                     # Read | Edit | Write | Grep | Glob | Bash | ...
    phase: str = "post"           # pre | post
    paths: list[str] = []         # file paths the tool touched, may include "file::Symbol" form
    symbol: str | None = None     # optional explicit symbol name (else parsed from paths)
    detail: str | None = None     # optional human-readable detail
    ts: float | None = None


def build_app(graph_path: Path, project_root: Path, max_nodes: int = 600) -> FastAPI:
    app = FastAPI(title="GrapeRoot-Viz Bridge")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    state: dict[str, Any] = {"graph": load_graph(graph_path, max_nodes=max_nodes)}
    hub = Hub()

    def normalize(p: str) -> str:
        """Convert absolute paths to graph-relative ids. Preserves ::symbol suffix."""
        sym = ""
        if "::" in p:
            p, sym = p.split("::", 1)
            sym = "::" + sym
        try:
            ap = Path(p).expanduser().resolve()
            if project_root and str(ap).startswith(str(project_root)):
                return str(ap.relative_to(project_root)) + sym
        except Exception:
            pass
        return p + sym

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {"ok": True, "clients": len(hub.clients)}

    @app.get("/graph")
    async def graph() -> dict[str, Any]:
        return state["graph"]

    @app.post("/event")
    async def event(ev: HookEvent) -> dict[str, Any]:
        ev.ts = ev.ts or time.time()
        ev.paths = [normalize(p) for p in ev.paths]
        await hub.broadcast({"type": "event", **ev.model_dump()})
        return {"ok": True, "broadcast_to": len(hub.clients)}

    @app.websocket("/ws")
    async def ws(ws: WebSocket) -> None:
        await hub.connect(ws)
        try:
            await ws.send_text(json.dumps({"type": "hello", "clients": len(hub.clients)}))
            while True:
                # We don't expect inbound messages; this just keeps the socket alive.
                await ws.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            await hub.disconnect(ws)

    return app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--graph", required=True, help="Path to info_graph.json")
    parser.add_argument("--root", default=None, help="Project root (defaults to graph's root field)")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--max-nodes", type=int, default=600,
                        help="cap rendered nodes (default 600)")
    args = parser.parse_args()

    graph_path = Path(args.graph).expanduser().resolve()
    if not graph_path.exists():
        raise SystemExit(f"graph not found: {graph_path}")

    if args.root:
        root = Path(args.root).expanduser().resolve()
    else:
        raw = json.loads(graph_path.read_text())
        root = Path(raw.get("root", os.getcwd())).expanduser().resolve()

    print(f"[bridge] graph: {graph_path}")
    print(f"[bridge] root:  {root}")
    print(f"[bridge] max nodes: {args.max_nodes}")
    print(f"[bridge] http://{args.host}:{args.port}")

    app = build_app(graph_path, root, max_nodes=args.max_nodes)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
