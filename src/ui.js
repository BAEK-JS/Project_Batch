import { S, EMB, AI, SRCH, FILTER, API } from './state.js';
import { $, esc, svg, dagRoot } from './utils.js';
import { parseXML } from './parser.js';
import { computeLayout } from './layout.js';
import { renderSVG, fitView } from './renderer.js';
import { updateBatchQuickSel, buildReachableSet, renderFocusTree, ftreeQuery, setFocus, clearFocus } from './focus.js';
import { renderAIPane } from './ai.js';
import { renderSearchPane } from './search.js';

export function updateStats() {
  const g = S.graph;
  if (!g) { $('stats').style.display = 'none'; $('btn-export-xl').style.display = 'none'; return; }
  const roots  = g.jobs.filter(j => !g.edges.some(e => e.to   === j.name)).length;
  const leaves = g.jobs.filter(j => !g.edges.some(e => e.from === j.name)).length;
  $('s-jobs').textContent  = g.jobs.length;
  $('s-edges').textContent = g.edges.length;
  $('s-roots').textContent = roots;
  $('s-leaves').textContent = leaves;
  $('stats').style.display = 'flex';
  $('hdr-info').textContent = `배치 ${g.jobs.length}개 · 의존성 ${g.edges.length}개`;
  $('btn-export-xl').style.display = '';
}

export function jobType(name) {
  const g = S.graph; if (!g) return 'm';
  return !g.edges.some(e => e.to === name) ? 'r' : !g.edges.some(e => e.from === name) ? 'l' : 'm';
}

export function renderJobList() {
  const g = S.graph; if (!g) return;
  $('tab-jobs').textContent = `배치 목록 (${g.jobs.length})`;
  $('job-list').innerHTML = g.jobs.map(j => {
    const shortDesc = j.desc ? (j.desc.length > 34 ? j.desc.slice(0, 33) + '…' : j.desc) : '';
    const timeStr   = j.timeFrom ? j.timeFrom.replace(/^(\d{2})(\d{2})$/, '$1:$2') : '';
    return `<div class="job-item${S.selected === j.name ? ' on' : ''}" data-job="${esc(j.name)}" style="flex-direction:column;align-items:flex-start;padding:7px 10px">
  <div style="display:flex;align-items:center;gap:6px;width:100%">
    <div class="job-dot ${jobType(j.name)}" style="flex-shrink:0"></div>
    <div style="font-size:11.5px;font-family:var(--mono);font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(j.name)}">${esc(j.name)}</div>
    <div style="font-size:10px;color:var(--text3);flex-shrink:0">${j.inConds.length}↓ ${j.outConds.length}↑</div>
  </div>
  ${shortDesc || j.nodeId || timeStr ? `<div style="font-size:10px;color:var(--text3);margin-top:2px;padding-left:18px;display:flex;gap:6px;align-items:center">
    ${shortDesc ? `<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(shortDesc)}</span>` : ''}
    ${j.nodeId  ? `<span style="color:#388bfd88;flex-shrink:0">${esc(j.nodeId)}</span>` : ''}
    ${timeStr   ? `<span style="color:#d2992288;flex-shrink:0">${timeStr}</span>` : ''}
  </div>` : ''}
</div>`;
  }).join('');
}

