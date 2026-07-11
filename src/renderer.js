import { S, NW, NH } from './state.js';
import { svg, dagRoot, svgDefs, esc, applyTransform } from './utils.js';

export function renderSVG() {
  const { graph, pos, selected } = S;
  if (!graph) return;

  svgDefs.innerHTML = `
    <marker id="arw"      markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0L0,6L8,3z" fill="#444c56"/></marker>
    <marker id="arw-hi"   markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0L0,6L8,3z" fill="#388bfd"/></marker>
    <marker id="arw-up"   markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0L0,6L8,3z" fill="#d29922"/></marker>
    <marker id="arw-down" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0L0,6L8,3z" fill="#3fb950"/></marker>`;

  const conn = new Set(), hiE = new Set();
  const upstream = new Set(), downstream = new Set();
  // 그룹 필터 중에는 전체 경로 하이라이트/딤을 끄고 해당 그룹만 또렷이 표시
  const pathHi = selected && !S.groupFilter;

  if (pathHi) {
    conn.add(selected);
    const qDown = [selected];
    while (qDown.length) {
      const cur = qDown.shift();
      for (const e of graph.edges) {
        if (e.from === cur && !downstream.has(e.to)) {
          downstream.add(e.to); conn.add(e.to);
          hiE.add(e.from + '→' + e.to);
          qDown.push(e.to);
        }
      }
    }
    const qUp = [selected];
    while (qUp.length) {
      const cur = qUp.shift();
      for (const e of graph.edges) {
        if (e.to === cur && !upstream.has(e.from)) {
          upstream.add(e.from); conn.add(e.from);
          hiE.add(e.from + '→' + e.to);
          qUp.push(e.from);
        }
      }
    }
  }

  const fs = S.focusSet;
  let eH = '', nH = '', lH = '';

  for (const e of graph.edges) {
    if (fs && (!fs.has(e.from) || !fs.has(e.to))) continue;
    const sp = pos.get(e.from), tp = pos.get(e.to);
    if (!sp || !tp) continue;
    const sx = sp.x + NW, sy = sp.y + NH / 2, tx = tp.x, ty = tp.y + NH / 2, mx = (sx + tx) / 2;
    const key = e.from + '→' + e.to, isHi = hiE.has(key), dim = pathHi && !isHi;
    const isUpEdge   = isHi && upstream.has(e.from) && (upstream.has(e.to) || e.to === selected);
    const isDownEdge = isHi && downstream.has(e.to) && (downstream.has(e.from) || e.from === selected);
    const edgeColor  = isUpEdge ? '#d29922' : isDownEdge ? '#3fb950' : '#388bfd';
    const arwId      = isUpEdge ? 'arw-up' : isDownEdge ? 'arw-down' : isHi ? 'arw-hi' : 'arw';
    eH += `<path d="M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}" fill="none" stroke="${isHi ? edgeColor : '#444c56'}" stroke-width="${isHi ? 2.2 : 1.5}" opacity="${dim ? .12 : 1}" marker-end="url(#${arwId})"/>`;
    if (isHi) {
      const lx = (sx + tx) / 2, ly = (sy + ty) / 2, tw = e.cond.length * 5.4 + 14;
      lH += `<rect x="${lx - tw / 2}" y="${ly - 15}" width="${tw}" height="14" rx="3" fill="#0f1117" fill-opacity=".92"/>
             <text x="${lx}" y="${ly - 5}" text-anchor="middle" font-size="9.5" fill="${edgeColor}" font-family="monospace">${esc(e.cond)}</text>`;
    }
  }

  for (const job of graph.jobs) {
    if (fs && !fs.has(job.name)) continue;
    const p = pos.get(job.name); if (!p) continue;
    const isRoot = !graph.edges.some(e => e.to   === job.name);
    const isLeaf = !graph.edges.some(e => e.from === job.name);
    const isSel = job.name === selected, isConn = conn.has(job.name), dim = pathHi && !isConn;
    const isUp = upstream.has(job.name), isDown = downstream.has(job.name);

    const fill   = isSel ? '#1a3a6b' : isUp ? '#2a2000' : isDown ? '#0d2a18' : isRoot ? '#163020' : isLeaf ? '#1a2640' : '#1c2330';
    const stroke = isSel ? '#388bfd' : isUp ? '#d29922' : isDown ? '#3fb950'
                 : (isConn && selected) ? '#388bfd' : isRoot ? '#2ea043' : isLeaf ? '#388bfd' : '#30363d';

    const label   = job.name.length > 25 ? job.name.slice(0, 24) + '…' : job.name;
    const rawMeta = job.desc || '';
    const metaS   = rawMeta.length > 28 ? rawMeta.slice(0, 27) + '…' : rawMeta;
    const groupRaw = job.sub || job.app || job.folder || '';
    const groupS   = groupRaw.length > 28 ? groupRaw.slice(0, 27) + '…' : groupRaw;
    const groupActive = S.groupFilter && groupRaw === S.groupFilter;
    const groupY = p.y + 14;
    const textY = p.y + (groupS ? 32 : 22);
    const metaY = p.y + (groupS ? 46 : 36);
    const infoY = p.y + NH - 10;

    let badges = '', infoLeft = p.x + 8;
    if (job.nodeId) {
      badges += `<text x="${infoLeft}" y="${infoY}" font-size="9" fill="${isSel ? '#ffffffaa' : '#388bfdaa'}" style="pointer-events:none">${esc(job.nodeId.length > 12 ? job.nodeId.slice(0, 11) + '…' : job.nodeId)}</text>`;
      infoLeft += job.nodeId.length > 12 ? 80 : job.nodeId.length * 5.5 + 4;
    }
    if (job.timeFrom) {
      badges += `<text x="${infoLeft}" y="${infoY}" font-size="9" fill="${isSel ? '#ffffffaa' : '#d2992288'}" style="pointer-events:none">${esc(job.timeFrom)}</text>`;
    }
    if (job.inConds.length)  badges += `<text x="${p.x + NW - 52}" y="${infoY}" font-size="9" fill="${isSel ? '#ffffffbb' : '#388bfdaa'}" font-weight="600" style="pointer-events:none">IN ${job.inConds.length}</text>`;
    if (job.outConds.length) badges += `<text x="${p.x + NW - 26}" y="${infoY}" font-size="9" fill="${isSel ? '#ffffffbb' : '#3fb950aa'}" font-weight="600" style="pointer-events:none">OUT ${job.outConds.length}</text>`;

    const nameColor = isSel ? '#fff' : isUp ? '#f0c030' : isDown ? '#56d364' : '#e6edf3';
    const metaColor = isSel ? '#ffffffaa' : isUp ? '#d29922aa' : isDown ? '#3fb950aa' : '#8b949e';
    const groupColor = groupActive ? '#58a6ff' : isSel ? '#79b8ff' : isUp ? '#d29922' : isDown ? '#3fb950' : '#8b949e';

    nH += `<g class="jn" data-job="${esc(job.name)}" style="cursor:pointer" opacity="${dim ? .18 : 1}">
  <rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="${(isSel || isUp || isDown) ? 2 : 1.5}"/>
  ${groupS ? `<text class="jn-group" data-group="${esc(groupRaw)}" x="${p.x + NW / 2}" y="${groupY}" text-anchor="middle" dominant-baseline="middle" font-size="10" font-weight="700" fill="${groupColor}" title="그룹 필터: ${esc(groupRaw)}">${esc(groupS)}</text>` : ''}
  <text x="${p.x + NW / 2}" y="${textY}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="${(isSel || isUp || isDown) ? 700 : 600}" fill="${nameColor}" font-family="monospace" style="pointer-events:none">${esc(label)}</text>
  ${metaS ? `<text x="${p.x + NW / 2}" y="${metaY}" text-anchor="middle" font-size="9" fill="${metaColor}" style="pointer-events:none">${esc(metaS)}</text>` : ''}
  ${badges}
</g>`;
  }

  dagRoot.innerHTML = eH + nH + lH;
}

export function fitView() {
  if (!S.pos || !S.pos.size) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [name, p] of S.pos) {
    if (S.focusSet && !S.focusSet.has(name)) continue;
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + NW); y1 = Math.max(y1, p.y + NH);
  }
  if (x0 === Infinity) return;
  const r = svg.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const pad = 40, sc = Math.min((r.width - pad * 2) / (x1 - x0), (r.height - pad * 2) / (y1 - y0), 1.6);
  S.vt.s = sc;
  S.vt.x = (r.width  - (x1 - x0) * sc) / 2 - x0 * sc;
  S.vt.y = (r.height - (y1 - y0) * sc) / 2 - y0 * sc;
  applyTransform();
}

export function centerOnJob(name) {
  const p = S.pos?.get(name); if (!p) return;
  const r = svg.getBoundingClientRect(); if (!r.width || !r.height) return;
  const targetScale = Math.min(1.4, S.vt.s > 0.8 ? S.vt.s : 1.0);
  S.vt.s = targetScale;
  S.vt.x = (r.width  / 2) - (p.x + NW / 2) * targetScale;
  S.vt.y = (r.height / 2) - (p.y + NH / 2) * targetScale;
  applyTransform();
}
