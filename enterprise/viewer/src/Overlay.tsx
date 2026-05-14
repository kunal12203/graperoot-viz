import type { EnterpriseGraph, EnterpriseLink, EnterpriseNode, Selected } from "./types";
import { FAMILY_STYLE, colorForRepo } from "./styles";

type Props = {
  graph: EnterpriseGraph | null;
  selected: Selected;
  familyFilter: Set<string>;
  onClose: () => void;
  onToggleFamily: (f: string) => void;
};

export function Overlay({
  graph, selected, familyFilter, onClose, onToggleFamily,
}: Props) {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
      fontFamily: "ui-sans-serif, system-ui, -apple-system" }}>

      {/* Header */}
      <div style={glass({ top: 16, left: 16, padding: "12px 16px" })}>
        <div style={{ fontWeight: 700, letterSpacing: 0.4, marginBottom: 6, fontSize: 13 }}>
          GrapeRoot — Enterprise
        </div>
        {graph ? (
          <>
            <div style={SUBTLE}>
              <strong style={NUM}>{graph.meta.repos.length}</strong> repos ·{" "}
              <strong style={NUM}>{graph.meta.rendered_nodes}</strong> files ·{" "}
              <strong style={NUM}>{graph.meta.rendered_edges}</strong> edges
            </div>
            <div style={{ ...SUBTLE_INLINE, marginTop: 4 }}>
              cross-repo: <strong style={NUM}>{graph.meta.total_cross_edges}</strong> ·
              intra: <strong style={NUM}>{graph.meta.total_intra_edges}</strong>
            </div>
            <div style={{ ...SUBTLE_INLINE, marginTop: 6, opacity: 0.5,
              maxWidth: 360, wordBreak: "break-all" }}>
              {graph.meta.workspace}
            </div>
          </>
        ) : (
          <div style={{ ...SUBTLE, opacity: 0.5 }}>Loading workspace…</div>
        )}
      </div>

      {/* Family filter (right side) */}
      <FamilyFilter
        active={familyFilter}
        onToggle={onToggleFamily}
        counts={countByFamily(graph)}
      />

      {/* Repo legend (bottom-left) */}
      {graph && <RepoLegend repos={graph.meta.repos} />}

      {/* Detail panel */}
      {selected && (
        <DetailPanel
          selected={selected}
          onClose={onClose}
        />
      )}
    </div>
  );
}

function countByFamily(graph: EnterpriseGraph | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (!graph) return out;
  for (const l of graph.links) {
    out[l.family] = (out[l.family] ?? 0) + 1;
  }
  return out;
}

export function FamilyFilter({
  active, onToggle, counts,
}: {
  active: Set<string>;
  onToggle: (f: string) => void;
  counts: Record<string, number>;
}) {
  const order = ["sync", "async", "storage", "control", "intra", "other"];
  return (
    <div
      style={{
        ...glass({ top: 16, right: 16, padding: "12px 14px" }),
        width: 240,
        pointerEvents: "auto",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, letterSpacing: 0.4 }}>
        Edge families
      </div>
      {order.map((f) => {
        const s = FAMILY_STYLE[f];
        if (!s || (counts[f] ?? 0) === 0) return null;
        const on = active.has(f);
        return (
          <div
            key={f}
            onClick={() => onToggle(f)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "5px 6px",
              borderRadius: 6,
              cursor: "pointer",
              opacity: on ? 1 : 0.3,
              background: on ? "rgba(255,255,255,0.03)" : "transparent",
            }}
          >
            <span style={{
              width: 22, height: 3, background: s.color, borderRadius: 2,
              flexShrink: 0,
              boxShadow: `0 0 8px ${s.color}80`,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "#e7ebf3" }}>{s.label}</div>
              <div style={{ fontSize: 10, color: "#7d8aa6", overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.description}
              </div>
            </div>
            <span style={{ ...NUM, fontSize: 11 }}>{counts[f]}</span>
          </div>
        );
      })}
    </div>
  );
}

function RepoLegend({ repos }: { repos: string[] }) {
  return (
    <div
      style={{
        ...glass({ bottom: 16, left: 16, padding: "10px 12px" }),
        maxWidth: 280,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 6, letterSpacing: 0.4 }}>
        Repos
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {repos.map((r) => (
          <span key={r} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 8px",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 999,
            fontSize: 10.5, color: "#cdd6f4",
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: 999,
              background: colorForRepo(r),
              boxShadow: `0 0 6px ${colorForRepo(r)}80`,
            }} />
            {r}
          </span>
        ))}
      </div>
    </div>
  );
}

