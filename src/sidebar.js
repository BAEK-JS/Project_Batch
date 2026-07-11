import { $ } from './utils.js';
import { S } from './state.js';
import { fitView } from './renderer.js';

const SIDEBAR = { resizing: false, startX: 0, startW: 0, min: 380, max: 900, def: 460 };

export function applySidebarWidth(w) {
  const width = Math.max(SIDEBAR.min, Math.min(SIDEBAR.max, Math.round(w)));
  document.documentElement.style.setProperty('--sidebar-w', width + 'px');
  localStorage.setItem('ctm_sidebar_w', String(width));
  setTimeout(() => { if (S.graph && S.pos) fitView(); }, 0);
}

export function initResizableSidebar() {
  const saved = parseInt(localStorage.getItem('ctm_sidebar_w') || '', 10);
  applySidebarWidth(Number.isFinite(saved) ? saved : SIDEBAR.def);

  const bar = $('sidebar-resizer');
  const side = document.querySelector('.sidebar');
  if (!bar || !side) return;

  bar.addEventListener('dblclick', () => applySidebarWidth(SIDEBAR.def));
  bar.addEventListener('mousedown', e => {
    e.preventDefault();
    SIDEBAR.resizing = true;
    SIDEBAR.startX = e.clientX;
    SIDEBAR.startW = side.getBoundingClientRect().width;
    bar.classList.add('dragging');
    document.body.classList.add('resizing-sidebar');
  });
  document.addEventListener('mousemove', e => {
    if (!SIDEBAR.resizing) return;
    e.preventDefault();
    applySidebarWidth(SIDEBAR.startW + (e.clientX - SIDEBAR.startX));
  });
  document.addEventListener('mouseup', () => {
    if (!SIDEBAR.resizing) return;
    SIDEBAR.resizing = false;
    bar.classList.remove('dragging');
    document.body.classList.remove('resizing-sidebar');
  });
}
