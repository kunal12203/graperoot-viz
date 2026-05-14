"""Enterprise bridge — multi-repo workspace viewer.

Reads a workspace directory (the same shape ShareChat-GrapeRoot's engine
produces) and exposes a single JSON graph for the enterprise viewer.

Workspace layout (read-only, never modified):
    <workspace>/
      cross_edges.jsonl                      ← line-delimited CrossRepoEdge
      services.json                          ← optional service overlay
      <repo>/.graperoot/branches/<br>/info_graph.json  ← per-repo graph

The bridge:
  - Walks every distinct ``src_repo`` / ``dst_repo`` referenced in the
    edges, treats each as a service, gives it a stable id
  - Reads each repo's intra-repo info_graph.json if present (so we get
    file nodes + intra-repo edges)
  - Emits a unified {nodes, links} payload where:
      * nodes have ``repo`` + ``service`` fields (for clustering)
      * links have ``rel`` set to the cross_edge ``kind`` (so the viewer
        can color by family) plus ``confidence`` and ``evidence``

Endpoints:
    GET  /graph         {nodes, links, meta}
    GET  /health
    POST /event         no-op for now (no Claude integration in enterprise mode)
    WS   /ws            heartbeat only

Run:
    python server.py --workspace ~/.graperoot/workspaces/test_e2e --port 8766
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
from collections import defaultdict
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn


# ── Edge family classification ────────────────────────────────────────────────
# Used by the viewer for color/style; we forward `family` so the UI doesn't
# need to recognise every kind individually.

FAMILIES: dict[str, str] = {
    # Sync calls
    "grpc_call":     "sync", "grpc_define":  "sync", "grpc_client":   "sync", "grpc_server": "sync",
    "http_call":     "sync",
    "graphql_define":"sync", "graphql_extend":"sync", "graphql_reference":"sync",
    "module_dep":    "sync",
    # Async / messaging
    "kafka_produce": "async", "kafka_consume": "async", "kafka_call": "async",
    "pubsub_produce":"async", "pubsub_consume":"async", "pubsub_call":"async",
    "sqs_produce":   "async", "sqs_consume":   "async", "sqs_call":   "async",
    "sns_produce":   "async", "sns_consume":   "async", "sns_call":   "async",
    "nats_produce":  "async", "nats_consume":  "async", "nats_call":  "async",
    "rabbitmq_produce":"async","rabbitmq_consume":"async","rabbitmq_call":"async",
    "push_shared_topic":"async", "websocket":"async",
    # Shared resources (storage)
    "db_read":           "storage", "db_write":    "storage",
    "cache_read":        "storage", "cache_write": "storage",
    "db_shared_table":   "storage",
    "nosql_shared_collection":"storage",
    "cache_shared_prefix":"storage",
    "storage_shared_bucket":"storage",
    "vector_shared_index":"storage",
    "search_shared_index":"storage",
    "schema_shared_contract":"storage",
    # Control plane
    "config_internal_url":"control", "config_external_url":"control",
    "config_route_match":"control",  "config_webhook_register":"control",
    "config_discovery_resolved":"control",
    "discovery_resolve":"control",   "discovery_resolved":"control",
    "flag_used":"control",           "flag_shared":"control",
    "webhook_register":"control",    "webhook_external":"control", "webhook_subscribed":"control",
    "cron_define":"control",         "cron_shared_name":"control", "cron_shared_schedule":"control",
    "workflow_shared_name":"control",
    "schema_define":"control",       "schema_use":"control",       "schema_registry_referenced":"control",
    "graphql_shared_type":"control",
}


def family_of(kind: str) -> str:
    return FAMILIES.get(kind, "other")


# ── Workspace loader ──────────────────────────────────────────────────────────

def short_repo(p: str) -> str:
    """Take the basename of a repo path — used as the service id."""
    return Path(p).name or p


def load_workspace(workspace: Path, *, max_nodes: int = 1500) -> dict[str, Any]:
    """Build the unified graph.

    Strategy:
      1. Read cross_edges.jsonl → set of repos referenced.
      2. For each repo, optionally read .graperoot/branches/*/info_graph.json
         and pull its file nodes + intra-repo edges.
      3. Build nodes: every (repo, file-id) becomes a node ``{repo}::{file_id}``
         so we can disambiguate same-named files across repos.
      4. Build links: cross-repo edges from cross_edges.jsonl (rel=kind),
         plus intra-repo edges from each info_graph.json (rel=imports/references).
    """
    edges_path = workspace / "cross_edges.jsonl"
    services_path = workspace / "services.json"

    cross_edges: list[dict] = []
    if edges_path.exists():
        with edges_path.open() as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    cross_edges.append(json.loads(line))
                except Exception:
                    pass

    # Discover repos referenced in edges + walk workspace for info_graphs
    repos: set[str] = set()
    for e in cross_edges:
        repos.add(e["src_repo"]); repos.add(e["dst_repo"])

    # Repo metadata + intra-repo edges
    nodes_by_id: dict[str, dict] = {}
    intra_edges: list[dict] = []

    def add_node(repo: str, file_id: str, **extra: Any) -> str:
        repo_short = short_repo(repo)
        nid = f"{repo_short}::{file_id}"
        if nid not in nodes_by_id:
            ext = ""
            if "." in file_id:
                ext = "." + file_id.rsplit(".", 1)[-1].split("/")[-1]
            nodes_by_id[nid] = {
                "id": nid,
                "path": file_id,
                "repo": repo_short,
                "ext": ext,
                "size": 0,
                "degree": 0,
                **extra,
            }
        return nid

    for repo in repos:
        repo_path = Path(repo)
        graph_dir = repo_path / ".graperoot" / "branches"
        intra_path = None
        if graph_dir.is_dir():
            for branch in graph_dir.iterdir():
                cand = branch / "info_graph.json"
                if cand.exists():
                    intra_path = cand
                    break
        if intra_path:
            try:
                g = json.loads(intra_path.read_text())
            except Exception:
                continue
            repo_short = short_repo(repo)
            for n in g.get("nodes", []):
                if n.get("kind") != "file":
                    continue
                add_node(repo, n["id"], ext=n.get("ext", ""), size=n.get("size", 0))
            for e in g.get("edges", []):
                rel = e.get("rel", "")
                if rel not in ("imports", "references"):
                    continue
                src = e.get("from"); dst = e.get("to")
                if not isinstance(src, str) or not isinstance(dst, str):
                    continue
                src_id = f"{short_repo(repo)}::{src}"
                dst_id = f"{short_repo(repo)}::{dst}"
                if src_id in nodes_by_id and dst_id in nodes_by_id:
                    intra_edges.append({
                        "source": src_id, "target": dst_id, "rel": rel,
                        "family": "intra", "confidence": 1.0,
                    })

    # Cross-repo edges — strip line/range suffixes from ids to get the file id
    def strip_id(repo: str, sid: str) -> str:
        # cross_edges sometimes use "file.py:11" or "file::Symbol::route".
        # We collapse to the file form for node matching.
        s = sid
        # drop trailing ":lineno" if present
        head = s.split("::", 1)[0]
        if ":" in head and head.rsplit(":", 1)[-1].isdigit():
            head = head.rsplit(":", 1)[0]
        return f"{short_repo(repo)}::{head}"

    cross_links: list[dict] = []
    for e in cross_edges:
        src_id = strip_id(e["src_repo"], e["src_id"])
        dst_id = strip_id(e["dst_repo"], e["dst_id"])
        # ensure both nodes exist (fall back to create from src_id/dst_id if missing)
        if src_id not in nodes_by_id:
            head = src_id.split("::", 1)[1] if "::" in src_id else src_id
            add_node(e["src_repo"], head)
        if dst_id not in nodes_by_id:
            head = dst_id.split("::", 1)[1] if "::" in dst_id else dst_id
            add_node(e["dst_repo"], head)
        kind = e.get("kind", "module_dep")
        cross_links.append({
            "source": src_id,
            "target": dst_id,
            "rel": kind,
            "family": family_of(kind),
            "confidence": e.get("confidence", 0.5),
            "evidence": e.get("evidence", {}),
        })

    # Compute degrees from links
    deg: dict[str, int] = defaultdict(int)
    for l in cross_links + intra_edges:
        deg[l["source"]] += 1
        deg[l["target"]] += 1
    for nid, n in nodes_by_id.items():
        n["degree"] = deg[nid]

    # Cap nodes by degree, keep all cross-repo node endpoints regardless
    cross_endpoints = {l["source"] for l in cross_links} | {l["target"] for l in cross_links}
    nodes = list(nodes_by_id.values())
    nodes.sort(key=lambda n: (-(n["id"] in cross_endpoints), -n["degree"]))
    kept = nodes[:max_nodes]
    kept_ids = {n["id"] for n in kept}

    links_out = [l for l in (cross_links + intra_edges)
                 if l["source"] in kept_ids and l["target"] in kept_ids]

    # Service overlay (optional)
    services: dict[str, Any] = {}
    if services_path.exists():
        try:
            services = json.loads(services_path.read_text())
        except Exception:
            services = {}

    return {
        "nodes": kept,
        "links": links_out,
        "services": services,
        "meta": {
            "workspace": str(workspace),
            "repos": sorted({n["repo"] for n in kept}),
            "rendered_nodes": len(kept),
            "rendered_edges": len(links_out),
            "total_cross_edges": len(cross_links),
            "total_intra_edges": len(intra_edges),
            "total_nodes": len(nodes_by_id),
        },
    }


# ── App ───────────────────────────────────────────────────────────────────────

def build_app(workspace: Path, *, max_nodes: int) -> FastAPI:
    app = FastAPI(title="GrapeRoot-Viz Enterprise Bridge")
    app.add_middleware(
        CORSMiddleware, allow_origins=["*"],
        allow_methods=["*"], allow_headers=["*"],
    )
    state: dict[str, Any] = {"graph": load_workspace(workspace, max_nodes=max_nodes)}

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {"ok": True, "mode": "enterprise"}

    @app.get("/graph")
    async def graph() -> dict[str, Any]:
        return state["graph"]

    @app.get("/reload")
    async def reload() -> dict[str, Any]:
        state["graph"] = load_workspace(workspace, max_nodes=max_nodes)
        return {"ok": True, "meta": state["graph"]["meta"]}

    @app.websocket("/ws")
    async def ws(ws: WebSocket) -> None:
        await ws.accept()
        try:
            await ws.send_text(json.dumps({"type": "hello", "mode": "enterprise"}))
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            pass

    return app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", required=True,
                        help="Path to ~/.graperoot/workspaces/<id> dir")
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--max-nodes", type=int, default=1500)
    args = parser.parse_args()

    workspace = Path(args.workspace).expanduser().resolve()
    if not workspace.exists():
        raise SystemExit(f"workspace not found: {workspace}")

    print(f"[enterprise-bridge] workspace: {workspace}")
    print(f"[enterprise-bridge] http://{args.host}:{args.port}")

    app = build_app(workspace, max_nodes=args.max_nodes)
    g = load_workspace(workspace)
    print(f"[enterprise-bridge] {len(g['nodes'])} nodes / {len(g['links'])} edges "
          f"across {len(g['meta']['repos'])} repos")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