function DetailPanel({
  selected, onClose,
}: {
  selected: Selected;
  onClose: () => void;
}) {
  if (!selected) return null;
  return (
    <div
      style={{
        ...glass({ top: 180, left: 16, padding: "12px 14px" }),
        width: 360,
        maxHeight: "calc(100vh - 220px)",
        overflowY: "auto",
        pointerEvents: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 10 }}>
        <span style={{ fontWeight: 700, letterSpacing: 0.4, fontSize: 13 }}>
          {selected.kind === "node" ? "File" : "Edge"}
        </span>
        <button
          onClick={onClose}
          style={{
            marginLeft: "auto",
            background: "transparent",
            color: "#9aa6c2",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 4,
            padding: "2px 8px",
            cursor: "pointer", fontSize: 11,
          }}
        >Esc</button>
      </div>
      {selected.kind === "node" && <NodeDetail node={selected.node} />}
      {selected.kind === "link" && <LinkDetail link={selected.link} />}
    </div>
  );
}

function NodeDetail({ node }: { node: EnterpriseNode }) {
  return (
    <>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "3px 9px",
        background: colorForRepo(node.repo) + "20",
        border: `1px solid ${colorForRepo(node.repo)}55`,
        borderRadius: 999,
        fontSize: 11, color: "#e7ebf3", marginBottom: 8,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: 999,
          background: colorForRepo(node.repo),
        }} />
        {node.repo}
      </div>
      <div style={{ fontSize: 12, wordBreak: "break-all", color: "#e7ebf3" }}>
        {node.path}
      </div>
      <div style={{ ...SUBTLE, marginTop: 6 }}>
        {node.ext || "—"} · degree <strong style={NUM}>{node.degree}</strong>
      </div>
    </>
  );
}

function LinkDetail({ link }: { link: EnterpriseLink }) {
  const sId = typeof link.source === "string" ? link.source : link.source.id;
  const tId = typeof link.target === "string" ? link.target : link.target.id;
  const f = FAMILY_STYLE[link.family];
  const ev = link.evidence ?? {};
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{
          width: 26, height: 3, background: f?.color, borderRadius: 2,
          boxShadow: `0 0 6px ${f?.color}80`,
        }} />
        <span style={{ fontWeight: 600, color: f?.color, fontSize: 12 }}>{link.rel}</span>
        <span style={{ ...SUBTLE_INLINE, fontSize: 10 }}>{link.family}</span>
        <span style={{ marginLeft: "auto", ...NUM, fontSize: 11 }}>
          {(link.confidence * 100).toFixed(0)}%
        </span>
      </div>

      <div style={LABEL}>Source</div>
      <div style={ROW_PATH}>{sId}</div>

      <div style={{ ...LABEL, marginTop: 10 }}>Target</div>
      <div style={ROW_PATH}>{tId}</div>

      {Object.keys(ev).length > 0 && (
        <>
          <div style={{ ...LABEL, marginTop: 12 }}>Evidence</div>
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 11,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo",
            color: "#cdd6f4",
          }}>
            {Object.entries(ev).map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 6, padding: "1px 0" }}>
                <span style={{ color: "#7d8aa6", minWidth: 92 }}>{k}</span>
                <span style={{ wordBreak: "break-all" }}>{String(v)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ── Style tokens ─────────────────────────────────────────────────────────────

function glass(pos: React.CSSProperties): React.CSSProperties {
  return {
    position: "absolute",
    background: "rgba(10,12,22,0.78)",
    border: "1px solid rgba(150,170,210,0.18)",
    borderRadius: 12,
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    color: "#e6e6e6",
    fontSize: 12.5,
    lineHeight: 1.5,
    ...pos,
  };
}

const SUBTLE: React.CSSProperties = { color: "#9aa6c2", fontSize: 11.5 };
const SUBTLE_INLINE: React.CSSProperties = { color: "#7d8aa6", fontSize: 11 };
const NUM: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  color: "#cdd6f4",
  fontWeight: 600,
};
const LABEL: React.CSSProperties = {
  textTransform: "uppercase", letterSpacing: 1, fontSize: 10,
  color: "#9aa6c2", marginBottom: 4,
};
const ROW_PATH: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo",
  fontSize: 11.5, color: "#9bc1ff",
  wordBreak: "break-all", padding: "3px 0",
};
