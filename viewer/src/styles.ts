// One source of truth for every tool's visual treatment.
// See docs/ANIMATIONS.md for the design rationale.

export type ToolStyle = {
  color: number;        // hex (THREE.Color compatible)
  cssColor: string;     // same color as a CSS string (for the side log)
  glyph: string;        // emoji shown above the touched node
  direction: "out" | "in" | "both"; // packet direction relative to Claude orb
  bigPulse: boolean;    // larger heat burst, longer effects
  flyTo: boolean;       // auto-fly camera to this node when fired
  swing: boolean;       // swing the glyph (used for Edit's hammer)
  textHint?: string;    // one-line description shown in the side log
};

const S = (
  color: number,
  glyph: string,
  direction: ToolStyle["direction"],
  opts: Partial<ToolStyle> = {},
): ToolStyle => {
  const cssColor = "#" + color.toString(16).padStart(6, "0");
  return {
    color,
    cssColor,
    glyph,
    direction,
    bigPulse: false,
    flyTo: false,
    swing: false,
    ...opts,
  };
};

export const TOOL_STYLE: Record<string, ToolStyle> = {
  Read:      S(0x7aa2f7, "👁", "out"),
  Edit:      S(0xf7768e, "🔨", "in",  { bigPulse: true, flyTo: true, swing: true, textHint: "edit" }),
  Write:     S(0x9ece6a, "✨", "in",  { bigPulse: true, flyTo: true, textHint: "create" }),
  Grep:      S(0xe0af68, "🔍", "out", { textHint: "search" }),
  Glob:      S(0xe0af68, "🌐", "out", { textHint: "match" }),
  Bash:      S(0xa6da95, "⚡", "in",  { textHint: "shell" }),
  Task:      S(0xbb9af7, "🤖", "both",{ textHint: "subagent" }),
  WebFetch:  S(0x7dcfff, "🌍", "in",  { textHint: "fetch" }),
  WebSearch: S(0x7dcfff, "🔎", "in",  { textHint: "search web" }),
  TodoWrite: S(0xcba6f7, "✓",  "out", { textHint: "todo" }),
};

export function styleFor(tool: string): ToolStyle {
  return TOOL_STYLE[tool] ?? TOOL_STYLE.Read;
}

// Brighter ext palette than v0.1 — punchier on the gradient backdrop.
export const EXT_COLOR: Record<string, string> = {
  ".ts":   "#5cc4ff",
  ".tsx":  "#5cc4ff",
  ".js":   "#ffd966",
  ".jsx":  "#ffd966",
  ".py":   "#80b3ff",
  ".go":   "#33d6ff",
  ".rs":   "#ff9e6e",
  ".rb":   "#ff8a8a",
  ".java": "#f0b46d",
  ".kt":   "#c08cff",
  ".cs":   "#9d8cff",
  ".php":  "#b2a4ff",
  ".swift":"#ff9170",
  ".md":   "#a5b3c0",
  ".json": "#c5b6e0",
  ".yml":  "#c5b6e0",
  ".yaml": "#c5b6e0",
};

export const EXT_DEFAULT = "#9aa6c2";
