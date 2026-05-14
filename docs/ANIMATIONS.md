# Visual Vocabulary

Every Claude tool maps to a deterministic set of animations on the 3D graph.
The grammar has four primitives — **ring · halo · glyph · packet** — composed
differently per tool plus a per-tool **direction** (does data flow *to* or
*from* Claude?).

## The "Claude" orb

A glowing purple orb is anchored to the camera's right-front. It's always
visible no matter how the user rotates the scene. Every animation that
involves Claude flows through it. It rotates slowly on its own axis and pulses
in time with incoming/outgoing packets.

## The four primitives

| Primitive | What it is                          | Lifetime |
|-----------|-------------------------------------|----------|
| **ring**  | An expanding additive ring on the node, fading 1 → 0 | 1.2s |
| **halo**  | A radial-gradient sprite that bloats around the node | 1.5s |
| **glyph** | A floating emoji sprite that bobs above the node     | 1.4–2.2s |
| **packet**| A small bright sphere flying along an arc between Claude orb and the node | 0.9s |

## Tool grammar

| Tool         | Color   | Glyph | Direction       | Big pulse | Camera fly-to | Notes |
|--------------|---------|-------|-----------------|-----------|---------------|-------|
| **Read**     | `#7aa2f7` blue   | 👁  | node → Claude   |           | only if `symbol` set | "Claude is looking at this file" |
| **Edit**     | `#f7768e` rose   | 🔨  | Claude → node   | ✓         | ✓             | Hammer **swings** (rotation oscillates ±0.6 rad) |
| **Write**    | `#9ece6a` lime   | ✨  | Claude → node   | ✓         | ✓             | Sparkle pop-in for new files |
| **Grep**     | `#e0af68` amber  | 🔍  | node → Claude   |           |               | Multiple matched files pulse together |
| **Glob**     | `#e0af68` amber  | 🌐  | node → Claude   |           |               | Same as Grep but pattern-style |
| **Bash**     | `#a6da95` green  | ⚡  | Claude → node   |           |               | Only animates files referenced in `detail`; otherwise just the side-log |
| **Task**     | `#bb9af7` purple | 🤖  | Claude ↔ node   |           |               | Subagent — bidirectional packets in series |
| **WebFetch** | `#7dcfff` cyan   | 🌍  | external → Claude |         |               | Spawns from edge-of-scene toward Claude |
| **WebSearch**| `#7dcfff` cyan   | 🔎  | external → Claude |         |               | Same as WebFetch with different glyph |
| **TodoWrite**| `#cba6f7` lilac  | ✓   | (no graph fx)   |           |               | Side-log only, no node animation |

## Symbol-level resolution

When an event's path is `file.ts::HandleLogin`:

1. The viewer splits at `::`, locates the file node, and adds a glyph
   `::HandleLogin` floating slightly higher than the tool glyph.
2. The camera flies to that node (regardless of tool).
3. The packet is colored by the tool *and* is slightly thicker (scale 1.4×)
   to signal "specific symbol" vs. "whole file".

## Heat blending

Each touched node carries a `heat` (0–1) and `lastTool` (tool name).
- `nodeColor` = `lerp(extColor, toolColor, min(1, heat))`
- `nodeVal`   = `log2(degree+2) * (1 + heat·2)`
- `heat *= 0.94` per frame (≈ 1 second to fade)

So a recently-edited file glows rose for ~1s; a recently-grepped file glows
amber for ~1s. The base ext color returns naturally.

## Camera behaviour

- **Auto fly-to** triggers only on Edit, Write, or any event with a `symbol`
  field. Ordinary Reads don't move the camera (would be too jarring).
- Fly-to is a smooth 800ms `cameraPosition` interpolation; it overrides any
  ongoing animation (latest event wins).
- The Claude orb is recomputed each frame from the camera's basis vectors
  (`forward × up`), so it stays glued to the upper-right of the view.

## Visual upgrades to the base graph

The "looking bland" pass:

| Before                    | After                                          |
|---------------------------|------------------------------------------------|
| dark grey background      | radial gradient `#0a0e1c → #03050b`             |
| straight links            | **bezier curves** (`linkCurvature=0.18`)        |
| muted ext palette         | brighter palette (full saturation on dark bg)   |
| no backdrop               | **starfield** of 800 points at radius 1500      |
| no shared focal point     | **Claude orb** — purple sphere + halo + torus   |
| flat node spheres         | additive halo sprite when active                |
| static layout             | gentle scene rotation? (off — too motion-sick)  |

## Future grammar (not yet built)

- **GrapeRoot pre-load** event (when the graph engine *injects* a file into
  context without Claude asking) → cyan packet, no node ring; signals "free
  context".
- **Tool failure** (post-event has `error: true`) → flash red ring, ❌ glyph.
- **Cluster grep** — a single Grep that hits 20 files animates as a wave: each
  matched node fires its ring 50ms after the previous, in BFS order from the
  search root.
- **Diff badge** — Edit's post-event includes `diff: {plus, minus}`; render
  `+12 / -3` as a floating text sprite for 3s.
- **Subagent constellation** — Task spawns a small satellite orb that orbits
  Claude for the agent's lifetime; satellite has its own packets to its own
  files, tinted by agent type.
