import { S } from './state.js';
import { $, esc, highlightMatch } from './utils.js';

export let ftreeQuery = '';

let _onFocusJob = null;
let _onClearFocus = null;
let _onGroupFilter = null;

/** main.js에서 showJobFocusDiagram / showAllDiagram / setGroupFilter 연결 */
export function bindFocusHandlers(onFocus, onClear, onGroup) {
  _onFocusJob = onFocus;
  _onClearFocus = onClear;
  _onGroupFilter = onGroup || null;
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

      const subId = `ftgsub-${btoa(unescape(encodeURIComponent(app + sub))).slice(0, 12)}`;
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
  <div class="ftg-sub-hdr" data-ftgsub="${subId}">
    <span class="ftg-sub-arrow open">▶</span>
    <span class="ftg-sub-name${S.groupFilter === sub ? ' on' : S.groupPreview === sub ? ' on' : ''}" data-group-filter="${esc(sub)}" title="클릭: 그룹 색 강조">📁 ${esc(sub)}</span>
    <span style="margin-left:auto;font-size:10px;color:var(--text3)">${visible.length}</span>
  </div>
  <div id="${subId}">${jobsHtml}</div>
</div>`;
    }

    if (!appCount) continue;
    const appId = `ftgapp-${btoa(unescape(encodeURIComponent(app))).slice(0, 12)}`;
    const isAppOpen = tree.size === 1 || !!ftreeQuery || appCount <= 20;

    html += `<div class="ftg-app">
  <div class="ftg-app-hdr" data-ftgapp="${appId}">
    <span class="ftg-app-arrow${isAppOpen ? ' open' : ''}">▶</span>
    <span>📦 ${esc(app)}</span>
    <span style="margin-left:auto;font-size:10px;color:var(--text3)">${appCount}개</span>
  </div>
  <div id="${appId}"${isAppOpen ? '' : ' style="display:none"'}>${appHtml}</div>
</div>`;
  }

  if (!totalVisible && ftreeQuery) {
    html = `<div class="ftg-no-result">검색 결과 없음: "${esc(ftreeQuery)}"</div>`;
  }

  $('ftree-body').innerHTML = html;

  $('ftree-body').querySelectorAll('.ftg-app-hdr').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const body = $(hdr.dataset.ftgapp);
      const arrow = hdr.querySelector('.ftg-app-arrow');
      const open = body.style.display === 'none';
      body.style.display = open ? '' : 'none';
      arrow.classList.toggle('open', open);
    });
  });

  $('ftree-body').querySelectorAll('.ftg-sub-hdr').forEach(hdr => {
    hdr.addEventListener('click', e => {
      if (e.target.closest?.('[data-group-filter]')) return;
      const body = $(hdr.dataset.ftgsub);
      const arrow = hdr.querySelector('.ftg-sub-arrow');
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? '' : 'none';
      arrow.classList.toggle('open', isHidden);
    });
  });

  $('ftree-body').querySelectorAll('[data-group-filter]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const group = el.getAttribute('data-group-filter');
      if (group && _onGroupFilter) _onGroupFilter(group);
    });
  });

  $('ftree-body').querySelectorAll('.ftg-job').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.dataset.focus;
      if (name === S.focusName) clearFocus();
      else setFocus(name);
    });
  });
}