export function renderDetail(name) {
  const g = S.graph; const job = g?.jobs.find(j => j.name === name); if (!job) return;
  const up = g.edges.filter(e => e.to   === name).map(e => e.from);
  const dn = g.edges.filter(e => e.from === name).map(e => e.to);
  let pills = [job.folder, job.app, job.sub].filter(Boolean).map(t => `<span class="pill">${esc(t)}</span>`).join('');
  if (job.type) pills += `<span class="pill on">${esc(job.type)}</span>`;
  if (job.critical === '1') pills += `<span class="pill" style="color:#f85149">CRITICAL</span>`;
  if (job.cyclic   === '1') pills += `<span class="pill" style="color:#d29922">CYCLIC</span>`;

  const depUp = up.map(n => `<div class="dep-item"><span class="dep-arrow">←</span>${esc(n)}</div>`).join('');
  const depDn = dn.map(n => `<div class="dep-item"><span class="dep-arrow">→</span>${esc(n)}</div>`).join('');

  const inT = job.inConds.length
    ? `<div class="section-title">IN 조건</div><table class="cond-table"><thead><tr><th>조건명</th><th>ODATE</th><th>AND/OR</th></tr></thead><tbody>
       ${job.inConds.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.odate)}</td><td>${esc(c.andOr)}</td></tr>`).join('')}</tbody></table>` : '';
  const outT = job.outConds.length
    ? `<div class="section-title">OUT 조건</div><table class="cond-table"><thead><tr><th>조건명</th><th>ODATE</th><th>SIGN</th></tr></thead><tbody>
       ${job.outConds.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.odate)}</td><td>${esc(c.sign)}</td></tr>`).join('')}</tbody></table>` : '';

  const schedRows = [
    ['실행 서버',    job.nodeId],
    ['시작 시간',    job.timeFrom ? job.timeFrom.replace(/^(\d{2})(\d{2})$/, '$1:$2') : ''],
    ['서버 계정',    job.runAs],
    ['캘린더',       job.daysCal],
    ['우선순위',     job.priority],
    ['최대 대기(일)', job.maxWait],
    ['중요 배치',    job.critical === '1' ? '✓ 예' : ''],
    ['순환 실행',    job.cyclic   === '1' ? '✓ 예' : ''],
  ].filter(r => r[1]);

  const schedTable = schedRows.length ? `<div class="section-title">스케줄 정보</div>
<table class="cond-table"><tbody>
${schedRows.map(r => `<tr><td style="color:var(--text3);width:90px">${r[0]}</td><td style="font-family:var(--mono)">${esc(r[1])}</td></tr>`).join('')}
</tbody></table>` : '';

  const scriptRows = [
    ['스크립트',      job.memName],
    ['스크립트 경로', job.memLib],
    ['폴더',          job.folder],
    ['APPLICATION',  job.app],
  ].filter(r => r[1]);

  const scriptTable = scriptRows.length ? `<div class="section-title">스크립트 정보</div>
<table class="cond-table"><tbody>
${scriptRows.map(r => `<tr><td style="color:var(--text3);width:90px">${r[0]}</td><td style="font-family:var(--mono);word-break:break-all">${esc(r[1])}</td></tr>`).join('')}
</tbody></table>` : '';

  const cmdSection = job.cmdLine ? `<div class="section-title">실행 명령</div>
<div style="font-family:var(--mono);font-size:10.5px;color:var(--text2);background:var(--bg);border:1px solid var(--border2);border-radius:5px;padding:8px;word-break:break-all;line-height:1.7;margin-bottom:10px">${esc(job.cmdLine)}</div>` : '';

  const isFocused = S.focusName === job.name;
  $('detail-body').innerHTML = `<div class="detail">
<div class="detail-head">
  <div class="detail-name">${esc(job.name)}</div>
  <button class="btn btn-g" onclick="closeDetail()" style="font-size:11.5px;height:26px;padding:0 8px">닫기</button>
</div>
<div style="display:flex;gap:6px;margin-bottom:10px">
  <button id="detail-focus-btn" class="btn btn-s" style="flex:1;font-size:11.5px;height:28px">${isFocused ? '🔍 포커스 중' : '🔍 이 경로만 보기'}</button>
  ${isFocused ? `<button id="detail-clear-btn" class="btn btn-g" style="font-size:11.5px;height:28px;padding:0 9px">전체 보기</button>` : ''}
</div>
${job.desc ? `<div style="font-size:12px;color:var(--text2);margin-bottom:10px;line-height:1.6;padding:7px 9px;background:var(--surface2);border-radius:5px;border-left:3px solid var(--accent)">${esc(job.desc)}</div>` : ''}
${pills ? `<div class="pills">${pills}</div>` : ''}
<div class="detail-stats">
  <div class="dstat"><div class="dstat-val">${job.inConds.length}</div><div class="dstat-lbl">IN 조건</div></div>
  <div class="dstat"><div class="dstat-val">${job.outConds.length}</div><div class="dstat-lbl">OUT 조건</div></div>
</div>
${up.length ? `<div class="section-title">선행 배치 (${up.length})</div><div class="dep-list">${depUp}</div>` : ''}
${dn.length ? `<div class="section-title">후행 배치 (${dn.length})</div><div class="dep-list">${depDn}</div>` : ''}
${(up.length || dn.length) ? '<div class="divider"></div>' : ''}
${inT}${outT}${schedTable}${scriptTable}${cmdSection}
</div>`;

  $('detail-focus-btn')?.addEventListener('click', () => setFocus(job.name));
  $('detail-clear-btn')?.addEventListener('click', () => clearFocus());
}

