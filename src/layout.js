import { NW, NH, RG, NG, PAD } from './state.js';

/** @param {{ compact?: boolean }} [opts] */
export function computeLayout(graph, opts = {}) {
  const { jobs, edges } = graph;
  if (!jobs.length) return new Map();

  const compact = !!opts.compact;
  const gapN = compact ? 22 : NG;
  const gapR = compact ? 72 : RG;
  const pad = compact ? 28 : PAD;

  const hasOut = new Set();
  const hasIn = new Set();
  for (const e of edges) {
    hasOut.add(e.from);
    hasIn.add(e.to);
  }

  // 선 없는 배치 · 종료(후행 없음) 배치는 우측
  const isolated = [];
  const leaves = [];
  const core = [];
  for (const j of jobs) {
    const inn = hasIn.has(j.name);
    const out = hasOut.has(j.name);
    if (!inn && !out) isolated.push(j);
    else if (inn && !out) leaves.push(j);
    else core.push(j);
  }

  const pos = new Map();
  let maxX = pad;

  if (core.length || leaves.length) {
    const layoutJobs = [...core, ...leaves];
    const layoutNames = new Set(layoutJobs.map(j => j.name));
    const layoutEdges = edges.filter(e => layoutNames.has(e.from) && layoutNames.has(e.to));

    const adj = new Map(layoutJobs.map(j => [j.name, []]));
    const indeg = new Map(layoutJobs.map(j => [j.name, 0]));
    for (const e of layoutEdges) {
      adj.get(e.from)?.push(e.to);
      indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
    }

    const rank = new Map(layoutJobs.map(j => [j.name, 0]));
    const queue = layoutJobs.map(j => j.name).filter(n => !indeg.get(n));
    const deg = new Map(indeg);
    let head = 0;
    while (head < queue.length) {
      const n = queue[head++];
      for (const nx of adj.get(n) || []) {
        rank.set(nx, Math.max(rank.get(nx) || 0, (rank.get(n) || 0) + 1));
        const d = (deg.get(nx) || 1) - 1;
        deg.set(nx, d);
        if (d === 0) queue.push(nx);
      }
    }

    // 종료 배치는 항상 최우측 rank
    const finalMax = Math.max(0, ...[...rank.values()]);
    for (const j of leaves) rank.set(j.name, finalMax);

    const byRank = new Map();
    for (const j of layoutJobs) {
      const r = rank.get(j.name) || 0;
      if (!byRank.has(r)) byRank.set(r, []);
      byRank.get(r).push(j.name);
    }

    const MAX_PER_COL = compact ? 12 : 40;
    let colOffset = 0;

    for (const r of [...byRank.keys()].sort((a, b) => a - b)) {
      const nodes = byRank.get(r).slice().sort((a, b) => {
        const ae = hasOut.has(a) ? 0 : 1;
        const be = hasOut.has(b) ? 0 : 1;
        return ae - be || a.localeCompare(b);
      });
      const chunks = [];
      for (let i = 0; i < nodes.length; i += MAX_PER_COL) {
        chunks.push(nodes.slice(i, i + MAX_PER_COL));
      }
      chunks.forEach((chunk, ci) => {
        const x = pad + (colOffset + ci) * (NW + gapR);
        chunk.forEach((name, i) => {
          pos.set(name, { x, y: pad + i * (NH + gapN) });
          maxX = Math.max(maxX, x);
        });
      });
      colOffset += chunks.length;
    }
  }

  // 선 없는 배치는 맨 오른쪽
  if (isolated.length) {
    isolated.sort((a, b) => a.name.localeCompare(b.name));
    const startX = (core.length || leaves.length) ? maxX + NW + gapR : pad;
    const MAX_PER_COL = compact ? 12 : 40;
    const cols = Math.max(1, Math.ceil(isolated.length / MAX_PER_COL));
    let idx = 0;
    for (let c = 0; c < cols; c++) {
      const rows = Math.min(MAX_PER_COL, isolated.length - idx);
      for (let r = 0; r < rows; r++) {
        const j = isolated[idx++];
        pos.set(j.name, {
          x: startX + c * (NW + gapR * 0.55),
          y: pad + r * (NH + gapN),
        });
      }
    }
  }

  return pos;
}
