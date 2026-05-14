// BM25 over node paths + extension. Built once when the graph loads.
//
// We don't have actual file content here (the graph stores only metadata),
// so the corpus is the path string itself, tokenised on non-alphanumeric
// boundaries and into camelCase + snake_case parts. Queries against
// "loginhandler" match "LoginHandler.tsx" and "login_handler.py" alike.

import type { GraphNode } from "./types";

export type SearchHit = { id: string; path: string; score: number };

type Doc = {
  id: string;
  path: string;
  tokens: string[];
  tf: Map<string, number>;
};

export type SearchIndex = {
  docs: Doc[];
  idf: Map<string, number>;
  avgdl: number;
};

const TOKEN_SPLIT = /[^a-z0-9]+/i;
const CAMEL_SPLIT = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/;

function tokenize(s: string): string[] {
  const parts = s.split(TOKEN_SPLIT).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    out.push(p.toLowerCase());
    for (const c of p.split(CAMEL_SPLIT)) {
      const lc = c.toLowerCase();
      if (lc && lc !== p.toLowerCase()) out.push(lc);
    }
  }
  return out;
}

export function buildIndex(nodes: GraphNode[]): SearchIndex {
  const docs: Doc[] = nodes.map((n) => {
    const tokens = tokenize(n.path);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { id: n.id, path: n.path, tokens, tf };
  });
  const df = new Map<string, number>();
  for (const d of docs) {
    for (const t of new Set(d.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const N = docs.length;
  const idf = new Map<string, number>();
  for (const [t, n] of df) {
    idf.set(t, Math.log(1 + (N - n + 0.5) / (n + 0.5)));
  }
  const avgdl = docs.reduce((s, d) => s + d.tokens.length, 0) / Math.max(1, N);
  return { docs, idf, avgdl };
}

export function search(index: SearchIndex, query: string, limit = 12): SearchHit[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const k1 = 1.5;
  const b = 0.75;

  const scored: SearchHit[] = [];
  for (const d of index.docs) {
    let s = 0;
    for (const t of terms) {
      const tf = d.tf.get(t) ?? 0;
      if (tf === 0) continue;
      const idf = index.idf.get(t) ?? 0;
      const dl = d.tokens.length;
      s += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * dl) / index.avgdl));
    }
    if (s > 0) scored.push({ id: d.id, path: d.path, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
