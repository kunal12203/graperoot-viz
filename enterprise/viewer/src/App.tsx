import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, { ForceGraphMethods } from "react-force-graph-3d";
import * as THREE from "three";
import type {
  EnterpriseGraph,
  EnterpriseLink,
  EnterpriseNode,
  Selected,
} from "./types";
import { Overlay, FamilyFilter } from "./Overlay";
import { FAMILY_STYLE, colorForRepo } from "./styles";

// When running inside the Electron app, main.cjs passes ?port=<N> so the
// renderer can reach the bridge server without a Vite proxy.
const BRIDGE_BASE = (() => {
  const p = new URLSearchParams(window.location.search).get("port");
  return p ? `http://127.0.0.1:${p}` : "";
})();

export function App() {
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const [graph, setGraph] = useState<EnterpriseGraph | null>(null);
  const [selected, setSelected] = useState<Selected>(null);
  const [familyFilter, setFamilyFilter] = useState<Set<string>>(
    new Set(["sync", "async", "storage", "control", "intra", "other"]),
  );

  // Per-repo cluster anchors + DOM label refs
  const repoAnchorsRef = useRef<Map<string, THREE.Vector3>>(new Map());
  const repoDomRef = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    fetch(`${BRIDGE_BASE}/graph`)
      .then((r) => r.json())
      .then((g: EnterpriseGraph) => setGraph(g))
      .catch((e) => console.error("graph load failed", e));
  }, []);

  // Compute repo anchors on a Fibonacci sphere for clean cluster separation.
  useEffect(() => {
    if (!graph) return;
    const fg = fgRef.current;
    if (!fg) return;

    // Hi-DPI rendering + filmic tone mapping — applied once when graph is ready
    const renderer = fg.renderer() as THREE.WebGLRenderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const scene = fg.scene();
    if (!scene) return;

    const repos = graph.meta.repos;
    const anchors = new Map<string, THREE.Vector3>();
    const N = Math.max(1, repos.length);
    const R = Math.max(280, N * 90);
    for (let i = 0; i < N; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / N);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
      anchors.set(repos[i], new THREE.Vector3(
        R * Math.sin(phi) * Math.cos(theta),
        R * Math.sin(phi) * Math.sin(theta),
        R * Math.cos(phi),
      ));
    }
    repoAnchorsRef.current = anchors;

    // Pre-position each node near its repo's anchor.
    for (const n of graph.nodes) {
      const a = anchors.get(n.repo);
      if (!a) continue;
      n.x = a.x + (Math.random() - 0.5) * 80;
      n.y = a.y + (Math.random() - 0.5) * 80;
      n.z = a.z + (Math.random() - 0.5) * 80;
    }

    const cam = fg.camera() as THREE.PerspectiveCamera;
    if ((cam as any).isPerspectiveCamera) {
      cam.far = 30000;
      cam.updateProjectionMatrix();
    }

    // Custom force: pull each node to its repo anchor.
    const repoForce: any = (() => {
      let nodes: any[] = [];
      const strength = 0.14;
      const f = (alpha: number) => {
        for (const n of nodes) {
          const a = anchors.get(n.repo);
          if (!a) continue;
          n.vx = (n.vx ?? 0) + (a.x - (n.x ?? 0)) * strength * alpha;
          n.vy = (n.vy ?? 0) + (a.y - (n.y ?? 0)) * strength * alpha;
          n.vz = (n.vz ?? 0) + (a.z - (n.z ?? 0)) * strength * alpha;
        }
      };
      f.initialize = (n: any[]) => { nodes = n; };
      return f;
    })();
    (fg as any).d3Force("repo", repoForce);

    const charge = fg.d3Force("charge");
    if (charge) (charge as any).strength(-90);
    const link = fg.d3Force("link");
    if (link) (link as any).distance(40);
    fg.d3ReheatSimulation();

    setTimeout(() => fg.zoomToFit?.(1200, 120), 3500);
  }, [graph]);

  // RAF — project each repo anchor to screen and place its label div there.
  useEffect(() => {
    if (!graph) return;
    let raf = 0;
    const v = new THREE.Vector3();
    const camPos = new THREE.Vector3();
    const loop = () => {
      const fg = fgRef.current;
      if (fg) {
        const camera = fg.camera() as THREE.PerspectiveCamera;
        const renderer = fg.renderer();
        if (camera && renderer) {
          const w = renderer.domElement.clientWidth;
          const h = renderer.domElement.clientHeight;
          camPos.copy(camera.position);
          for (const [repo, anchor] of repoAnchorsRef.current.entries()) {
            const div = repoDomRef.current.get(repo);
            if (!div) continue;
            v.copy(anchor).project(camera);
            if (v.z > 1) { div.style.display = "none"; continue; }
            const sx = (v.x * 0.5 + 0.5) * w;
            const sy = (-v.y * 0.5 + 0.5) * h;
            const dist = camPos.distanceTo(anchor);
            const scale = Math.max(0.55, Math.min(1.4, 700 / Math.max(60, dist)));
            div.style.display = "block";
            div.style.transform =
              `translate(-50%, -50%) translate(${sx}px, ${sy}px) scale(${scale.toFixed(2)})`;
            div.style.opacity = scale < 0.65 ? "0.6" : "1";
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [graph]);

  // Esc deselects
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && selected) setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  function flyToNode(n: EnterpriseNode) {
    const fg = fgRef.current;
    if (!fg || n.x == null) return;
    const r = Math.max(50, Math.hypot(n.x, n.y!, n.z!));
    const ratio = 1 + 100 / r;
    fg.cameraPosition({ x: n.x * ratio, y: n.y! * ratio, z: n.z! * ratio },
      { x: n.x, y: n.y, z: n.z } as any, 1100);
  }

  const graphData = useMemo(() => {
    if (!graph) return { nodes: [], links: [] };
    const links = graph.links.filter((l) => familyFilter.has(l.family));
    return { nodes: graph.nodes, links };
  }, [graph, familyFilter]);

  return (
    <>
      {(
        <ForceGraph3D
          ref={fgRef}
          graphData={graphData}
          backgroundColor="#03050b"
          showNavInfo={false}
          rendererConfig={{ antialias: true, powerPreference: "high-performance" }}
          nodeRelSize={3.5}
          nodeResolution={32}
          nodeVal={(n) => {
            const node = n as EnterpriseNode;
            const sel = selected?.kind === "node" && selected.node.id === node.id ? 1 : 0;
            const base = Math.max(1.2, Math.log2((node.degree ?? 1) + 2));
            return base * (1 + sel * 3);
          }}
          nodeColor={(n) => {
            const node = n as EnterpriseNode;
            if (selected?.kind === "node" && selected.node.id === node.id) return "#ef4444";
            return colorForRepo(node.repo);
          }}
          nodeOpacity={1}
          nodeLabel={(n) => {
            const node = n as EnterpriseNode;
            return `<div style="font:12px ui-monospace;background:#0c1020;border:1px solid #2a3245;padding:6px 8px;border-radius:6px">
              <span style="color:${colorForRepo(node.repo)};font-weight:600">${node.repo}</span><br/>
              <span style="opacity:.85">${node.path}</span><br/>
              <span style="opacity:.6">deg ${node.degree}${node.ext ? " · " + node.ext : ""}</span>
            </div>`;
          }}
          onNodeClick={(n) => {
            const node = n as EnterpriseNode;
            setSelected({ kind: "node", node });
            flyToNode(node);
          }}
          onLinkClick={(l) => setSelected({ kind: "link", link: l as EnterpriseLink })}
          onBackgroundClick={() => setSelected(null)}
          linkColor={(l) => {
            const link = l as EnterpriseLink;
            return FAMILY_STYLE[link.family]?.color ?? "#9aa6c2";
          }}
          linkWidth={(l) => {
            const link = l as EnterpriseLink;
            const w = FAMILY_STYLE[link.family]?.width ?? 0.6;
            return w * (0.5 + (link.confidence ?? 0.5));
          }}
          linkOpacity={0.7}
          linkCurvature={(l) => ((l as EnterpriseLink).family === "intra" ? 0.05 : 0.2)}
          linkLabel={(l) => {
            const link = l as EnterpriseLink;
            const sId = typeof link.source === "string" ? link.source : link.source.id;
            const tId = typeof link.target === "string" ? link.target : link.target.id;
            const f = FAMILY_STYLE[link.family];
            return `<div style="font:11px ui-monospace;background:#0c1020;border:1px solid #2a3245;padding:6px 8px;border-radius:6px;max-width:340px">
              <span style="color:${f?.color};font-weight:600">${link.rel}</span>
              <span style="opacity:.55"> · ${link.family}</span>
              <span style="opacity:.7;float:right">${(link.confidence * 100).toFixed(0)}%</span>
              <div style="opacity:.85;margin-top:4px;word-break:break-all">${sId}</div>
              <div style="opacity:.6;word-break:break-all">→ ${tId}</div>
            </div>`;
          }}
          linkDirectionalArrowLength={(l) => ((l as EnterpriseLink).family === "intra" ? 0 : 4)}
          linkDirectionalArrowRelPos={0.95}
          linkDirectionalArrowColor={(l) => FAMILY_STYLE[(l as EnterpriseLink).family]?.color ?? "#9aa6c2"}
          enableNodeDrag={false}
          warmupTicks={30}
          cooldownTicks={120}
          cooldownTime={6000}
        />
      )}
      {/* HTML repo labels — projected from each anchor each frame. */}
      {graph && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {graph.meta.repos.map((repo) => (
            <div
              key={repo}
              ref={(el) => {
                if (el) repoDomRef.current.set(repo, el);
                else repoDomRef.current.delete(repo);
              }}
              onClick={(e) => {
                e.stopPropagation();
                // Fly to first node of this repo
                const node = graph.nodes.find((n) => n.repo === repo);
                if (node) flyToNode(node);
              }}
              style={{
                position: "absolute",
                left: 0, top: 0,
                pointerEvents: "auto",
                cursor: "pointer",
                userSelect: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 10px",
                borderRadius: 999,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0.2,
                color: "#fff",
                background: "rgba(8,10,18,0.78)",
                border: `1px solid ${colorForRepo(repo)}80`,
                backdropFilter: "blur(8px)",
                whiteSpace: "nowrap",
                boxShadow: `0 4px 14px rgba(0,0,0,0.5), 0 0 0 1px ${colorForRepo(repo)}30`,
                transition: "background 160ms ease",
              }}
              title={`Fly to ${repo}`}
            >
              <span style={{
                width: 7, height: 7, borderRadius: 999,
                background: colorForRepo(repo),
                boxShadow: `0 0 8px ${colorForRepo(repo)}`,
              }} />
              {repo}
            </div>
          ))}
        </div>
      )}
      <Overlay
        graph={graph}
        selected={selected}
        familyFilter={familyFilter}
        onClose={() => setSelected(null)}
        onToggleFamily={(f) => {
          setFamilyFilter((prev) => {
            const next = new Set(prev);
            if (next.has(f)) next.delete(f); else next.add(f);
            return next;
          });
        }}
      />
    </>
  );
}
