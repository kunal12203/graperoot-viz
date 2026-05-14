// Edge family → color/style. The bridge classifies each edge's kind
// into a family; the viewer just looks it up.

export const FAMILY_STYLE: Record<string, {
  color: string;
  width: number;
  dashed: boolean;
  label: string;
  description: string;
}> = {
  sync:    { color: "#5cc4ff", width: 1.4, dashed: false, label: "Sync",    description: "gRPC, HTTP, GraphQL, module deps" },
  async:   { color: "#ffb454", width: 1.2, dashed: true,  label: "Async",   description: "Kafka, Pub/Sub, SQS, NATS topics" },
  storage: { color: "#bb9af7", width: 0.9, dashed: false, label: "Storage", description: "Shared DB tables, cache prefixes, buckets, indexes" },
  control: { color: "#7dcfff", width: 0.7, dashed: true,  label: "Control", description: "Discovery, feature flags, webhooks, configs, schemas" },
  intra:   { color: "#3a4a6a", width: 0.4, dashed: false, label: "Intra",   description: "Inside a single repo (imports/references)" },
  other:   { color: "#6b7691", width: 0.6, dashed: false, label: "Other",   description: "Uncategorised cross-repo edges" },
};

// Per-repo color palette. Cycled as repos are seen in the graph.
const REPO_PALETTE = [
  "#7aa2f7", "#9ece6a", "#f7768e", "#e0af68",
  "#bb9af7", "#7dcfff", "#ff9e6e", "#cba6f7",
  "#a6da95", "#f0b46d", "#80b3ff", "#ff8a8a",
];

const repoColorCache = new Map<string, string>();
let next = 0;
export function colorForRepo(repo: string): string {
  let c = repoColorCache.get(repo);
  if (!c) {
    c = REPO_PALETTE[next % REPO_PALETTE.length];
    repoColorCache.set(repo, c);
    next++;
  }
  return c;
}
