# GrapeRoot-Viz — Enterprise (offline)

A multi-repo workspace viewer. Reads the same workspace shape that the
ShareChat-GrapeRoot engine produces (`cross_edges.jsonl` + per-repo
`info_graph.json` + optional `services.json`) and renders it in 3D with
edge taxonomy.

This is **separate** from the single-repo playground:
- `bridge/` — its own FastAPI server on port **8766** (so it can run
  alongside the existing `bridge/` on 8765 without conflict)
- `viewer/` — its own Vite dev server on port **5175**
- Reads only — never modifies workspace contents
- Never touches `GrapeRoot Pro/` or `ShareChat-GrapeRoot/` source

## Quick start

```bash
# 1. Install bridge deps (one-time)
cd enterprise/bridge
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Start the bridge against an existing workspace
python server.py --workspace ~/.graperoot/workspaces/test_e2e --port 8766

# 3. Install + start the viewer (separate terminal)
cd ../viewer
npm install
npm run dev    # → http://localhost:5175
```

## What gets rendered

| Element | Source |
|---|---|
| **Nodes (files)** | per-repo `info_graph.json` if present; otherwise synthesised from edge endpoints |
| **Node color** | per-repo palette (12 colors cycled) |
| **Cross-repo edges** | `cross_edges.jsonl`, colored by **family**: |
|   sync — gRPC, HTTP, GraphQL, module deps | blue solid |
|   async — Kafka, Pub/Sub, SQS, NATS | amber dashed |
|   storage — DB tables, cache prefixes, buckets | purple thin |
|   control — discovery, feature flags, webhooks, configs, schemas | cyan dotted |
| **Intra-repo edges** | imports/references inside one repo | dim grey |
| **Edge thickness** | scaled by `confidence` (0.5×…1.5× the base width per family) |
| **Edge tooltip** | `kind`, family, confidence %, src, dst, raw evidence dict |

## Filtering

The right-side panel lists every edge family present in the workspace
with its count. Click a family to toggle visibility — useful for
narrowing to e.g. only async messaging, or only sync API calls.

## Endpoints

| | |
|---|---|
| `GET /graph`   | full `{nodes, links, services, meta}` payload |
| `GET /reload`  | re-read the workspace dir (when `cross_edges.jsonl` changes) |
| `GET /health`  | sanity |
| `WS  /ws`      | heartbeat (no Claude integration in enterprise mode) |

## Building a workspace

Use ShareChat-GrapeRoot's engine — out of scope for this viewer.

Quick recap of expected layout:

```
~/.graperoot/workspaces/<id>/
├── cross_edges.jsonl
├── services.json          (optional)
└── meta.json              (optional)

<repo>/.graperoot/branches/<branch>/info_graph.json   (optional, per-repo)
```

`cross_edges.jsonl` lines look like:

```json
{"src_repo":"…/payments-svc", "src_id":"handlers.go:142",
 "dst_repo":"…/orders-svc",   "dst_id":"consumer.go:18::orders.created",
 "kind":"kafka_call", "confidence":0.92,
 "evidence":{"topic":"orders.created", "src_file":"handlers.go", "src_line":142}}
```

## Notes

- Node IDs are namespaced as `<repo>::<file_id>` so same-named files
  across repos don't collide.
- The bridge collapses `:lineno` and `::route` suffixes on cross-edge
  endpoints to file-level when matching — keeps the visual readable.
- For very large workspaces, `--max-nodes 1500` (default) keeps the
  browser smooth. Cross-repo edge endpoints are always kept regardless
  of the cap.
