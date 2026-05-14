# Roadmap

## v0.1 — MVP (this commit)

- [x] Bridge: load `info_graph.json`, serve `/graph`, ingest `/event`, broadcast `/ws`
- [x] Viewer: 3D force graph, node heat-pulse on tool events, particle flow on edges
- [x] Hooks: `PreToolUse` + `PostToolUse` emitter, one-shot installer
- [x] Side log of recent Claude activity, click-to-focus camera
- [x] Path normalisation (absolute → graph-relative)

## v0.2 — make it actually pleasant

- [ ] **Auto-detect graph** — if no `--graph` flag, walk up from CWD and find
      the nearest `.dual-graph/info_graph.json`.
- [ ] **Hot-reload graph** — watch `info_graph.json` mtime; re-broadcast a
      `graph_replaced` message and let the viewer diff in new nodes/edges.
- [ ] **Symbol-level granularity** — when `tool_input` includes line numbers
      (Read/Edit), light up the matching `file::symbol` node, not just the file.
- [ ] **Filter panel** — toggle by file extension, by directory, by edge
      relation. Persist via URL hash.
- [ ] **Better labels** — only show labels on hot/recent/hovered nodes;
      everything else stays clean.

## v0.3 — narrative & replay

- [ ] **Session replay** — bridge appends every event to
      `.dual-graph/viz-events.ndjson`; viewer has a scrub bar to replay a
      session at variable speed.
- [ ] **Heatmap mode** — accumulate touch counts across the session, colour
      nodes by frequency. "Where did Claude actually spend its time?"
- [ ] **Cost overlay** — read `chat_action_graph.json` (already tracks token
      spend per turn) and show $ cost ticking up next to each touched cluster.
- [ ] **Diff view** — when an Edit lands, briefly project a +N/-N badge on the
      node.

## v0.4 — multi-source signals

- [ ] **GrapeRoot pre-load events** — emit a separate event when GrapeRoot
      *injects* a file into context (vs. when Claude actively reads). Render
      these as a different colour (cyan) so you can see "free" context vs.
      tool-driven context.
- [ ] **Token-counter integration** — pull live stats from
      `mcp__token-counter__get_session_stats` into a footer HUD.
- [ ] **MCP server bus** — also subscribe to other MCP server tool calls, not
      just Claude Code's built-ins.

## v0.5 — distribution

- [ ] **Single-binary launcher** — bundle the bridge + viewer behind one
      `graperoot-viz` command that builds the graph if missing, starts both,
      and opens the browser.
- [ ] **Electron wrap** — system-tray app with always-on-top option for
      pair-programming use.
- [ ] **VS Code extension** — same viewer in a side panel, talks to the same
      bridge.

## v1.0 — collaborative & temporal

- [ ] **Multi-agent view** — when several Claude sessions share a project,
      show each agent as its own coloured emitter. Watch them step on each
      other's toes in real time.
- [ ] **History scrub by commit** — load graphs from past commits and slide
      between them; see how the codebase shape evolved.
- [ ] **"Why did Claude touch this?"** — hover a recently-pulsed node and see
      the chain of pre-load decisions that landed it in context.

## Things explicitly NOT on the roadmap

- Cloud-hosted viewer — all data stays local, by design.
- Editing code from the viewer — read-only window into Claude's behaviour.
- Auth / multi-tenant — single-user dev tool.
