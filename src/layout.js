import { NW, NH, RG, NG, PAD } from './state.js';

function median(nums) {
  if (!nums.length) return null;
  const a = [...nums].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * 같은 열(rank) 안에서 부모 Y 중앙값 기준으로 정렬·세로 배치.
 * 한 부모에서 갈라지는 후행이 부모 옆에 위·아래로 펼쳐지게 함.
 */
function placeRankColumn(names, x, spacing, pad, pos, preds) {
  if (!names.length) return;

  // 부모들의 현재 Y로 바리센터 정렬 (왼쪽 열이 이미 배치된 상태)
  const ordered = names.slice().sort((a, b) => {
    const pa = preds.get(a) || [];
    const pb = preds.get(b) || [];
    const ma = median(pa.map(p => pos.get(p)?.y).filter(y => y != null));
    const mb = median(pb.map(p => pos.get(p)?.y).filter(y => y != null));
    if (ma != null && mb != null && ma !== mb) return ma - mb;
    if (ma != null && mb == null) return -1;
    if (ma == null && mb != null) return 1;
    // 같은 주 부모끼리 묶이도록 부모명도 보조 키
    const sa = pa.slice().sort().join(',') || '';
    const sb = pb.slice().sort().join(',') || '';
    return sa.localeCompare(sb) || a.localeCompare(b);
  });

  // 이상 Y: 부모 중앙 (없으면 순서 기반)
  const ideal = new Map();
  ordered.forEach((name, i) => {
    const ps = (preds.get(name) || []).map(p => pos.get(p)?.y).filter(y => y != null);
    const m = median(ps);
    ideal.set(name, m != null ? m : pad + i * spacing);
  });

  // 부모별로 묶어서, 그룹을 부모 Y 중심에 세로 펼침
  const groups = [];
  let curKey = null;
  let bucket = [];
  for (const name of ordered) {
    const ps = preds.get(name) || [];
    const key = ps.slice().sort().join('\0') || `__solo__${name}`;
    if (key !== curKey) {
      if (bucket.length) groups.push(bucket);
      bucket = [name];
      curKey = key;
    } else {
      bucket.push(name);
    }
  }
  if (bucket.length) groups.push(bucket);

  const yMap = new Map();
  let cursor = pad;

  for (const group of groups) {
    const parentYs = [];
    for (const n of group) {
      for (const p of preds.get(n) || []) {
        const py = pos.get(p)?.y;
        if (py != null) parentYs.push(py);
      }
    }
    const center = median(parentYs);
    const blockH = (group.length - 1) * spacing;
    let start;
    if (center != null) {
      start = center - blockH / 2;
    } else {
      start = cursor;
    }
    // 위쪽 이미 배치된 블록과 겹치지 않게
    if (start < cursor) start = cursor;

    group.forEach((name, i) => {
      yMap.set(name, start + i * spacing);
    });
    cursor = start + group.length * spacing;
  }

  // 간격 유지 (위에서 아래로, 아래에서 위로) — 겹침 제거 + 부모 쪽으로 당김
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < ordered.length; i++) {
      const name = ordered[i];
      let y = yMap.get(name);
      const tgt = ideal.get(name);
      if (tgt != null) y = y * 0.45 + tgt * 0.55;
      if (i > 0) y = Math.max(y, yMap.get(ordered[i - 1]) + spacing);
      yMap.set(name, y);
    }
    for (let i = ordered.length - 2; i >= 0; i--) {
      const name = ordered[i];
      let y = yMap.get(name);
      y = Math.min(y, yMap.get(ordered[i + 1]) - spacing);
      yMap.set(name, y);
    }
  }

  // 전체가 pad 위로 올라가지 않게 평행 이동
  let minY = Infinity;
  for (const y of yMap.values()) minY = Math.min(minY, y);
  const shift = minY < pad ? pad - minY : 0;

  for (const name of ordered) {
    pos.set(name, { x, y: yMap.get(name) + shift });
  }
}

/** @param {{ compact?: boolean }} [opts] */
export function computeLayout(graph, opts = {}) {
  const { jobs, edges } = graph;
  if (!jobs.length) return new Map();

  const compact = !!opts.compact;
  const gapN = compact ? 28 : NG;
  const gapR = compact ? 72 : RG;
  const pad = compact ? 28 : PAD;
  const spacing = NH + gapN;

  const hasOut = new Set();
  const hasIn = new Set();
  for (const e of edges) {
    hasOut.add(e.from);
    hasIn.add(e.to);
  }

  // 선 없는 배치는 우측, 종료(후행 없음)는 위상 rank 유지(부모 옆 분기 잘 보이도록)
  const isolated = [];
  const linked = [];
  for (const j of jobs) {
    const inn = hasIn.has(j.name);
    const out = hasOut.has(j.name);
    if (!inn && !out) isolated.push(j);
    else linked.push(j);
  }

  const pos = new Map();
  let maxX = pad;

  if (linked.length) {
    const layoutNames = new Set(linked.map(j => j.name));
    const layoutEdges = edges.filter(e => layoutNames.has(e.from) && layoutNames.has(e.to));

    const adj = new Map(linked.map(j => [j.name, []]));
    const preds = new Map(linked.map(j => [j.name, []]));
    const indeg = new Map(linked.map(j => [j.name, 0]));
    for (const e of layoutEdges) {
      adj.get(e.from)?.push(e.to);
      preds.get(e.to)?.push(e.from);
      indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
    }

    const rank = new Map(linked.map(j => [j.name, 0]));
    const queue = linked.map(j => j.name).filter(n => !indeg.get(n));
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

    const byRank = new Map();
    for (const j of linked) {
      const r = rank.get(j.name) || 0;
      if (!byRank.has(r)) byRank.set(r, []);
      byRank.get(r).push(j.name);
    }

    const MAX_PER_COL = compact ? 14 : 50;
    let colOffset = 0;

    for (const r of [...byRank.keys()].sort((a, b) => a - b)) {
      const nodes = byRank.get(r);
      // 열이 너무 길면 쪼개되, 같은 부모 그룹이 깨지지 않게 부모 키로 덩어리 분할
      const chunks = [];
      if (nodes.length <= MAX_PER_COL) {
        chunks.push(nodes);
      } else {
        for (let i = 0; i < nodes.length; i += MAX_PER_COL) {
          chunks.push(nodes.slice(i, i + MAX_PER_COL));
        }
      }

      chunks.forEach((chunk, ci) => {
        const x = pad + (colOffset + ci) * (NW + gapR);
        placeRankColumn(chunk, x, spacing, pad, pos, preds);
        maxX = Math.max(maxX, x);
      });
      colOffset += chunks.length;
    }
  }

  // 선 없는 배치는 맨 오른쪽
  if (isolated.length) {
    isolated.sort((a, b) => a.name.localeCompare(b.name));
    const startX = linked.length ? maxX + NW + gapR : pad;
    const MAX_PER_COL = compact ? 14 : 50;
    const cols = Math.max(1, Math.ceil(isolated.length / MAX_PER_COL));
    let idx = 0;
    for (let c = 0; c < cols; c++) {
      const rows = Math.min(MAX_PER_COL, isolated.length - idx);
      for (let r = 0; r < rows; r++) {
        const j = isolated[idx++];
        pos.set(j.name, {
          x: startX + c * (NW + gapR * 0.55),
          y: pad + r * spacing,
        });
      }
    }
  }

  return pos;
}