export function setTab(tab) {
  S.tab = tab;
  document.querySelectorAll('.tab').forEach(el  => el.classList.toggle('on', el.dataset.tab === tab));
  document.querySelectorAll('.pane').forEach(el => el.classList.toggle('on', el.id === 'pane-' + tab));
  $('sfooter').classList.toggle('on', tab !== 'input' && !!S.graph);
  if (tab === 'ai')     renderAIPane();
  if (tab === 'search') renderSearchPane();
}

export function selectJob(name) {
  showJobFocusDiagram(name);
}

export function closeDetail() {
  S.selected = null;
  if (S.focusSet) renderSVG();
  renderJobList();
  setTab(S.graph ? 'jobs' : 'input');
  $('tab-detail').style.display = 'none';
}

export function resetAnalysisState() {
  EMB.built = false; EMB.building = false; EMB.data.clear(); EMB.progress = 0;
  AI.text = ''; AI.error = ''; AI.running = false; AI.history = [];
  SRCH.results = []; SRCH.last = '';
  FILTER.app.clear(); FILTER.sub.clear(); FILTER.node.clear();
}

export function showEmptyMessage(title, html) {
  $('empty').style.display = 'flex';
  $('empty').querySelector('.empty-ttl').textContent = title;
  $('empty').querySelector('.empty-sub').innerHTML = html;
}

export function jobGroupKey(job) {
  return job?.sub || job?.app || job?.folder || '';
}

function updateGroupFilterBar(inGroupCount) {
  const bar = $('group-filter-bar');
  if (!bar) return;
  if (S.groupFilter) {
    bar.classList.add('on');
    bar.style.display = 'flex';
    $('group-filter-name').textContent = S.groupFilter;
    const total = S.focusSet ? S.focusSet.size : 0;
    const countEl = $('group-filter-count');
    if (countEl) {
      if (inGroupCount && total > inGroupCount) {
        countEl.textContent = `그룹 ${inGroupCount} · 표시 ${total}개`;
      } else {
        countEl.textContent = total ? `${total}개` : '';
      }
    }
  } else {
    bar.classList.remove('on');
    bar.style.display = 'none';
  }
}

function updateGroupPanelToggleBtn() {
  const btn = $('btn-group-panel');
  if (!btn) return;
  btn.classList.toggle('on', !!S.groupPanelOpen);
  btn.title = S.groupPanelOpen ? '그룹 내역 닫기' : '그룹 내역 열기';
}

