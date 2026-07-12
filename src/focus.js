import { S } from './state.js';
import { $, esc, highlightMatch } from './utils.js';

export let ftreeQuery = '';

let _onFocusJob = null;
let _onClearFocus = null;

/** main.js에서 showJobFocusDiagram / showAllDiagram 연결 */
export function bindFocusHandlers(onFocus, onClear) {
  _onFocusJob = onFocus;
  _onClearFocus = onClear;
}

export function buildReachableSet(name) {
  const g = S.graph; if (!g) return new Set();
  const set = new Set([name]);
  const qD = [name];
  while (qD.length) {
    const c = qD.shift();
    for (const e of g.edges) if (e.from === c && !set.has(e.to)) { set.add(e.to); qD.push(e.to); }
  }
  const qU = [name];
  while (qU.length) {
    const c = qU.shift();
    for (const e of g.edges) if (e.to === c && !set.has(e.from)) { set.add(e.from); qU.push(e.from); }
  }
  return set;
}

export function setFocus(name) {
  if (!name) { clearFocus(); return; }
  if (_onFocusJob) _onFocusJob(name);
}

export function clearFocus() {
  if (_onClearFocus) _onClearFocus();
}

export function updateBatchQuickSel() { renderFocusTree(''); }

function toggleTreeSection(hdr, arrowSel) {
  const body = hdr.nextElementSibling;
  if (!body) return;
  const arrow = hdr.querySelector(arrowSel);
  const collapsed = body.classList.toggle('collapsed');
  arrow?.classList.toggle('open', !collapsed);
}

export function renderFocusTree(q) {
  const g = S.graph;
  const panel = $('focus-tree-panel');
  if (!g) { panel.style.display = 'none'; return; }
  panel.style.display = 'flex';
  ftreeQuery = q.toLowerCase();

  const tree = new Map();
  for (const j of g.jobs) {
    const app = j.app || '(미분류)', sub = j.sub || '(미분류)';
    if (!tree.has(app)) tree.set(app, new Map());
    const subMap = tree.get(app);
    if (!subMap.has(sub)) subMap.set(sub, []);
    subMap.get(sub).push(j);
  }

  const matchJob = j => !ftreeQuery
    || j.name.toLowerCase().includes(ftreeQuery)
    || (j.desc  || '').toLowerCase().includes(ftreeQuery)
    || (j.nodeId || '').toLowerCase().includes(ftreeQuery);

  const jobDotColor = name => {
    const isRoot = !g.edges.some(e => e.to   === name);
    const isLeaf = !g.edges.some(e => e.from === name);
    return isRoot ? '#3fb950' : isLeaf ? '#388bfd' : '#d29922';
  };

  let html = '', totalVisible = 0;

  for (const [app, subMap] of [...tree].sort((a, b) => a[0].localeCompare(b[0]))) {
    let appHtml = '', appCount = 0;

    for (const [sub, jobs] of [...subMap].sort((a, b) => a[0].localeCompare(b[0]))) {
      const visible = jobs.filter(matchJob);
      if (!visible.length) continue;
      appCount += visible.length; totalVisible += visible.length;

      const jobsHtml = visible.map(j => {
        const isFoc = S.focusName === j.name;
        const dot = jobDotColor(j.name);
        const descShort = j.desc ? (j.desc.length > 22 ? j.desc.slice(0, 21) + '…' : j.desc) : '';
        return `<div class="ftg-job${isFoc ? ' focused' : ''}" data-focus="${esc(j.name)}" title="${esc(j.name)}${j.desc ? ' - ' + j.desc : ''}">
  <span class="ftg-job-dot" style="background:${dot}"></span>
  <span class="ftg-job-name">${highlightMatch(j.name, ftreeQuery)}</span>
  ${descShort ? `<span class="ftg-job-desc">${highlightMatch(descShort, ftreeQuery)}</span>` : ''}
</div>`;
      }).join('');

      appHtml += `<div class="ftg-sub">
  <div class="ftg-sub-hdr" title="클릭하여 목록 접기/펼치기">
    <span class="ftg-sub-arrow open">▶</span>
    <span class="ftg-sub-name${S.groupFilter === sub || S.groupPreview === sub ? ' on' : ''}">📁 ${esc(sub)}</span>
    <span class="ftg-sub-cnt">${visible.length}</span>
  </div>
  <div class="ftg-sub-body">${jobsHtml}</div>
</div>`;
    }

    if (!appCount) continue;
    const isAppOpen = tree.size === 1 || !!ftreeQuery || appCount <= 20;

    html += `<div class="ftg-app">
  <div class="ftg-app-hdr" title="클릭하여 목록 접기/펼치기">
    <span class="ftg-app-arrow${isAppOpen ? ' open' : ''}">▶</span>
    <span>📦 ${esc(app)}</span>
    <span class="ftg-sub-cnt">${appCount}개</span>
  </div>
  <div class="ftg-app-body${isAppOpen ? '' : ' collapsed'}">${appHtml}</div>
</div>`;
  }

  if (!totalVisible && ftreeQuery) {
    html = `<div class="ftg-no-result">검색 결과 없음: "${esc(ftreeQuery)}"</div>`;
  }

  const body = $('ftree-body');
  body.innerHTML = html;

  body.querySelectorAll('.ftg-app-hdr').forEach(hdr => {
    hdr.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      toggleTreeSection(hdr, '.ftg-app-arrow');
    });
  });

  body.querySelectorAll('.ftg-sub-hdr').forEach(hdr => {
    hdr.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      toggleTreeSection(hdr, '.ftg-sub-arrow');
    });
  });

  body.querySelectorAll('.ftg-job').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      const name = item.dataset.focus;
      if (name === S.focusName) clearFocus();
      else setFocus(name);
    });
  });
}
