export type GraphNode = {
  id: string;
  path: string;
  ext: string;
  size: number;
  degree: number;
  // mutable runtime state
  heat?: number;          // 0..1, decays over time
  lastTouch?: number;     // ms timestamp
  lastToolColor?: number; // hex color of the most recent tool
  // injected by the force-graph engine
  x?: number;
  y?: number;
  z?: number;
};

export type GraphLink = {
  source: string | GraphNode;
  target: string | GraphNode;
  rel: "imports" | "references" | string;
};

export type GraphData = {
  nodes: GraphNode[];
  links: GraphLink[];
  meta: {
    root: string;
    total_nodes: number;
    total_edges: number;
    rendered_nodes: number;
    rendered_edges: number;
  };
};

export type HookEvent = {
  type: "event";
  tool: string;
  phase: "pre" | "post";
  paths: string[];        // entries may be plain "file" or "file::Symbol"
  symbol?: string | null;
  detail?: string | null;
  ts: number;
};

export type HelloMsg = { type: "hello"; clients: number };
export type WsMsg = HookEvent | HelloMsg;

export type Selected =
  | { kind: "node"; node: GraphNode }
  | { kind: "link"; link: GraphLink }
  | null;