function renderGroupSidePanel(baseNames) {
  const panel = $('group-side-panel');
  const list = $('group-side-list');
  if (!panel || !list) return;

  if (!S.graph || !baseNames?.size) {
    panel.classList.remove('on');
    panel.style.display = 'none';
    updateGroupPanelToggleBtn();
    return;
  }

  const counts = new Map();
  for (const j of S.graph.jobs) {
    if (!baseNames.has(j.name)) continue;
    const g = jobGroupKey(j) || '(미분류)';
    counts.set(g, (counts.get(g) || 0) + 1);
  }

  const items = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  list.innerHTML = items.map(([name, cnt]) => {
    const cls = S.groupFilter === name ? ' on' : S.groupPreview === name ? ' preview' : '';
    return `<button type="button" class="group-side-item${cls}" data-group-preview="${esc(name)}" title="${esc(name)}">
  <span class="group-side-item-name">${esc(name)}</span>
  <span class="group-side-item-cnt">${cnt}</span>
</button>`;
  }).join('');

  const ttl = $('group-side-ttl');
  const hint = $('group-side-hint');
  const allBtn = $('btn-group-side-all');
  const goBtn = $('btn-group-side-go');
  const scoped = !!S.groupScope?.size;
  if (ttl) {
    ttl.textContent = scoped
      ? '현재 화면 그룹'
      : (S.focusName ? '선후행 그룹' : '그룹 내역');
  }
  if (hint) {
    hint.textContent = S.groupPreview
      ? `"${S.groupPreview}" 강조 중 · 이동 시 이 범위 안에서만 전환`
      : (scoped
        ? '이동한 화면 기준 · 여기 있는 그룹만 표시'
        : '그룹 클릭 → 색 강조 · 이동으로 전환');
  }
  if (allBtn) {
    allBtn.textContent = scoped
      ? '처음 범위로'
      : (S.focusName ? '전체 선후행' : '전체 보기');
  }
  if (goBtn) {
    goBtn.disabled = !S.groupPreview;
    goBtn.textContent = S.groupPreview ? `이동 · ${S.groupPreview}` : '이동';
  }

  panel.classList.add('right');
  panel.classList.toggle('on', !!S.groupPanelOpen);
  panel.style.display = S.groupPanelOpen ? 'flex' : 'none';
  updateGroupPanelToggleBtn();
}

export function toggleGroupPanel(force) {
  if (typeof force === 'boolean') S.groupPanelOpen = force;
  else S.groupPanelOpen = !S.groupPanelOpen;
  const panel = $('group-side-panel');
  if (panel) {
    panel.classList.toggle('on', !!S.groupPanelOpen);
    panel.style.display = S.groupPanelOpen ? 'flex' : 'none';
  }
  updateGroupPanelToggleBtn();
}

/** 최초 기준(선후행 또는 전체 XML) */
function getRootBaseNameSet() {
  if (!S.graph) return new Set();
  if (S.focusName) return buildReachableSet(S.focusName);
  return new Set(S.graph.jobs.map(j => j.name));
}

/** 그룹 탐색에 쓰는 현재 범위(이동 후면 그 화면) */
function getGroupScopeNames() {
  if (S.groupScope?.size) return S.groupScope;
  return getRootBaseNameSet();
}

/** 그룹 필터용 잡 집합: 해당 그룹 + (기준 집합 안) 직접 선·후행 */
function buildGroupViewNames(baseNames, group) {
  const byName = new Map(S.graph.jobs.map(j => [j.name, j]));
  const inGroup = new Set(
    [...baseNames].filter(n => jobGroupKey(byName.get(n)) === group)
  );
  const related = new Set(inGroup);
  for (const e of S.graph.edges) {
    if (!baseNames.has(e.from) || !baseNames.has(e.to)) continue;
    if (inGroup.has(e.from)) related.add(e.to);
    if (inGroup.has(e.to)) related.add(e.from);
  }
  return { inGroup, names: related };
}

/** 그룹 클릭: 현재 범위 화면에서 색만 강조 */
export function setGroupPreview(group) {
  if (!group) {
    S.groupPreview = null;
  } else if (S.groupPreview === group) {
    S.groupPreview = null;
  } else {
    S.groupPreview = group;
    S.groupPanelOpen = true;
  }

  // 다른 그룹 미리보기: 처음 전체로 풀지 않고, 현재 groupScope(이동한 화면) 유지
  if (S.groupPreview && S.groupFilter && S.groupFilter !== S.groupPreview) {
    S.groupFilter = null;
    applyDiagramView();
    return;
  }

  const panelBase = getGroupScopeNames();
  updateGroupFilterBar();
  renderGroupSidePanel(panelBase);
  renderSVG();
}

