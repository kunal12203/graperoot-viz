"""Indefinite demo emitter — simulates realistic Claude sessions.

Runs a never-ending loop of "sessions". Each session picks a hub file, walks
its neighbourhood via BFS to form a topic cluster, then fires a narrative arc
that uses the full visual vocabulary:

  explore (Read)  →  scan (Grep wave)  →  symbol-level Read
  →  Edit (with hammer)  →  Write (sparkle)  →  Bash test  →  WebFetch

Loops forever. Ctrl-C to stop.
"""
from __future__ import annotations

import json
import random
import sys
import time
import urllib.request
from collections import defaultdict, deque

BRIDGE = "http://127.0.0.1:8765"

# A small bank of plausible symbol names by file extension.
SYMBOLS_BY_EXT = {
    ".ts":  ["handleSubmit", "useStore", "onChange", "render", "buildUrl", "AuthGuard", "RecordSort"],
    ".tsx": ["Component", "Header", "Provider", "useEffect", "DropdownMenu", "FieldInput"],
    ".js":  ["init", "main", "configure", "createServer"],
    ".jsx": ["App", "Layout", "Sidebar"],
    ".py":  ["build_graph", "load_config", "MainHandler", "scan_paths", "run_query"],
    ".go":  ["NewServer", "Handle", "Run", "Config"],
    ".md":  ["Section", "Heading"],
}

DEFAULT_SYMS = ["handleClick", "render", "configure", "init"]


def fetch_graph() -> dict:
    return json.load(urllib.request.urlopen(f"{BRIDGE}/graph"))


def post_event(tool: str, paths: list[str], detail: str | None = None) -> None:
    body = json.dumps({
        "tool": tool, "phase": "post", "paths": paths,
        "detail": detail, "ts": time.time(),
    }).encode()
    req = urllib.request.Request(
        f"{BRIDGE}/event", data=body,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=1).read()
    except Exception as e:
        print(f"  ! post failed: {e}", flush=True)


def build_adj(links: list[dict]) -> dict[str, set[str]]:
    adj: dict[str, set[str]] = defaultdict(set)
    for l in links:
        s = l["source"] if isinstance(l["source"], str) else l["source"]["id"]
        t = l["target"] if isinstance(l["target"], str) else l["target"]["id"]
        adj[s].add(t)
        adj[t].add(s)
    return adj


def cluster_around(anchor: str, adj: dict[str, set[str]], size: int = 14) -> list[str]:
    seen, seen_set, q = [anchor], {anchor}, deque([anchor])
    while q and len(seen) < size:
        cur = q.popleft()
        for nb in adj.get(cur, ()):
            if nb not in seen_set:
                seen_set.add(nb)
                seen.append(nb)
                q.append(nb)
                if len(seen) >= size:
                    break
    return seen


def pick_symbol(file_id: str) -> str:
    ext = "." + file_id.rsplit(".", 1)[-1] if "." in file_id else ""
    bank = SYMBOLS_BY_EXT.get(ext, DEFAULT_SYMS)
    return random.choice(bank)


def short(p: str, n: int = 70) -> str:
    return p if len(p) <= n else "…" + p[-(n - 1):]


def run_session(graph: dict, adj: dict[str, set[str]], i: int) -> None:
    nodes = graph["nodes"]
    pool = sorted(nodes, key=lambda n: n.get("degree", 0), reverse=True)[:80]
    anchor = random.choice(pool)["id"]
    cluster = cluster_around(anchor, adj, size=14)
    if len(cluster) < 6:
        return

    print(f"\n=== session {i} :: {short(anchor)} ===", flush=True)

    # Phase 1 — Read anchor at file level
    print("  ▶ explore", flush=True)
    post_event("Read", [anchor])
    print(f"    Read   {short(anchor)}", flush=True)
    time.sleep(1.0)

    # Phase 2 — Grep wave: many cluster files match the search at once
    print("  ▶ grep wave", flush=True)
    pattern = anchor.split("/")[-1].rsplit(".", 1)[0]
    post_event("Grep", cluster[:6], detail=f"pattern: {pattern}")
    print(f"    Grep   pattern={pattern}  ({len(cluster[:6])} matches)", flush=True)
    time.sleep(1.6)

    # Phase 3 — Symbol-level Reads: open a specific symbol in 2 files
    print("  ▶ inspect symbols", flush=True)
    for f in random.sample(cluster[1:8], k=min(2, len(cluster) - 1)):
        sym = pick_symbol(f)
        post_event("Read", [f"{f}::{sym}"])
        print(f"    Read   {short(f)}::{sym}", flush=True)
        time.sleep(0.9)

    # Phase 4 — Edit (hammer)
    print("  ▶ edit", flush=True)
    target = random.choice(cluster[1:6])
    sym = pick_symbol(target)
    post_event("Edit", [f"{target}::{sym}"], detail="apply fix")
    print(f"    Edit   {short(target)}::{sym}", flush=True)
    time.sleep(1.8)

    # Phase 5 — sometimes Write a new file
    if random.random() < 0.4:
        new_file = target.rsplit(".", 1)[0] + ".test." + target.rsplit(".", 1)[-1]
        post_event("Write", [new_file], detail="new test file")
        print(f"    Write  {short(new_file)}", flush=True)
        time.sleep(1.4)

    # Phase 6 — Bash to "run tests"
    print("  ▶ verify", flush=True)
    post_event("Bash", [], detail="npm test --silent")
    print("    Bash   npm test", flush=True)
    time.sleep(1.5)

    # Phase 7 — occasionally a WebFetch (looking up docs)
    if random.random() < 0.3:
        post_event("WebFetch", [], detail="https://docs.example.com")
        print("    Fetch  docs.example.com", flush=True)
        time.sleep(1.2)


def main() -> None:
    print(f"connecting to {BRIDGE} …", flush=True)
    try:
        graph = fetch_graph()
    except Exception as e:
        print(f"could not fetch graph: {e}", flush=True)
        sys.exit(1)
    adj = build_adj(graph["links"])
    print(f"graph loaded: {len(graph['nodes'])} nodes, {len(graph['links'])} edges", flush=True)
    print("starting demo — Ctrl-C to stop", flush=True)

    i = 0
    while True:
        i += 1
        try:
            run_session(graph, adj, i)
        except KeyboardInterrupt:
            print("\nstopped.", flush=True)
            return
        except Exception as e:
            print(f"  ! session error: {e}", flush=True)
        time.sleep(1.8)


if __name__ == "__main__":
    main()
