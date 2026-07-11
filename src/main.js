import './style.css';

import { S, API } from './state.js';
import { $, svg, applyTransform } from './utils.js';
import { fitView } from './renderer.js';
import { clearFocus, renderFocusTree, setFocus, bindFocusHandlers } from './focus.js';
import {
  setTab, closeDetail,
  generate, clearAll, openSettings, closeSettings,
  showJobFocusDiagram, showAllDiagram, loadXmlAsJobList, setGroupFilter, toggleGroupPanel, goToGroupPreview,
} from './ui.js';
import { exportExcel } from './excel.js';
import { doSearch } from './search.js';
import { renderAIPane } from './ai.js';
import { SAMPLE } from './sample.js';
import {
  pickXmlFolder, clearXmlFolderList, setAllXmlChecked, loadSelectedXmlFiles,
} from './dirscan.js';
import { initResizableSidebar } from './sidebar.js';

// 포커스 핸들러 연결 (순환 참조 방지)
bindFocusHandlers(showJobFocusDiagram, showAllDiagram, setGroupFilter);

window.closeDetail = closeDetail;
window.setFocus    = setFocus;
window.clearFocus  = clearFocus;
window.closeSettings = closeSettings;

// ── Pan & Zoom ────────────────────────────────────────────────────────────────
svg.addEventListener('wheel', e => {
  e.preventDefault();
  const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const d = e.deltaY < 0 ? 1.12 : .88, ns = Math.max(.1, Math.min(3, S.vt.s * d)), sd = ns / S.vt.s;
  S.vt.x = mx - (mx - S.vt.x) * sd;
  S.vt.y = my - (my - S.vt.y) * sd;
  S.vt.s = ns; applyTransform();
}, { passive: false });

svg.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  S.panStart = { cx: e.clientX, cy: e.clientY, vtx: S.vt.x, vty: S.vt.y }; S.panned = false;
});
document.addEventListener('mousemove', e => {
  if (!S.panStart) return;
  const dx = e.clientX - S.panStart.cx, dy = e.clientY - S.panStart.cy;
  if (!S.panned && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) { S.panned = true; svg.classList.add('panning'); }
  if (S.panned) { S.vt.x = S.panStart.vtx + dx; S.vt.y = S.panStart.vty + dy; applyTransform(); }
});
document.addEventListener('mouseup', e => {
  if (!S.panStart) return;
  const didPan = S.panned; S.panStart = null; S.panned = false; svg.classList.remove('panning');
  if (!didPan) {
    const grp = e.target.closest?.('.jn-group');
    if (grp) {
      const group = grp.getAttribute('data-group');
      if (group) setGroupFilter(group);
      return;
    }
    const jn = e.target.closest?.('.jn');
    if (jn) {
      const name = jn.getAttribute('data-job');
      if (name) showJobFocusDiagram(name);
    }
  }
});

// ── 파일 업로드 ───────────────────────────────────────────────────────────────
const fileInput = $('file-input'), dropzone = $('dropzone');

function restoreDropzone() {
  dropzone.innerHTML = '<span class="dropzone-icon">📂</span><span>XML 파일을 드래그하거나 클릭하여 업로드</span><span style="font-size:11px;color:var(--text3)">.xml 파일 지원</span>';
}

function loadFile(f) {
  if (!f) return;
  if (f.name && !f.name.match(/\.(xml|txt)$/i)) {
    alert('XML 파일(.xml)을 선택해주세요.\n선택한 파일: ' + f.name); return;
  }
  dropzone.innerHTML = `<span class="dropzone-icon">⏳</span><span>읽는 중... ${f.name}</span>`;
  const r = new FileReader();
  r.onerror = () => { restoreDropzone(); alert('파일 읽기 실패: ' + f.name); };
  r.onload = ev => {
    restoreDropzone();
    loadXmlAsJobList(ev.target.result, f.name || '업로드 XML');
    fileInput.value = '';
  };
  r.readAsText(f, 'UTF-8');
}

dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => loadFile(fileInput.files?.[0]));
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('over');
  loadFile(e.dataTransfer.files?.[0]);
});

// ── 버튼 이벤트 ──────────────────────────────────────────────────────────────
$('btn-gen').onclick     = () => { const v = $('xml-input').value.trim(); if (v) generate(v); };
$('btn-clear').onclick   = clearAll;
$('btn-clear2').onclick  = clearAll;
$('btn-back').onclick    = () => setTab('input');
$('btn-fit').onclick     = fitView;
$('btn-zi').onclick      = () => { S.vt.s = Math.min(3, S.vt.s * 1.2); applyTransform(); };
$('btn-zo').onclick      = () => { S.vt.s = Math.max(.1, S.vt.s * .83); applyTransform(); };
$('btn-clear-group').onclick = () => setGroupFilter(null);
$('btn-group-panel').onclick = () => toggleGroupPanel();
$('btn-close-group-panel').onclick = () => toggleGroupPanel(false);
$('btn-group-side-go').onclick = () => goToGroupPreview();
$('btn-group-side-all').onclick = () => setGroupFilter(null);
$('group-side-list').addEventListener('click', e => {
  const btn = e.target.closest?.('[data-group-preview]');
  if (!btn) return;
  const group = btn.getAttribute('data-group-preview');
  if (group) setGroupFilter(group);
});
$('btn-all-view').onclick = clearFocus;
$('btn-sample').onclick  = () => { $('xml-input').value = SAMPLE; generate(SAMPLE); };
$('btn-settings').onclick = openSettings;
$('btn-export-xl').onclick = exportExcel;

// XML 폴더 스캔
$('btn-pick-dir').onclick = pickXmlFolder;
$('btn-clear-dir').onclick = clearXmlFolderList;
$('btn-select-all-xml').onclick = () => setAllXmlChecked(true);
$('btn-unselect-all-xml').onclick = () => setAllXmlChecked(false);
$('btn-load-selected-xml').onclick = loadSelectedXmlFiles;

// 포커스 트리 검색
$('ftree-search').addEventListener('input', e => {
  const q = e.target.value;
  $('ftree-search-clear').style.display = q ? '' : 'none';
  renderFocusTree(q);
});
$('ftree-search-clear').addEventListener('click', () => {
  $('ftree-search').value = '';
  $('ftree-search-clear').style.display = 'none';
  renderFocusTree('');
  $('ftree-search').focus();
});

$('tabs').addEventListener('click', e => { const t = e.target.dataset?.tab; if (t) setTab(t); });

// 배치 목록 클릭 → 바로 포커스 다이어그램
$('job-list').addEventListener('click', e => {
  const item = e.target.closest('.job-item'); if (!item) return;
  const name = item.dataset.job; if (!name) return;
  showJobFocusDiagram(name);
});

$('search-results').addEventListener('click', e => {
  const item = e.target.closest('.sr-item'); if (!item) return;
  const name = item.dataset.job; if (name) showJobFocusDiagram(name);
});
$('btn-search').onclick = doSearch;
$('search-inp').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

$('filter-tree-hdr').addEventListener('click', () => {
  const body = $('filter-tree-body'), hdr = $('filter-tree-hdr');
  const open = body.classList.toggle('open');
  hdr.classList.toggle('open', open);
  hdr.querySelector('.ft-arrow').style.transform = open ? 'rotate(90deg)' : '';
});

$('btn-save-api').onclick = () => {
  const keyVal = $('api-key-inp').value.trim();
  if (keyVal) API.key = keyVal;
  API.baseUrl   = $('api-url-inp').value.trim() || 'https://api.openai.com/v1';
  API.chatModel = $('api-model-sel').value;
  closeSettings();
  if (S.tab === 'ai') renderAIPane();
};
$('btn-del-key').onclick = () => {
  if (!confirm('API 키를 삭제하시겠습니까?')) return;
  API.key = ''; closeSettings();
  if (S.tab === 'ai') renderAIPane();
};

initResizableSidebar();
