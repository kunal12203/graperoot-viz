import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphData, GraphLink, GraphNode, HookEvent, Selected } from "./types";
import { styleFor } from "./styles";
import { search, type SearchIndex } from "./search";

type IndexState = {
  byPath: Map<string, GraphNode>;
  incoming: Map<string, GraphLink[]>;
  outgoing: Map<string, GraphLink[]>;
  hubThreshold: number;
} | null;

type Props = {
  meta: GraphData["meta"] | undefined;
  wsState: "connecting" | "open" | "closed";
  events: HookEvent[];
  selected: Selected;
  index: IndexState;
  searchIndex: SearchIndex | null;
  onClear: () => void;
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
  onFocus: (path: string) => void;
};

export function Overlay({
  meta, wsState, events, selected, index, searchIndex,
  onClear, onClose, onNavigate, onFocus,
}: Props) {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background:
            "radial-gradient(ellipse at center, rgba(20,28,55,0.45) 0%, rgba(3,5,11,0) 70%)",
        }}
      />

      <div style={panel({ top: 16, left: 16 })}>
        <div style={{ fontWeight: 700, letterSpacing: 1.2, marginBottom: 4 }}>
          GRAPEROOT-VIZ
        </div>
        {meta ? (
          <>
            <div style={{ opacity: 0.75 }}>
              {meta.rendered_nodes.toLocaleString()} / {meta.total_nodes.toLocaleString()} nodes
              · {meta.rendered_edges.toLocaleString()} / {meta.total_edges.toLocaleString()} edges
            </div>
            <div style={{ opacity: 0.5, fontSize: 11, maxWidth: 360, wordBreak: "break-all" }}>
              {meta.root}
            </div>
          </>
        ) : (
          <div style={{ opacity: 0.6 }}>loading graph…</div>
        )}
        <div style={{ marginTop: 6, fontSize: 11 }}>
          ws:{" "}
          <span style={{
            color: wsState === "open" ? "#9ece6a"
              : wsState === "closed" ? "#f7768e"
              : "#e0af68",
          }}>●</span> {wsState}
        </div>
      </div>

      {selected && (
        <DetailPanel
          selected={selected}
          index={index}
          onClose={onClose}
          onNavigate={onNavigate}
        />
      )}

      <Legend />

      <SearchBar searchIndex={searchIndex} onPick={onFocus} />

      <div
        style={{
          ...panel({ top: 16, right: 16 }),
          width: 340,
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          pointerEvents: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontWeight: 700, letterSpacing: 1.2 }}>
            CLAUDE ACTIVITY
          </span>
          <span style={{ marginLeft: 6, opacity: 0.45, fontSize: 10 }}>
            {events.length}
          </span>
          <button
            onClick={onClear}
            disabled={events.length === 0}
            style={{
              marginLeft: "auto",
              background: "transparent",
              color: events.length === 0 ? "#444" : "#bbb",
              border: "1px solid #2a3245",
              borderRadius: 4,
              padding: "1px 8px",
              cursor: events.length === 0 ? "default" : "pointer",
              fontSize: 11,
              letterSpacing: 0.5,
            }}
            title="clear the activity log"
          >clear</button>
        </div>
        {events.length === 0 && (
          <div style={{ opacity: 0.5, fontSize: 11 }}>
            waiting for hook events…<br />
            <span style={{ opacity: 0.7 }}>
              run <code>hooks/install.sh /path/to/project</code>
            </span>
          </div>
        )}
        {events.map((ev, i) => {
          const s = styleFor(ev.tool);
          return (
            <div
              key={i}
              style={{
                padding: "6px 0",
                borderBottom: "1px solid #161a26",
                opacity: 1 - Math.min(0.7, i * 0.018),
              }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 14 }}>{s.glyph}</span>
                <span style={{ fontWeight: 600, color: s.cssColor }}>{ev.tool}</span>
                {s.textHint && (
                  <span style={{ opacity: 0.45, fontSize: 10 }}>{s.textHint}</span>
                )}
                <span style={{ marginLeft: "auto", opacity: 0.45, fontSize: 10 }}>
                  {ev.phase}
                </span>
              </div>
              {ev.paths.map((p) => {
                const [file, sym] = p.split("::");
                return (
                  <div
                    key={p}
                    onClick={() => onFocus(p)}
                    style={{
                      paddingLeft: 22, cursor: "pointer", opacity: 0.88,
                      wordBreak: "break-all", fontSize: 11,
                    }}
                    title="click to focus + open detail"
                  >
                    {file}
                    {sym && <span style={{ color: s.cssColor, marginLeft: 4 }}>::{sym}</span>}
                  </div>
                );
              })}
              {ev.detail && (
                <div style={{ paddingLeft: 22, opacity: 0.55, fontStyle: "italic", fontSize: 11 }}>
                  {ev.detail}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailPanel({
  selected, index, onClose, onNavigate,
}: {
  selected: Selected;
  index: IndexState;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  if (!selected) return null;

  return (
    <div
      style={{
        ...panel({ top: 130, left: 16 }),
        width: 360,
        maxHeight: "calc(100vh - 160px)",
        overflowY: "auto",
        pointerEvents: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: 700, letterSpacing: 1.2 }}>
          {selected.kind === "node" ? "NODE" : "EDGE"}
        </span>
        <button
          onClick={onClose}
          style={{
            marginLeft: "auto", background: "transparent",
            color: "#bbb", border: "1px solid #2a3245",
            borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 12,
          }}
        >×</button>
      </div>

      {selected.kind === "node" && (
        <NodeDetail node={selected.node} index={index} onNavigate={onNavigate} />
      )}
      {selected.kind === "link" && (
        <LinkDetail link={selected.link} onNavigate={onNavigate} />
      )}
    </div>
  );
}

function NodeDetail({
  node, index, onNavigate,
}: {
  node: GraphNode;
  index: IndexState;
  onNavigate: (id: string) => void;
}) {
  const incoming = index?.incoming.get(node.id) ?? [];
  const outgoing = index?.outgoing.get(node.id) ?? [];

  const since = node.lastTouch ? Math.round((Date.now() - node.lastTouch) / 1000) : null;

  return (
    <>
      <div style={{ wordBreak: "break-all", fontSize: 12, marginBottom: 4 }}>
        {node.path}
      </div>
      <div style={{ opacity: 0.7, fontSize: 11, marginBottom: 8 }}>
        {node.ext || "—"} · degree {node.degree} · {humanSize(node.size)}
      </div>
      {since !== null && (
        <div style={{ opacity: 0.55, fontSize: 11, marginBottom: 8 }}>
          last touched {since}s ago
        </div>
      )}

      <Section
        title={`INCOMING (${incoming.length})`}
        items={incoming.slice(0, 12).map((l) => ({
          id: typeof l.source === "string" ? l.source : l.source.id,
          rel: l.rel,
        }))}
        prefix="←"
        onClick={onNavigate}
      />
      <Section
        title={`OUTGOING (${outgoing.length})`}
        items={outgoing.slice(0, 12).map((l) => ({
          id: typeof l.target === "string" ? l.target : l.target.id,
          rel: l.rel,
        }))}
        prefix="→"
        onClick={onNavigate}
      />
    </>
  );
}

function LinkDetail({
  link, onNavigate,
}: {
  link: GraphLink;
  onNavigate: (id: string) => void;
}) {
  const sId = typeof link.source === "string" ? link.source : link.source.id;
  const tId = typeof link.target === "string" ? link.target : link.target.id;

  return (
    <>
      <div style={{ opacity: 0.7, fontSize: 11, marginBottom: 8 }}>
        rel: <span style={{ color: "#e0af68" }}>{link.rel}</span>
      </div>
      <div style={{ marginBottom: 6 }}>
        <div style={{ opacity: 0.55, fontSize: 10, letterSpacing: 1 }}>SOURCE</div>
        <div
          onClick={() => onNavigate(sId)}
          style={{ wordBreak: "break-all", fontSize: 12, cursor: "pointer", color: "#9bc1ff" }}
        >{sId}</div>
      </div>
      <div>
        <div style={{ opacity: 0.55, fontSize: 10, letterSpacing: 1 }}>TARGET</div>
        <div
          onClick={() => onNavigate(tId)}
          style={{ wordBreak: "break-all", fontSize: 12, cursor: "pointer", color: "#9bc1ff" }}
        >{tId}</div>
      </div>
      <div style={{ opacity: 0.5, fontSize: 10, marginTop: 8 }}>
        click either path to fly to that node
      </div>
    </>
  );
}

function Section({
  title, items, prefix, onClick,
}: {
  title: string;
  items: { id: string; rel: string }[];
  prefix: string;
  onClick: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ opacity: 0.55, fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
        {title}
      </div>
      {items.map((it) => (
        <div
          key={it.id + it.rel}
          onClick={() => onClick(it.id)}
          style={{
            cursor: "pointer", fontSize: 11, padding: "2px 0",
            wordBreak: "break-all", opacity: 0.85,
          }}
          title={`${it.rel} — click to navigate`}
        >
          <span style={{ opacity: 0.5 }}>{prefix}</span>{" "}
          <span style={{ color: "#9bc1ff" }}>{it.id}</span>
        </div>
      ))}
    </div>
  );
}

function SearchBar({
  searchIndex, onPick,
}: {
  searchIndex: SearchIndex | null;
  onPick: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setTimeout(() => inputRef.current?.focus(), 0);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
        setQ("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const results = useMemo(() => {
    if (!searchIndex || q.trim().length < 2) return [];
    return search(searchIndex, q, 10);
  }, [searchIndex, q]);

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          background: "rgba(8,10,18,0.82)",
          border: "1px solid #2a3245",
          borderRadius: 8,
          backdropFilter: "blur(8px)",
          color: "#cdd6f4",
          fontSize: 12,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
        title="open search (Cmd-K)"
      >
        🔍 search <span style={{ opacity: 0.45, marginLeft: 4 }}>⌘K</span>
      </button>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        top: "18%",
        left: "50%",
        transform: "translateX(-50%)",
        width: 520,
        pointerEvents: "auto",
        background: "rgba(8,10,18,0.92)",
        border: "1px solid #2a3245",
        borderRadius: 10,
        backdropFilter: "blur(14px)",
        boxShadow: "0 14px 40px rgba(0,0,0,0.6)",
        overflow: "hidden",
      }}
    >
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => { setQ(e.target.value); setHi(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          else if (e.key === "Enter" && results[hi]) {
            onPick(results[hi].path);
            setOpen(false);
            setQ("");
          }
        }}
        placeholder="search files (BM25 over path tokens)…"
        style={{
          width: "100%",
          padding: "12px 16px",
          background: "transparent",
          border: "none",
          borderBottom: results.length > 0 ? "1px solid #1a1f2e" : "none",
          color: "#e6e6e6",
          fontFamily: "inherit",
          fontSize: 14,
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {results.length > 0 && (
        <div style={{ maxHeight: 360, overflowY: "auto" }}>
          {results.map((r, i) => (
            <div
              key={r.id}
              onClick={() => { onPick(r.path); setOpen(false); setQ(""); }}
              onMouseEnter={() => setHi(i)}
              style={{
                padding: "8px 16px",
                cursor: "pointer",
                background: i === hi ? "rgba(170,200,240,0.08)" : "transparent",
                borderLeft: i === hi ? "3px solid #7aa2f7" : "3px solid transparent",
                fontSize: 12,
                wordBreak: "break-all",
                display: "flex",
                alignItems: "baseline",
                gap: 10,
              }}
            >
              <span style={{ flex: 1 }}>{r.path}</span>
              <span style={{ opacity: 0.45, fontSize: 10, fontVariantNumeric: "tabular-nums" }}>
                {r.score.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
      {q.trim().length >= 2 && results.length === 0 && (
        <div style={{ padding: "8px 16px", opacity: 0.5, fontSize: 12 }}>no matches</div>
      )}
    </div>
  );
}

function Legend() {
  const tools: Array<[string, string]> = [
    ["Read", "👁"],
    ["Edit", "🔨"],
    ["Write", "✨"],
    ["Grep", "🔍"],
    ["Bash", "⚡"],
    ["Task", "🤖"],
  ];
  return (
    <div
      style={{
        ...panel({ bottom: 16, left: 16 }),
        fontSize: 11,
        display: "flex",
        gap: 12,
      }}
    >
      {tools.map(([name, glyph]) => {
        const s = styleFor(name);
        return (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 13 }}>{glyph}</span>
            <span style={{ color: s.cssColor }}>{name}</span>
          </div>
        );
      })}
    </div>
  );
}

function humanSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function panel(pos: React.CSSProperties): React.CSSProperties {
  return {
    position: "absolute",
    padding: "10px 14px",
    background: "rgba(8,10,18,0.82)",
    border: "1px solid #1a1f2e",
    borderRadius: 8,
    backdropFilter: "blur(8px)",
    fontSize: 12,
    lineHeight: 1.5,
    ...pos,
  };
}
