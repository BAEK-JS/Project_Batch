import { S, NW, NH } from './state.js';
import { svg } from './utils.js';

function scopeSuffix() {
  const parts = [];
  if (S.focusName) parts.push(S.focusName);
  if (S.groupFilter) parts.push(S.groupFilter);
  if (!parts.length && S.viewGraph) parts.push('부분');
  return parts.length ? '_' + parts.join('_').replace(/[\\/:*?"<>|]/g, '-') : '';
}

/** 현재 화면에 그려진 다이어그램을 SVG 파일로 저장 */
export function exportDiagramSvg() {
  if (!S.pos?.size || !svg) {
    alert('내보낼 다이어그램이 없습니다.');
    return;
  }

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [, p] of S.pos) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + NW);
    y1 = Math.max(y1, p.y + NH);
  }
  if (!Number.isFinite(x0)) {
    alert('내보낼 다이어그램이 없습니다.');
    return;
  }

  const pad = 48;
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);

  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.removeAttribute('style');
  clone.removeAttribute('class');
  clone.setAttribute('width', String(Math.round(w)));
  clone.setAttribute('height', String(Math.round(h)));
  clone.setAttribute('viewBox', `${x0} ${y0} ${w} ${h}`);

  // 화면 팬/줌 제거 → 절대 좌표 그대로
  const root = clone.querySelector('#dag-root');
  if (root) root.setAttribute('transform', '');

  // 배경
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', String(x0));
  bg.setAttribute('y', String(y0));
  bg.setAttribute('width', String(w));
  bg.setAttribute('height', String(h));
  bg.setAttribute('fill', '#0f1117');
  clone.insertBefore(bg, clone.firstChild);

  let xml = new XMLSerializer().serializeToString(clone);
  if (!/^<\?xml/.test(xml)) {
    xml = `<?xml version="1.0" encoding="UTF-8"?>\n` + xml;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ControlM_다이어그램_${stamp}${scopeSuffix()}.svg`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
