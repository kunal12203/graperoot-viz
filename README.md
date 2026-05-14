# GrapeRoot-Viz

A live 3D knowledge-graph window for [GrapeRoot Pro](../GrapeRoot%20Pro/) that
animates Claude Code's actions in real time. Files pulse when Claude reads or
edits them; particles flow along import edges as context propagates.

```
   .dual-graph/info_graph.json     ┐
                                   │   ┌──────────────┐      ┌────────────────┐
   Claude Code  ── PreToolUse ───► │ → │  bridge.py   │ ───► │   3D viewer    │
                ── PostToolUse ──► │   │ (FastAPI/WS) │      │ (Vite + R3F)   │
                                   ┘   └──────────────┘      └────────────────┘
```

## What's in the box (MVP)

- **`bridge/`** — FastAPI server. Loads `info_graph.json`, exposes `/graph`,
  ingests `/event` POSTs, broadcasts to `/ws`.
- **`viewer/`** — Vite + React + `react-force-graph-3d`. Pulls the graph from
  the bridge, opens a WebSocket, animates node heat + directional particles.
- **`hooks/`** — `emit.py` runs as a Claude Code `PreToolUse`/`PostToolUse`
  hook and POSTs tool events to the bridge. `install.sh` wires it into a
  project's `.claude/settings.json`.

## Quick start

```bash
# 1. install bridge deps
cd bridge
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. start the bridge against a project that already has a dual-graph
python server.py \
  --graph "/path/to/your/project/.dual-graph/info_graph.json" \
  --port 8765

# 3. install viewer deps + run
cd ../viewer
npm install
npm run dev    # opens on http://localhost:5174

# 4. wire hooks into the project you're working on with Claude Code
../hooks/install.sh /path/to/your/project
# now run `claude` inside that project — the viewer lights up as Claude works
```

## How it animates

| Claude action          | What you see                                                |
|------------------------|-------------------------------------------------------------|
| `Read file.ts`         | node pulses red, fades over ~1s                             |
| `Edit file.ts`         | same as Read but the burst is taller (heat=1.0)             |
| Any tool with paths    | red particles flow along incoming + outgoing import edges   |
| Click an event in the side log | camera flies to that node                          |

## Data model

The bridge expects GrapeRoot Pro's `info_graph.json` shape:
- `nodes[]`: `{id, kind: file|symbol, path, ext, size, …}`
- `edges[]`: `{from, to, rel: imports|references|contains|requires}`

For the MVP, the bridge keeps only `kind=file` nodes and `imports|references`
edges, then degree-ranks and caps at 4000 nodes so the browser stays smooth.
The cap is a constant in `bridge/server.py::load_graph`.

## Configuration

| Variable / Flag           | Default               | Purpose                          |
|---------------------------|-----------------------|----------------------------------|
| `--graph`                 | _required_            | path to `info_graph.json`        |
| `--root`                  | from graph's `root`   | project root for path normalisation |
| `--port`                  | `8765`                | bridge HTTP/WS port              |
| `GRAPEROOT_VIZ_URL` (env) | `http://127.0.0.1:8765` | where `emit.py` posts events    |

## See also

- [`docs/ROADMAP.md`](docs/ROADMAP.md) — what's built now and what's planned
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the moving parts and why
