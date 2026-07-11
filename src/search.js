import { S, EMB, API, SRCH, FILTER } from './state.js';
import { $, esc } from './utils.js';
import { fetchEmbeddings, cosineSim } from './ai.js';

export function getFilteredJobs() {
  const g = S.graph; if (!g) return [];
  const hasApp  = FILTER.app.size  > 0;
  const hasSub  = FILTER.sub.size  > 0;
  const hasNode = FILTER.node.size > 0;
  if (!hasApp && !hasSub && !hasNode) return g.jobs;
  return g.jobs.filter(j =>
    (!hasApp  || FILTER.app.has(j.app))   &&
    (!hasSub  || FILTER.sub.has(j.sub))   &&
    (!hasNode || FILTER.node.has(j.nodeId))
  );
}

export function keywordSearch(q) {
  const ql = q.toLowerCase();
  const g  = S.graph;
  const filteredJobs = getFilteredJobs();
  const results = [];

  const scoreFields = [
    { fields: j => [j.name],                                                              score: 0.97 },
    { fields: j => j.inConds.map(c => c.name).concat(j.outConds.map(c => c.name)),       score: 0.90 },
    { fields: j => [j.desc],                                                              score: 0.85 },
    { fields: j => [j.cmdLine],                                                           score: 0.80 },
    { fields: j => [j.memName, j.memLib],                                                 score: 0.78 },
    { fields: j => [j.nodeId],                                                            score: 0.75 },
    { fields: j => [j.runAs],                                                             score: 0.70 },
    { fields: j => [j.app, j.sub],                                                        score: 0.65 },
    { fields: j => [j.folder],                                                            score: 0.62 },
    { fields: j => [j.daysCal, j.timeFrom, j.priority, j.type],                          score: 0.60 },
    { fields: j => g.edges.filter(e => e.to === j.name || e.from === j.name).map(e => e.cond || ''), score: 0.55 },
  ];

  for (const j of filteredJobs) {
    if (!ql) { results.push({ name: j.name, score: 0.5, semantic: false }); continue; }
    let bestScore = 0;
    for (const { fields, score } of scoreFields) {
      const vals = fields(j).filter(Boolean).map(v => v.toLowerCase());
      if (vals.some(v => v.includes(ql)) && score > bestScore) bestScore = score;
    }
    if (bestScore > 0) results.push({ name: j.name, score: bestScore, semantic: false });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 30);
}

export async function semanticSearch(q) {
  const qEmb = await fetchEmbeddings([q]);
  const filtered = new Set(getFilteredJobs().map(j => j.name));
  const results = [];
  for (const [name, emb] of EMB.data) {
    if (!filtered.has(name)) continue;
    results.push({ name, score: cosineSim(qEmb[0], emb), semantic: true });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 15);
}

export async function doSearch() {
  const q = ($('search-inp').value || '').trim();
  const hasFilter = FILTER.app.size || FILTER.sub.size || FILTER.node.size;
  if (!q && !hasFilter) return;
  SRCH.last = q || '(필터)'; SRCH.running = true;
  $('search-results').innerHTML = `<div style="padding:12px 13px;font-size:12px;color:var(--text3)">검색 중…</div>`;
  $('search-meta').style.display = 'none';
  try {
    const results = (EMB.built && API.key) ? await semanticSearch(q) : keywordSearch(q);
    SRCH.results = results; renderSearchOutput(results);
  } catch {
    SRCH.results = keywordSearch(q); renderSearchOutput(SRCH.results);
  }
  SRCH.running = false;
}

function jobType(name) {
  const g = S.graph; if (!g) return 'm';
  return !g.edges.some(e => e.to === name) ? 'r' : !g.edges.some(e => e.from === name) ? 'l' : 'm';
}