/** 이동: 현재 범위 안에서 그룹으로 좁히고, 그 결과가 다음 그룹보기의 새 기준 */
export function goToGroupPreview() {
  if (!S.groupPreview) return;
  const group = S.groupPreview;
  const scope = getGroupScopeNames();
  const built = buildGroupViewNames(scope, group);

  S.groupPreview = null;
  S.groupFilter = group;
  S.groupScope = new Set(built.names); // 이동한 화면 = 이후 그룹보기 기준
  S.groupPanelOpen = false;
  if (!S.focusName) S.selected = null;
  applyDiagramView();
  updateGroupPanelToggleBtn();
}

/** 현재 포커스(+그룹 범위) 기준으로 레이아웃/렌더 */
export function applyDiagramView() {
  if (!S.graph) return;

  const rootBase = getRootBaseNameSet();
  // 그룹 이동 후에는 groupScope가 화면·그룹목록 기준
  const names = S.groupScope?.size ? S.groupScope : rootBase;

  let inGroupCount = 0;
  if (S.groupFilter) {
    const byName = new Map(S.graph.jobs.map(j => [j.name, j]));
    inGroupCount = [...names].filter(n => jobGroupKey(byName.get(n)) === S.groupFilter).length;
  }

  S.focusSet = (S.focusName || S.groupScope) ? names : null;
  const subGraph = {
    jobs:  S.graph.jobs.filter(j => names.has(j.name)),
    edges: S.graph.edges.filter(e => names.has(e.from) && names.has(e.to)),
  };

  S.viewGraph = (S.focusName || S.groupScope) ? subGraph : null;
  S.pos = computeLayout(subGraph, { compact: !!S.groupScope });

  $('empty').style.display = 'none';
  svg.style.display = 'block';
  $('ctrl').classList.add('on'); $('legend').classList.add('on');
  updateGroupFilterBar(inGroupCount);
  // 그룹 목록은 항상 현재 화면에 있는 그룹만
  renderGroupSidePanel(names);
  renderSVG();
  renderJobList();
  renderFocusTree(ftreeQuery);
  if (S.selected) renderDetail(S.selected);
  setTimeout(fitView, 50);
}

export function setGroupFilter(group) {
  if (!group) {
    // 처음 범위(전체/선후행)로 복귀
    S.groupFilter = null;
    S.groupPreview = null;
    S.groupScope = null;
    if (!S.graph) { updateGroupFilterBar(); return; }
    if (!S.focusName) {
      showAllDiagram();
      return;
    }
    applyDiagramView();
    return;
  }
  setGroupPreview(group);
}

export function loadGraphAsJobList(graph, label = '') {
  S.graph = graph; S.pos = null; S.selected = null; S.focusSet = null; S.focusName = null; S.groupFilter = null; S.groupPreview = null; S.groupPanelOpen = false; S.groupScope = null; S.viewGraph = null;
  $('err-msg').style.display = 'none';
  svg.style.display = 'none';
  dagRoot.innerHTML = '';
  $('ctrl').classList.remove('on'); $('legend').classList.remove('on');
  updateGroupFilterBar();
  const panel = $('group-side-panel');
  if (panel) { panel.classList.remove('on'); panel.style.display = 'none'; }
  showEmptyMessage('JOB을 선택하세요', 'XML은 로드되었습니다.<br>좌측 배치 목록에서 JOB을 클릭하면 해당 JOB 기준 선후행만 표시합니다.');
  $('btn-clear').style.display = '';
  $('tab-jobs').style.display = '';
  $('tab-ai').style.display = '';
  $('tab-search').style.display = '';
  $('tab-detail').style.display = 'none';
  updateStats();
  if (label) $('hdr-info').textContent = `${label} · 배치 ${graph.jobs.length}개 · 의존성 ${graph.edges.length}개`;
  renderJobList(); updateBatchQuickSel(); resetAnalysisState();
  setTab('jobs');
}

