import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, { ForceGraphMethods } from "react-force-graph-3d";
import * as THREE from "three";
import type { GraphData, GraphLink, GraphNode, HookEvent, Selected, WsMsg } from "./types";
import { Overlay } from "./Overlay";
import { EXT_COLOR, EXT_DEFAULT, styleFor } from "./styles";
import {
  Effect,
  followCamera,
  makeClusterLabel,
  makeGlyph,
  makeHalo,
  makeHubLabel,
  makePacket,
  makeRing,
  makeSpark,
  makeTextSprite,
  tickEffects,
} from "./effects";
import { buildIndex, SearchIndex } from "./search";

const HEAT_DECAY = 0.95;
const PARTICLE_TTL_MS = 1400;

function colorForNode(n: GraphNode): string {
  const heat = n.heat ?? 0;
  const baseCss = EXT_COLOR[n.ext] ?? EXT_DEFAULT;
  if (heat <= 0.005) return baseCss;
  const base = new THREE.Color(baseCss);
  const hot = new THREE.Color(n.lastToolColor ?? 0xff69b4);
  return base.lerp(hot, Math.min(1, heat)).getStyle();
}

export function App() {
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const [data, setData] = useState<GraphData | null>(null);
  const [events, setEvents] = useState<HookEvent[]>([]);
  const [wsState, setWsState] = useState<"connecting" | "open" | "closed">("connecting");
  const [selected, setSelected] = useState<Selected>(null);

  const indexRef = useRef<{
    byPath: Map<string, GraphNode>;
    incoming: Map<string, GraphLink[]>;
    outgoing: Map<string, GraphLink[]>;
    hubThreshold: number;
  } | null>(null);

  const linkParticlesRef = useRef<Map<GraphLink, { count: number; until: number }>>(new Map());
  const effectsRef = useRef<Effect[]>([]);
  const claudeOrbRef = useRef<THREE.Group | null>(null);
  const hubLabelsRef = useRef<Map<string, THREE.Sprite>>(new Map());
  const selectionHaloRef = useRef<THREE.Sprite | null>(null);
  const selectionRingRef = useRef<THREE.Mesh | null>(null);
  const searchIndexRef = useRef<SearchIndex | null>(null);
  const clusterLabelsRef = useRef<Map<string, { label: THREE.Sprite; nodeIds: string[] }>>(new Map());

  // ---- load graph ----
  useEffect(() => {
    fetch("/graph")
      .then((r) => r.json())
      .then((g: GraphData) => {
        const byPath = new Map<string, GraphNode>();
        for (const n of g.nodes) byPath.set(n.path, n);
        const incoming = new Map<string, GraphLink[]>();
        const outgoing = new Map<string, GraphLink[]>();
        for (const l of g.links) {
          const s = typeof l.source === "string" ? l.source : l.source.id;
          const t = typeof l.target === "string" ? l.target : l.target.id;
          (outgoing.get(s) ?? outgoing.set(s, []).get(s)!).push(l);
          (incoming.get(t) ?? incoming.set(t, []).get(t)!).push(l);
        }
        const sortedDeg = g.nodes.map((n) => n.degree).sort((a, b) => b - a);
        const hubThreshold = sortedDeg[Math.min(30, sortedDeg.length - 1)] ?? 1;
        indexRef.current = { byPath, incoming, outgoing, hubThreshold };
        searchIndexRef.current = buildIndex(g.nodes);
        setData(g);
      })
      .catch((e) => console.error("graph load failed", e));
  }, []);

  // ---- websocket ----
  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => setWsState("open");
    ws.onclose = () => setWsState("closed");
    ws.onerror = () => setWsState("closed");
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data) as WsMsg;
      if (msg.type !== "event") return;
      handleEvent(msg);
    };
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function nodePos(n: GraphNode): THREE.Vector3 {
    return new THREE.Vector3(n.x ?? 0, n.y ?? 0, n.z ?? 0);
  }

  function nodeRadius(n: GraphNode): number {
    return Math.max(2, Math.log2((n.degree ?? 1) + 2)) * 4;
  }

  function flyToNode(n: GraphNode, distance = 90) {
    const fg = fgRef.current;
    if (!fg) return;
    const x = n.x, y = n.y, z = n.z;
    if (x == null || y == null || z == null) return;
    const r = Math.max(40, Math.hypot(x, y, z));
    const ratio = 1 + distance / r;
    fg.cameraPosition({ x: x * ratio, y: y * ratio, z: z * ratio }, n as any, 900);
  }

  function spawnShockwave(scene: THREE.Scene, node: GraphNode, color: number, count: number, now: number) {
    for (let i = 0; i < count; i++) {
      const ring = makeRing(color);
      ring.scale.setScalar(0.001);
      scene.add(ring);
      effectsRef.current.push({
        kind: "ring", obj: ring, born: now + i * 240, ttl: 1400, node, r0: 8,
      });
    }
  }

  // ---- creative tool-specific effects at the Claude orb ----

  function spawnBashEffect(scene: THREE.Scene, color: number, now: number) {
    const orb = claudeOrbRef.current;
    if (!orb) return;
    // Triple-shockwave on the orb (lightning-shell feel).
    for (let i = 0; i < 3; i++) {
      const ring = makeRing(color);
      ring.scale.setScalar(0.001);
      scene.add(ring);
      effectsRef.current.push({
        kind: "ring", obj: ring, born: now + i * 180, ttl: 1100,
        node: orb.position as any, r0: 6,
      });
    }
    const halo = makeHalo(color, 1);
    halo.scale.set(0, 0, 1);
    scene.add(halo);
    effectsRef.current.push({
      kind: "halo", obj: halo, born: now, ttl: 900,
      node: orb.position as any, size: 22,
    });
    const glyph = makeGlyph("⚡");
    scene.add(glyph);
    effectsRef.current.push({
      kind: "glyph", obj: glyph, born: now, ttl: 1500,
      node: orb.position as any, offset: 16, swing: false,
    });
  }

  function spawnWebFetchEffect(
    scene: THREE.Scene, color: number, now: number, glyph = "🌍",
  ) {
    const orb = claudeOrbRef.current;
    if (!orb) return;
    // Three packets streaking in from random distant points → orb.
    for (let i = 0; i < 3; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 600;
      const start = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * r,
        Math.sin(phi) * Math.sin(theta) * r,
        Math.cos(phi) * r,
      );
      const pkt = makePacket(color, true);
      scene.add(pkt);
      effectsRef.current.push({
        kind: "packet", obj: pkt, born: now + i * 140, ttl: 1500,
        getFrom: () => start,
        getTo: () => orb.position,
      });
    }
    const halo = makeHalo(color, 1);
    halo.scale.set(0, 0, 1);
    scene.add(halo);
    effectsRef.current.push({
      kind: "halo", obj: halo, born: now + 1200, ttl: 1000,
      node: orb.position as any, size: 26,
    });
    const g = makeGlyph(glyph);
    scene.add(g);
    effectsRef.current.push({
      kind: "glyph", obj: g, born: now, ttl: 1800,
      node: orb.position as any, offset: 16, swing: false,
    });
  }

  function spawnTaskEffect(scene: THREE.Scene, color: number, now: number) {
    const orb = claudeOrbRef.current;
    if (!orb) return;
    // Two satellites orbiting at different radii, opposite phases.
    for (let i = 0; i < 2; i++) {
      const sat = makePacket(color, true);
      scene.add(sat);
      effectsRef.current.push({
        kind: "orbit", obj: sat, born: now, ttl: 3500,
        orb, radius: 24 + i * 8, cycles: 1.6 + i * 0.6, phase: i * Math.PI,
      });
    }
    const g = makeGlyph("🤖");
    scene.add(g);
    effectsRef.current.push({
      kind: "glyph", obj: g, born: now, ttl: 2400,
      node: orb.position as any, offset: 16, swing: false,
    });
  }

  function spawnGenericOrbEffect(scene: THREE.Scene, color: number, glyph: string, now: number) {
    const orb = claudeOrbRef.current;
    if (!orb) return;
    const halo = makeHalo(color, 0.9);
    halo.scale.set(0, 0, 1);
    scene.add(halo);
    effectsRef.current.push({
      kind: "halo", obj: halo, born: now, ttl: 800,
      node: orb.position as any, size: 18,
    });
    const ring = makeRing(color);
    ring.scale.setScalar(0.001);
    scene.add(ring);
    effectsRef.current.push({
      kind: "ring", obj: ring, born: now, ttl: 900,
      node: orb.position as any, r0: 5,
    });
    const g = makeGlyph(glyph);
    scene.add(g);
    effectsRef.current.push({
      kind: "glyph", obj: g, born: now, ttl: 1500,
      node: orb.position as any, offset: 16, swing: false,
    });
  }

  function spawnSparkBurst(scene: THREE.Scene, node: GraphNode, color: number, now: number) {
    for (let i = 0; i < 18; i++) {
      const sp = makeSpark(color);
      sp.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);
      scene.add(sp);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const dir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi),
      );
      effectsRef.current.push({
        kind: "spark", obj: sp, born: now, ttl: 1300, node, dir,
        speed: 35 + Math.random() * 35,
      });
    }
  }

  function handleEvent(ev: HookEvent) {
    setEvents((prev) => [ev, ...prev].slice(0, 60));
    const idx = indexRef.current;
    const fg = fgRef.current;
    if (!idx || !fg) return;
    const scene = fg.scene();
    if (!scene) return;

    const style = styleFor(ev.tool);
    const now = performance.now();
    let firstNodeForFly: GraphNode | null = null;

    // Resolve which paths actually match a visible node.
    const matched: { rawPath: string; node: GraphNode; symbol: string | null }[] = [];
    for (const rawPath of ev.paths) {
      const [filePath, symbolFromPath] = rawPath.split("::");
      const symbol = ev.symbol ?? symbolFromPath ?? null;
      const node = idx.byPath.get(filePath);
      if (node) matched.push({ rawPath, node, symbol });
    }

    // No matched nodes? Fire a tool-specific creative effect on the Claude orb
    // and exit — don't animate any nodes.
    if (matched.length === 0) {
      if (ev.tool === "Bash") spawnBashEffect(scene, style.color, now);
      else if (ev.tool === "WebFetch") spawnWebFetchEffect(scene, style.color, now, "🌍");
      else if (ev.tool === "WebSearch") spawnWebFetchEffect(scene, style.color, now, "🔎");
      else if (ev.tool === "Task") spawnTaskEffect(scene, style.color, now);
      else spawnGenericOrbEffect(scene, style.color, style.glyph, now);
      return;
    }

    for (const { node, symbol } of matched) {

      node.heat = style.bigPulse ? 1.0 : 0.85;
      node.lastTouch = Date.now();
      node.lastToolColor = style.color;

      const ringCount = ev.tool === "Edit" || ev.tool === "Write" ? 5 : 1;
      spawnShockwave(scene, node, style.color, ringCount, now);

      const halo = makeHalo(style.color, 1);
      halo.scale.set(0, 0, 1);
      scene.add(halo);
      effectsRef.current.push({
        kind: "halo", obj: halo, born: now,
        ttl: style.bigPulse ? 2200 : 1500, node, size: 26,
      });

      const glyph = makeGlyph(style.glyph);
      scene.add(glyph);
      effectsRef.current.push({
        kind: "glyph", obj: glyph, born: now,
        ttl: style.bigPulse ? 2600 : 1800,
        node, offset: 22, swing: style.swing,
      });

      if (symbol) {
        const text = makeTextSprite("::" + symbol, style.cssColor);
        scene.add(text);
        effectsRef.current.push({
          kind: "glyph", obj: text, born: now, ttl: 2800,
          node, offset: 36, swing: false,
        });
      }

      if (ev.tool === "Write") spawnSparkBurst(scene, node, style.color, now);

      if (claudeOrbRef.current) {
        const orb = claudeOrbRef.current;
        const big = !!symbol || style.bigPulse;
        const pkt = makePacket(style.color, big);
        scene.add(pkt);
        const direction = style.direction;
        const fromGetter = direction === "in" ? () => orb.position : () => nodePos(node);
        const toGetter = direction === "in" ? () => nodePos(node) : () => orb.position;
        effectsRef.current.push({
          kind: "packet", obj: pkt, born: now, ttl: 1100,
          getFrom: direction === "both" ? () => nodePos(node) : fromGetter,
          getTo: direction === "both" ? () => orb.position : toGetter,
        });
      }

      const links = [
        ...(idx.incoming.get(node.id) ?? []),
        ...(idx.outgoing.get(node.id) ?? []),
      ];
      for (const l of links.slice(0, 12)) {
        linkParticlesRef.current.set(l, { count: 4, until: now + PARTICLE_TTL_MS });
      }

      if (!firstNodeForFly) firstNodeForFly = node;
    }

    if (firstNodeForFly && (style.flyTo || ev.symbol || ev.paths.some((p) => p.includes("::")))) {
      flyToNode(firstNodeForFly);
    }
  }

  // ---- attach scene ornaments + d3 force tuning ----
  useEffect(() => {
    if (!data) return;
    const fg = fgRef.current;
    if (!fg) return;
    const scene = fg.scene();
    if (!scene) return;

    const idx = indexRef.current;

    // No starfield — pure black backdrop, no clutter.
    // No visible Claude orb either; keep an invisible Group as the destination
    // anchor so packets and tool-creative effects still have a target.
    const claudeAnchor = new THREE.Group();
    claudeOrbRef.current = claudeAnchor;
    scene.fog = null;

    // Hub labels — one sprite per top-degree node, positioned each frame in RAF.
    const hubMap = hubLabelsRef.current;
    for (const n of data.nodes) {
      if (idx && n.degree >= idx.hubThreshold) {
        const filename = n.id.split("/").pop() ?? n.id;
        const lbl = makeHubLabel(filename);
        scene.add(lbl);
        hubMap.set(n.id, lbl);
      }
    }

    // Group nodes by 2-segment directory prefix.
    const clusterMap = clusterLabelsRef.current;
    const clusters = new Map<string, string[]>();
    function clusterKey(path: string) {
      const parts = path.split("/");
      return parts.length === 1 ? parts[0]
        : parts.length === 2 ? parts[0]
        : `${parts[0]}/${parts[1]}`;
    }
    for (const n of data.nodes) {
      const k = clusterKey(n.path);
      (clusters.get(k) ?? clusters.set(k, []).get(k)!).push(n.id);
    }
    // Filter out tiny clusters; assign a stable anchor on a Fibonacci sphere.
    const sizedClusters = [...clusters.entries()].filter(([_, ids]) => ids.length >= 8);
    const clusterAnchors = new Map<string, THREE.Vector3>();
    const total = sizedClusters.length;
    const SPHERE_R = Math.max(450, total * 36);   // spacier layout
    for (let i = 0; i < total; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / total);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
      const v = new THREE.Vector3(
        SPHERE_R * Math.sin(phi) * Math.cos(theta),
        SPHERE_R * Math.sin(phi) * Math.sin(theta),
        SPHERE_R * Math.cos(phi),
      );
      clusterAnchors.set(sizedClusters[i][0], v);
    }
    for (const [name, nodeIds] of sizedClusters) {
      const lbl = makeClusterLabel(name);
      const anchor = clusterAnchors.get(name)!;
      // Place the label slightly above the anchor; we won't move it later.
      lbl.position.set(anchor.x, anchor.y + 38, anchor.z);
      scene.add(lbl);
      clusterMap.set(name, { label: lbl, nodeIds });
    }

    // Custom d3 force: pull each node toward its cluster's anchor.
    const clusterForce: any = (() => {
      let nodes: any[] = [];
      const strength = 0.12;
      const f = (alpha: number) => {
        for (const n of nodes) {
          const a = clusterAnchors.get(clusterKey(n.path));
          if (!a) continue;
          n.vx = (n.vx ?? 0) + (a.x - (n.x ?? 0)) * strength * alpha;
          n.vy = (n.vy ?? 0) + (a.y - (n.y ?? 0)) * strength * alpha;
          n.vz = (n.vz ?? 0) + (a.z - (n.z ?? 0)) * strength * alpha;
        }
      };
      f.initialize = (n: any[]) => { nodes = n; };
      return f;
    })();
    (fg as any).d3Force("cluster", clusterForce);

    // Bump camera FAR plane way out so zoom-out doesn't clip the scene.
    // Default is 2000; we use 30000 so the user can pull back without
    // anything vanishing.
    const cam = fg.camera() as THREE.PerspectiveCamera;
    if ((cam as any).isPerspectiveCamera) {
      cam.far = 30000;
      cam.updateProjectionMatrix();
    }

    const charge = fg.d3Force("charge");
    if (charge) (charge as any).strength(-60);          // softer — cluster force will pack groups
    const link = fg.d3Force("link");
    if (link) (link as any).distance(35);               // tighter local connectivity
    fg.d3ReheatSimulation();

    const fitTimer = window.setTimeout(() => fg.zoomToFit?.(1200, 80), 4000);

    return () => {
      window.clearTimeout(fitTimer);
      for (const lbl of hubMap.values()) scene.remove(lbl);
      hubMap.clear();
      for (const { label } of clusterMap.values()) scene.remove(label);
      clusterMap.clear();
      scene.fog = null;
      claudeOrbRef.current = null;
    };
  }, [data]);

  // ---- selection halo + ring (persistent visual marker on the focused node) ----
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const scene = fg.scene();
    if (!scene) return;

    if (selectionHaloRef.current) {
      scene.remove(selectionHaloRef.current);
      selectionHaloRef.current = null;
    }
    if (selectionRingRef.current) {
      scene.remove(selectionRingRef.current);
      selectionRingRef.current.geometry.dispose();
      (selectionRingRef.current.material as THREE.Material).dispose();
      selectionRingRef.current = null;
    }

    if (selected?.kind === "node") {
      const halo = makeHalo(0xffffff, 0.55);
      halo.scale.set(46, 46, 1);
      scene.add(halo);
      selectionHaloRef.current = halo;

      const ring = makeRing(0xffffff);
      ring.scale.setScalar(22);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.85;
      scene.add(ring);
      selectionRingRef.current = ring;
    }
    return () => {
      if (selectionHaloRef.current) scene.remove(selectionHaloRef.current);
      if (selectionRingRef.current) scene.remove(selectionRingRef.current);
      selectionHaloRef.current = null;
      selectionRingRef.current = null;
    };
  }, [selected]);

  // ---- main animation loop ----
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      const idx = indexRef.current;
      const fg = fgRef.current;

      if (idx) {
        for (const n of idx.byPath.values()) {
          if (n.heat && n.heat > 0.001) n.heat *= HEAT_DECAY;
          else if (n.heat) n.heat = 0;
        }
        for (const [link, info] of linkParticlesRef.current) {
          if (now >= info.until) linkParticlesRef.current.delete(link);
        }
        // Position hub labels under their nodes.
        for (const [id, sprite] of hubLabelsRef.current) {
          const n = idx.byPath.get(id);
          if (n && n.x != null && n.y != null && n.z != null) {
            sprite.position.set(n.x, n.y - nodeRadius(n) - 6, n.z);
            sprite.visible = true;
          } else {
            sprite.visible = false;
          }
        }

        // Cluster labels are positioned once at their anchors — no per-frame work.
      }

      if (fg) {
        const scene = fg.scene();
        const camera = fg.camera();
        if (scene && camera) {
          if (claudeOrbRef.current) followCamera(claudeOrbRef.current, camera, now);

          // Track selection halo/ring to its node each frame.
          if (selected?.kind === "node" && idx) {
            const live = idx.byPath.get(selected.node.id);
            if (live && live.x != null && live.y != null && live.z != null) {
              if (selectionHaloRef.current) {
                selectionHaloRef.current.position.set(live.x, live.y, live.z);
              }
              if (selectionRingRef.current) {
                selectionRingRef.current.position.set(live.x, live.y, live.z);
                selectionRingRef.current.lookAt(camera.position);
                // Slow rotation around its facing axis to draw the eye.
                selectionRingRef.current.rotateZ(0.01);
              }
            }
          }

          effectsRef.current = tickEffects(effectsRef.current, scene, camera, now);
        }
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const graphData = useMemo(() => {
    if (!data) return { nodes: [], links: [] };
    return { nodes: data.nodes, links: data.links };
  }, [data]);

  return (
    <>
      {/* Always render — never conditionally mount, because re-mounting the
          library races its internal layout state and crashes on tick. */}
      {(
        <ForceGraph3D
          ref={fgRef}
          graphData={graphData}
          backgroundColor="#03050b"
          showNavInfo={false}
          nodeRelSize={4}
          nodeVal={(n) => {
            const node = n as GraphNode;
            const base = Math.max(1, Math.log2((node.degree ?? 1) + 2));
            return base * (1 + (node.heat ?? 0) * 1.5);
          }}
          nodeColor={(n) => colorForNode(n as GraphNode)}
          nodeOpacity={1}
          nodeResolution={24}
          nodeLabel={(n) => {
            const node = n as GraphNode;
            return `<div style="font:12px ui-monospace;background:#0c1020;border:1px solid #2a3245;padding:6px 8px;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.5)">
              ${node.path}<br/>
              <span style="opacity:.65">deg ${node.degree} · ${node.ext || "-"}</span>
            </div>`;
          }}
          onNodeClick={(n) => {
            setSelected({ kind: "node", node: n as GraphNode });
            flyToNode(n as GraphNode);
          }}
          onLinkClick={(l) => setSelected({ kind: "link", link: l as GraphLink })}
          onBackgroundClick={() => setSelected(null)}
          linkColor={() => "rgba(170,200,240,0.55)"}
          linkWidth={1}
          linkCurvature={0.18}
          linkOpacity={0.7}
          linkLabel={(l) => {
            const link = l as GraphLink;
            const sId = typeof link.source === "string" ? link.source : link.source.id;
            const tId = typeof link.target === "string" ? link.target : link.target.id;
            return `<div style="font:11px ui-monospace;background:#0c1020;border:1px solid #2a3245;padding:5px 7px;border-radius:5px">
              <div style="opacity:.65">${link.rel}</div>
              <div>${sId}</div>
              <div style="opacity:.6">→ ${tId}</div>
            </div>`;
          }}
          linkDirectionalArrowLength={3.4}
          linkDirectionalArrowRelPos={0.95}
          linkDirectionalArrowColor={() => "rgba(200,220,255,0.7)"}
          linkDirectionalParticles={(l) =>
            linkParticlesRef.current.get(l as GraphLink)?.count ?? 0
          }
          linkDirectionalParticleSpeed={0.014}
          linkDirectionalParticleColor={(l) => {
            const link = l as GraphLink;
            const a = link.source as any as GraphNode | string;
            const b = link.target as any as GraphNode | string;
            for (const n of [a, b]) {
              const node = typeof n === "string" ? null : n;
              if (node?.heat && node.heat > 0.05 && node.lastToolColor) {
                return "#" + node.lastToolColor.toString(16).padStart(6, "0");
              }
            }
            return "#ff7e9d";
          }}
          linkDirectionalParticleWidth={2.6}
          enableNodeDrag={false}
          warmupTicks={20}
          cooldownTicks={80}
          cooldownTime={5000}
        />
      )}
      <Overlay
        meta={data?.meta}
        wsState={wsState}
        events={events}
        selected={selected}
        index={indexRef.current}
        searchIndex={searchIndexRef.current}
        onClear={() => setEvents([])}
        onClose={() => setSelected(null)}
        onNavigate={(nodeId) => {
          const node = indexRef.current?.byPath.get(nodeId);
          if (!node) return;
          setSelected({ kind: "node", node });
          flyToNode(node);
        }}
        onFocus={(p) => {
          const file = p.split("::")[0];
          const node = indexRef.current?.byPath.get(file);
          if (node) {
            setSelected({ kind: "node", node });
            flyToNode(node);
          }
        }}
      />
    </>
  );
}