export function renderSearchOutput(results) {
  const mode = EMB.built && API.key ? 'AI 시맨틱' : '키워드';
  const meta = $('search-meta');
  meta.textContent = `${mode} 검색 · "${SRCH.last}" · ${results.length}건`;
  meta.style.display = 'block';

  if (!results.length) {
    $('search-results').innerHTML = `<div style="padding:14px 13px;font-size:12.5px;color:var(--text3)">검색 결과가 없습니다</div>`;
    return;
  }
  const q = SRCH.last.toLowerCase();
  $('search-results').innerHTML = results.map(r => {
    const job = S.graph?.jobs.find(j => j.name === r.name);
    const hints = [];
    if (!r.semantic && job) {
      if (job.desc?.toLowerCase().includes(q))       hints.push(`설명: ${job.desc.length > 30 ? job.desc.slice(0, 29) + '…' : job.desc}`);
      if (job.cmdLine?.toLowerCase().includes(q))    hints.push(`명령: ${job.cmdLine.length > 40 ? job.cmdLine.slice(0, 39) + '…' : job.cmdLine}`);
      if (job.memName?.toLowerCase().includes(q))    hints.push(`스크립트: ${job.memName}`);
      if (job.memLib?.toLowerCase().includes(q))     hints.push(`경로: ${job.memLib}`);
      if (job.nodeId?.toLowerCase().includes(q))     hints.push(`서버: ${job.nodeId}`);
      if (job.runAs?.toLowerCase().includes(q))      hints.push(`사용자: ${job.runAs}`);
      if (job.app?.toLowerCase().includes(q))        hints.push(`APP: ${job.app}`);
      if (job.folder?.toLowerCase().includes(q))     hints.push(`폴더: ${job.folder}`);
      if (job.daysCal?.toLowerCase().includes(q))    hints.push(`캘린더: ${job.daysCal}`);
      if (job.inConds.some(c  => c.name.toLowerCase().includes(q)))
        hints.push(`IN조건: ${job.inConds.filter(c => c.name.toLowerCase().includes(q)).map(c => c.name).join(', ')}`);
      if (job.outConds.some(c => c.name.toLowerCase().includes(q)))
        hints.push(`OUT조건: ${job.outConds.filter(c => c.name.toLowerCase().includes(q)).map(c => c.name).join(', ')}`);
    }
    const hintHtml = hints.length
      ? `<div style="font-size:10px;color:var(--warning);margin-top:3px;line-height:1.5">${hints.slice(0, 2).map(h => `<span style="background:rgba(210,153,34,.12);border-radius:3px;padding:1px 4px;margin-right:3px">${esc(h)}</span>`).join('')}</div>` : '';
    const subLine = job?.desc
      ? (job.desc.length > 32 ? job.desc.slice(0, 31) + '…' : job.desc)
      : [job?.app, job?.sub].filter(Boolean).join(' · ');
    return `<div class="sr-item${S.selected === r.name ? ' on' : ''}" data-job="${esc(r.name)}">
  <div class="job-dot ${jobType(r.name)}"></div>
  <div class="sr-info">
    <div class="sr-name" title="${esc(r.name)}">${esc(r.name)}</div>
    ${subLine ? `<div class="sr-sub">${esc(subLine)}</div>` : ''}
    ${hintHtml}
  </div>
  <span class="sr-badge ${r.semantic ? 'sem' : ''}">${r.semantic ? '시맨틱' : '키워드'}</span>
  <span class="sr-score">${Math.round(r.score * 100)}%</span>
</div>`;
  }).join('');
}

