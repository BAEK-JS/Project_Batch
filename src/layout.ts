import type { ParsedGraph } from "./types";

const NODE_W = 200;
const NODE_H = 72;
const RANK_GAP = 120;
const NODE_GAP = 60;
const PAD = 40;

/**
 * Compute layered (Sugiyama-style) layout positions for a DAG.
 * Returns a map of jobName → { x, y }.
 */
export function computeLayout(
  graph: ParsedGraph
): Map<string, { x: number; y: number }> {
  const { jobs, edges } = graph;
  if (jobs.length === 0) return new Map();

  // ── 1. Assign ranks (longest path from root) ──
  const inDegree = new Map<string, number>(jobs.map((j) => [j.name, 0]));
  const adjOut = new Map<string, string[]>(jobs.map((j) => [j.name, []]));

  for (const edge of edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    adjOut.get(edge.from)?.push(edge.to);
  }

  // Kahn's topological sort + rank assignment
  const rank = new Map<string, number>(jobs.map((j) => [j.name, 0]));
  const queue: string[] = [];
  const deg = new Map(inDegree);

  for (const [name, d] of deg) {
    if (d === 0) queue.push(name);
  }

  let head = 0;
  while (head < queue.length) {
    const node = queue[head++];
    for (const next of adjOut.get(node) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(node) ?? 0) + 1));
      const newDeg = (deg.get(next) ?? 1) - 1;
      deg.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }

  // Nodes not reached (part of cycles) — assign rank 0
  for (const job of jobs) {
    if (!rank.has(job.name)) rank.set(job.name, 0);
  }

  // ── 2. Group by rank ──
  const byRank = new Map<number, string[]>();
  for (const job of jobs) {
    const r = rank.get(job.name) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(job.name);
  }

  // ── 3. Position nodes ──
  const positions = new Map<string, { x: number; y: number }>();
  const sortedRanks = [...byRank.keys()].sort((a, b) => a - b);

  for (const r of sortedRanks) {
    const nodes = byRank.get(r)!;
    const x = PAD + r * (NODE_W + RANK_GAP);
    const totalH = nodes.length * NODE_H + (nodes.length - 1) * NODE_GAP;
    let y = PAD + (nodes.length > 1 ? 0 : 0);

    // Center vertically relative to the tallest rank
    const maxCount = Math.max(...[...byRank.values()].map((v) => v.length));
    const maxH = maxCount * NODE_H + (maxCount - 1) * NODE_GAP;
    y = PAD + (maxH - totalH) / 2;

    nodes.forEach((name, i) => {
      positions.set(name, {
        x,
        y: y + i * (NODE_H + NODE_GAP),
      });
    });
  }

  return positions;
}

export { NODE_W, NODE_H };