export function loadXmlAsJobList(xmlStr, label = '') {
  try {
    const graph = parseXML(xmlStr);
    $('xml-input').value = xmlStr;
    loadGraphAsJobList(graph, label);
  } catch (e) {
    $('err-msg').textContent = '⚠ ' + e.message;
    $('err-msg').style.display = 'block';
    setTab('input');
    alert('XML 파싱 실패:\n\n' + e.message);
  }
}

export function showJobFocusDiagram(jobName) {
  if (!S.graph || !jobName) return;
  S.selected = jobName;
  S.focusName = jobName;
  S.groupFilter = null;
  S.groupPreview = null;
  S.groupScope = null;
  $('tab-detail').style.display = '';
  applyDiagramView();
  renderDetail(jobName);
  setTab('detail');
}

export function showAllDiagram() {
  if (!S.graph) return;
  S.selected = null;
  S.focusName = null;
  S.groupFilter = null;
  S.groupPreview = null;
  S.groupScope = null;
  S.viewGraph = null;
  S.focusSet = null;
  applyDiagramView();
}

export function generate(xmlStr) {
  try {
    const graph = parseXML(xmlStr);
    S.graph = graph; S.selected = null;
    S.focusSet = null; S.focusName = null; S.groupFilter = null; S.groupPreview = null; S.groupPanelOpen = false; S.groupScope = null; S.viewGraph = null;
    $('err-msg').style.display = 'none';
    $('btn-clear').style.display = '';
    $('tab-jobs').style.display = ''; $('tab-ai').style.display = ''; $('tab-search').style.display = '';
    applyDiagramView();
    updateStats(); renderJobList(); updateBatchQuickSel();
    resetAnalysisState();
    setTab('jobs');
  } catch (e) {
    $('err-msg').textContent = '⚠ ' + e.message;
    $('err-msg').style.display = 'block';
    setTab('input');
    alert('XML 파싱 실패:\n\n' + e.message);
  }
}

export function clearAll() {
  S.graph = null; S.pos = null; S.selected = null; S.focusSet = null; S.focusName = null; S.groupFilter = null; S.groupPreview = null; S.groupPanelOpen = false; S.groupScope = null; S.viewGraph = null;
  updateGroupFilterBar();
  const panel = $('group-side-panel');
  if (panel) { panel.classList.remove('on'); panel.style.display = 'none'; }
  $('xml-input').value = '';
  $('err-msg').style.display = 'none';
  $('stats').style.display = 'none';
  $('hdr-info').textContent = '';
  svg.style.display = 'none';
  showEmptyMessage('다이어그램이 없습니다', 'XML을 입력하고 "다이어그램 생성"을 누르거나<br>"샘플 로드"로 예시를 확인해보세요');
  $('ctrl').classList.remove('on'); $('legend').classList.remove('on');
  $('btn-clear').style.display = 'none';
  ['tab-jobs', 'tab-ai', 'tab-search', 'tab-detail'].forEach(id => $(id).style.display = 'none');
  $('job-list').innerHTML = ''; $('detail-body').innerHTML = '';
  $('ai-inner').innerHTML = ''; $('search-results').innerHTML = '';
  EMB.built = false; EMB.building = false; EMB.data.clear();
  AI.text = ''; AI.error = ''; AI.running = false; AI.history = [];
  SRCH.results = []; SRCH.last = '';
  dagRoot.innerHTML = '';
  setTab('input');
}

export function openSettings() {
  const inp = $('api-key-inp');
  inp.value = '';
  inp.placeholder = API.key ? '● '.repeat(8) + '(설정됨, 변경 시 새로 입력)' : 'sk-...';
  $('api-url-inp').value = API.baseUrl !== 'https://api.openai.com/v1' ? API.baseUrl : '';
  $('api-model-sel').value = API.chatModel;
  $('key-set-indicator').innerHTML = API.key ? '<span class="key-set-badge">✓ API 키 설정됨</span>' : '';
  $('settings-overlay').classList.add('on');
}

export function closeSettings() { $('settings-overlay').classList.remove('on'); }