export function renderFilterTree() {
  const g = S.graph;
  if (!g) { $('filter-tree').style.display = 'none'; return; }
  $('filter-tree').style.display = '';

  const apps = new Map(), subs = new Map(), nodes = new Map();
  for (const j of g.jobs) {
    if (j.app)    apps.set(j.app,    (apps.get(j.app)    || 0) + 1);
    if (j.sub)    subs.set(j.sub,    (subs.get(j.sub)    || 0) + 1);
    if (j.nodeId) nodes.set(j.nodeId, (nodes.get(j.nodeId) || 0) + 1);
  }

  const sorted = m => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const makeGroup = (id, label, icon, entries, filterSet) => {
    const isOpen = entries.length <= 8;
    return `<div class="ft-group">
  <div class="ft-group-hdr" data-ftg="${id}">
    <span class="ft-group-arrow${isOpen ? ' open' : ''}">▶</span>
    <span>${icon} ${label}</span>
    <span style="margin-left:auto;font-size:10px;color:var(--text3);font-weight:400">${entries.length}종</span>
  </div>
  <div class="ft-group-children${isOpen ? ' open' : ''}" id="ftg-${id}">
    ${entries.map(([val, cnt]) => `
    <div class="ft-item">
      <input type="checkbox" id="fti-${id}-${esc(val)}" data-ft="${id}" data-val="${esc(val)}"${filterSet.has(val) ? ' checked' : ''}>
      <label for="fti-${id}-${esc(val)}" title="${esc(val)}">${esc(val)}</label>
      <span class="ft-cnt">${cnt}</span>
    </div>`).join('')}
  </div>
</div>`;
  };

  $('filter-tree-body').innerHTML =
    makeGroup('app',  '어플리케이션', '📦', sorted(apps),  FILTER.app)  +
    makeGroup('sub',  '그룹',         '📁', sorted(subs),  FILTER.sub)  +
    makeGroup('node', '서버',         '🖥', sorted(nodes), FILTER.node);

  $('filter-tree-body').querySelectorAll('.ft-group-hdr').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const id = hdr.dataset.ftg;
      const children = $(`ftg-${id}`);
      const arrow = hdr.querySelector('.ft-group-arrow');
      const open = children.classList.toggle('open');
      arrow.classList.toggle('open', open);
    });
  });

  $('filter-tree-body').addEventListener('change', e => {
    const cb = e.target; if (cb.type !== 'checkbox') return;
    const type = cb.dataset.ft, val = cb.dataset.val;
    const set = type === 'app' ? FILTER.app : type === 'sub' ? FILTER.sub : FILTER.node;
    cb.checked ? set.add(val) : set.delete(val);
    renderFilterChips();
    if (SRCH.last) doSearch();
  });
}

export function renderFilterChips() {
  const chips = $('filter-chips');
  const all = [
    ...[...FILTER.app].map(v  => ({ type: 'app',  label: 'APP: ' + v,  val: v })),
    ...[...FILTER.sub].map(v  => ({ type: 'sub',  label: '그룹: ' + v, val: v })),
    ...[...FILTER.node].map(v => ({ type: 'node', label: '서버: ' + v, val: v })),
  ];
  if (!all.length) { chips.style.display = 'none'; return; }
  chips.style.display = 'flex';
  chips.innerHTML = all.map(c => `
<div class="filter-chip" data-ft="${c.type}" data-val="${esc(c.val)}">
  <span>${esc(c.label)}</span><span class="chip-x">×</span>
</div>`).join('') +
`<div class="filter-chip" style="background:rgba(248,81,73,.1);color:var(--danger);border-color:var(--danger)" id="chip-clear-all">
  <span>전체 해제</span>
</div>`;

  chips.querySelectorAll('.filter-chip[data-ft]').forEach(chip => {
    chip.addEventListener('click', () => {
      const { ft: type, val } = chip.dataset;
      const set = type === 'app' ? FILTER.app : type === 'sub' ? FILTER.sub : FILTER.node;
      set.delete(val);
      const cb = $('filter-tree-body')?.querySelector(`[data-ft="${type}"][data-val="${val}"]`);
      if (cb) cb.checked = false;
      renderFilterChips();
      if (SRCH.last) doSearch();
    });
  });
  $('chip-clear-all')?.addEventListener('click', () => {
    FILTER.app.clear(); FILTER.sub.clear(); FILTER.node.clear();
    $('filter-tree-body').querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
    renderFilterChips();
    if (SRCH.last) doSearch();
  });
}

export function renderSearchPane() {
  renderFilterTree();
  if (SRCH.results.length) renderSearchOutput(SRCH.results);
}
