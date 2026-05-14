export type EnterpriseNode = {
  id: string;       // "<repo>::<file_id>"
  path: string;     // file_id within the repo
  repo: string;     // repo basename
  ext: string;
  size: number;
  degree: number;
  // injected by force-graph
  x?: number; y?: number; z?: number;
};

export type EnterpriseLink = {
  source: string | EnterpriseNode;
  target: string | EnterpriseNode;
  rel: string;          // raw kind, e.g. "http_call", "kafka_produce"
  family: "sync" | "async" | "storage" | "control" | "intra" | "other";
  confidence: number;
  evidence?: Record<string, unknown>;
};

export type EnterpriseGraph = {
  nodes: EnterpriseNode[];
  links: EnterpriseLink[];
  services: Record<string, unknown>;
  meta: {
    workspace: string;
    repos: string[];
    rendered_nodes: number;
    rendered_edges: number;
    total_cross_edges: number;
    total_intra_edges: number;
    total_nodes: number;
  };
};

export type Selected =
  | { kind: "node"; node: EnterpriseNode }
  | { kind: "link"; link: EnterpriseLink }
  | null;
