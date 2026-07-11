import { S } from './state.js';

export const $ = id => document.getElementById(id);

export const svg     = document.getElementById('diagram');
export const dagRoot = document.getElementById('dag-root');
export const svgDefs = document.getElementById('svg-defs');

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function applyTransform() {
  dagRoot.setAttribute('transform',
    `translate(${S.vt.x},${S.vt.y}) scale(${S.vt.s})`);
}

export function highlightMatch(text, q) {
  if (!q) return esc(text);
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return esc(text);
  return esc(text.slice(0, idx))
    + `<mark style="background:#d2992244;color:inherit;border-radius:2px">${esc(text.slice(idx, idx + q.length))}</mark>`
    + esc(text.slice(idx + q.length));
}
