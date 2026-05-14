# Architecture

```
┌─────────────────────┐       hook stdin (JSON tool payload)
│  Claude Code CLI    │ ─────────────────────────────────────┐
│  (.claude/settings) │                                       │
└─────────────────────┘                                       ▼
                                                     ┌──────────────┐
                                                     │ hooks/emit.py│
                                                     │  (POST /event)│
                                                     └──────┬───────┘
                                                            │
                                ┌──────── HTTP /event ──────┘
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  bridge/server.py  (FastAPI + uvicorn, single process)           │
│  ┌────────────────────────┐    ┌────────────────────────────┐    │
│  │ load_graph()           │    │ Hub (WebSocket fanout)     │    │
│  │  - reads info_graph.json│    │  - clients: set[WebSocket] │    │
│  │  - filters to files +   │    │  - broadcast(json)        │    │
│  │    imports/refs         │    └────────────────────────────┘    │
│  │  - degree-ranks, caps   │                                       │
│  └────────────────────────┘                                       │
│  Routes: GET /graph  POST /event  WS /ws  GET /health             │
└──────────────────────────────────────────────────────────────────┘
        ▲                                     │
        │ GET /graph (initial)                │ WS /ws  (live events)
        │                                     ▼
┌──────────────────────────────────────────────────────────────────┐
│  viewer/  (Vite dev server, React 18, three.js via              │
│            react-force-graph-3d)                                 │
│                                                                  │
│   App.tsx                                                        │
│   ├─ fetch /graph on mount  → memoized {nodes, links}            │
│   ├─ open WebSocket /ws     → handleEvent()                      │
│   ├─ requestAnimationFrame  → heat decay + particle expiry       │
│   └─ <ForceGraph3D>                                              │
│        nodeColor   = base ⨯ heat-blend                           │
│        nodeVal     = log2(degree) ⨯ (1 + heat·2)                 │
│        linkParticles ← per-link transient burst                  │
│                                                                  │
│   Overlay.tsx                                                    │
│   ├─ header: ws state, render budget                             │
│   └─ side log: last 60 events, click-to-focus                    │
└──────────────────────────────────────────────────────────────────┘
```

## Why these choices

**Python bridge, not Node.** GrapeRoot Pro is Python. The bridge can later
import directly from `graperoot` instead of re-reading a JSON snapshot.

**FastAPI + a single in-process Hub.** The graph is read-only after load and
events are write-only fanout — no shared mutable state worth a real broker.
If we ever need persistence, swap Hub for a `redis pub/sub` adapter without
touching routes.

**`react-force-graph-3d`, not raw R3F.** Layout, picking, labels, particle
flows, camera-fly-to: all already in the library. Saves ~600 lines for the
MVP. We can drop to react-three-fiber when we need custom shaders or
clustered layouts (see roadmap v0.3+).

**Path normalisation in the bridge, not the viewer.** Hooks see absolute
paths; the graph stores relative ones. Centralising the conversion in one
place means the viewer's lookup map stays trivial.

**Hard cap at 4000 nodes.** A full 100k-node project chokes WebGL force
layouts. Degree-ranking is a defensible heuristic — the highest-degree files
are almost always the ones Claude actually reads. v0.2 will add filter
controls so the user can override.

**Heat as a mutable field on the node object, not React state.** The
force-graph engine reads accessor functions every frame; mutating
`node.heat` and bumping a tick counter is ~100× cheaper than diffing a Map
across 4000 nodes per frame.

## Data flow per event

1. Claude calls a tool (e.g. `Read({file_path: "/abs/foo.ts"})`).
2. Claude Code runs `PreToolUse` hooks → `emit.py pre` gets stdin JSON.
3. `emit.py` POSTs `{tool, phase, paths, detail, ts}` to bridge `/event`.
4. Bridge normalises absolute paths to graph-relative IDs.
5. Bridge fans out to every connected viewer over `/ws`.
6. Viewer's `handleEvent` mutates `node.heat = 1.0` and adds a
   particle entry to the per-link map for incoming + outgoing edges.
7. Next animation frame: `nodeColor` blends red, `nodeVal` swells,
   particles travel along edges. Heat decays by 0.94 per frame.
8. After ~1s, heat ≈ 0; after 1.5s the particle entry expires.

## File layout

```
GrapeRoot-Viz/
├── bridge/
│   ├── server.py           # FastAPI app + Hub + load_graph
│   └── requirements.txt
├── viewer/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts      # proxies /graph /event /ws → bridge
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx
│       ├── App.tsx         # graph + ws + animation loop
│       ├── Overlay.tsx     # header + event log
│       └── types.ts
├── hooks/
│   ├── emit.py             # stdin → POST /event
│   └── install.sh          # patches .claude/settings.json
├── docs/
│   ├── ARCHITECTURE.md
│   └── ROADMAP.md
└── README.md
```
