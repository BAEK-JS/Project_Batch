import { S } from './state.js';

/** 현재 다이어그램에 보이는 그래프 (포커스/그룹 범위) */
function getExportGraph() {
  const full = S.graph;
  if (!full) return null;
  return S.viewGraph || full;
}

function scopeSuffix() {
  const parts = [];
  if (S.focusName) parts.push(S.focusName);
  if (S.groupFilter) parts.push(S.groupFilter);
  if (!parts.length && S.viewGraph) parts.push('부분');
  return parts.length ? '_' + parts.join('_').replace(/[\\/:*?"<>|]/g, '-') : '';
}

/** 화면에 보이는 위치(S.pos) 기준 열 묶음 — 다이어그램과 동일 순서 */
function columnsFromPositions(g) {
  if (!S.pos?.size) return null;
  const nameSet = new Set(g.jobs.map(j => j.name));
  const entries = [...S.pos.entries()].filter(([n]) => nameSet.has(n));
  if (!entries.length) return null;

  // 같은 열(x)끼리 묶고, 열은 왼쪽→오른쪽, 행은 위→아래
  const byX = new Map();
  for (const [name, p] of entries) {
    const key = Math.round(p.x);
    if (!byX.has(key)) byX.set(key, []);
    byX.get(key).push({ name, y: p.y });
  }
  const xs = [...byX.keys()].sort((a, b) => a - b);
  return xs.map(x => byX.get(x).sort((a, b) => a.y - b.y).map(o => o.name));
}

/** 위치가 없을 때 의존성 기반 rank 열 (layout과 동일 로직) */
function columnsFromRanks(g) {
  const { jobs, edges } = g;
  if (!jobs.length) return [];

  const hasOut = new Set();
  const hasIn = new Set();
  for (const e of edges) {
    hasOut.add(e.from);
    hasIn.add(e.to);
  }

  const isolated = [];
  const leaves = [];
  const core = [];
  for (const j of jobs) {
    const inn = hasIn.has(j.name);
    const out = hasOut.has(j.name);
    if (!inn && !out) isolated.push(j.name);
    else if (inn && !out) leaves.push(j.name);
    else core.push(j.name);
  }

  const cols = [];
  if (core.length || leaves.length) {
    const layoutNames = new Set([...core, ...leaves]);
    const layoutEdges = edges.filter(e => layoutNames.has(e.from) && layoutNames.has(e.to));
    const adj = new Map([...layoutNames].map(n => [n, []]));
    const indeg = new Map([...layoutNames].map(n => [n, 0]));
    for (const e of layoutEdges) {
      adj.get(e.from)?.push(e.to);
      indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
    }
    const rank = new Map([...layoutNames].map(n => [n, 0]));
    const queue = [...layoutNames].filter(n => !indeg.get(n));
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
    const finalMax = Math.max(0, ...[...rank.values()]);
    for (const n of leaves) rank.set(n, finalMax);

    const byRank = new Map();
    for (const n of layoutNames) {
      const r = rank.get(n) || 0;
      if (!byRank.has(r)) byRank.set(r, []);
      byRank.get(r).push(n);
    }
    for (const r of [...byRank.keys()].sort((a, b) => a - b)) {
      const nodes = byRank.get(r).slice().sort((a, b) => {
        const ae = hasOut.has(a) ? 0 : 1;
        const be = hasOut.has(b) ? 0 : 1;
        return ae - be || a.localeCompare(b);
      });
      cols.push(nodes);
    }
  }
  if (isolated.length) {
    isolated.sort((a, b) => a.localeCompare(b));
    cols.push(isolated);
  }
  return cols;
}

function buildDiagramSheets(g, cell, hdr) {
  const cols = columnsFromPositions(g) || columnsFromRanks(g);
  if (!cols.length) {
    return { sheetLayout: '' };
  }

  const maxRows = Math.max(...cols.map(c => c.length), 1);
  const colCount = cols.length;

  // 헤더: 1단계(시작) … N단계
  const headers = cols.map((_, i) => {
    if (i === 0) return `${i + 1}단계(시작)`;
    if (i === colCount - 1) return `${i + 1}단계(끝)`;
    return `${i + 1}단계`;
  });

  const typeLabel = name => {
    const isRoot = !g.edges.some(e => e.to === name);
    const isLeaf = !g.edges.some(e => e.from === name);
    return isRoot ? '▶' : isLeaf ? '■' : '●';
  };

  const jobByName = new Map(g.jobs.map(j => [j.name, j]));

  // 셀에 배치명 + 짧은 설명
  const cellText = name => {
    if (!name) return '';
    const j = jobByName.get(name);
    const mark = typeLabel(name);
    const desc = j?.desc ? ` / ${j.desc.slice(0, 24)}${j.desc.length > 24 ? '…' : ''}` : '';
    return `${mark} ${name}${desc}`;
  };

  let body = '';
  for (let r = 0; r < maxRows; r++) {
    const cells = cols.map(col => cell(cellText(col[r] || '')));
    body += `<Row>${cells.join('')}</Row>\n`;
  }

  const colXml = cols.map(() => `<Column ss:Width="200"/>`).join('');

  const sheetLayout = `<Worksheet ss:Name="다이어그램(계층)">
<Table ss:DefaultColumnWidth="200">
${colXml}
${hdr(...headers)}
${body}
<Row/>
<Row>${cell('범례: ▶ 시작(선행없음)  ● 중간  ■ 종료(후행없음)  · 열=왼쪽→오른쪽 단계(현재 화면과 동일)')}</Row>
<Row>${cell(`단계 수 ${colCount} · 배치 ${g.jobs.length}개 · 행은 위→아래 배치 순서`)}</Row>
</Table></Worksheet>`;

  return { sheetLayout };
}

export function exportExcel() {
  const g = getExportGraph();
  if (!g) return;
  const isPartial = !!(S.viewGraph || S.focusName || S.groupFilter || S.groupScope);

  const xlEsc = v => {
    if (v == null || v === '') return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  const cell = (v, type = 'String') => `<Cell><Data ss:Type="${type}">${xlEsc(v)}</Data></Cell>`;
  const hdr = (...cols) => `<Row>${cols.map(c => `<Cell ss:StyleID="H"><Data ss:Type="String">${xlEsc(c)}</Data></Cell>`).join('')}</Row>`;

  const typeLabel = name => {
    const isRoot = !g.edges.some(e => e.to   === name);
    const isLeaf = !g.edges.some(e => e.from === name);
    return isRoot ? '시작' : isLeaf ? '종료' : '중간';
  };

  const jobByName = new Map(g.jobs.map(j => [j.name, j]));

  // ── Sheet1: 배치 목록 ──────────────────────────────────────────────────────
  const sheet1Rows = g.jobs.map(j => `<Row>
${cell(j.name)}${cell(j.desc || '')}${cell(j.app || '')}${cell(j.sub || '')}
${cell(j.nodeId || '')}${cell(j.timeFrom || '')}${cell(j.runAs || '')}
${cell(j.memName || '')}${cell(j.memLib || '')}${cell(j.cmdLine || '')}
${cell(j.priority || '')}${cell(j.critical === 'Y' ? 'Y' : '')}${cell(typeLabel(j.name))}
${cell(g.edges.filter(e => e.to   === j.name).length, 'Number')}
${cell(g.edges.filter(e => e.from === j.name).length, 'Number')}
</Row>`).join('');

  const sheet1 = `<Worksheet ss:Name="배치 목록">
<Table ss:DefaultColumnWidth="80">
<Column ss:Width="160"/><Column ss:Width="200"/><Column ss:Width="120"/><Column ss:Width="120"/>
<Column ss:Width="130"/><Column ss:Width="70"/><Column ss:Width="90"/><Column ss:Width="100"/>
<Column ss:Width="100"/><Column ss:Width="180"/><Column ss:Width="55"/><Column ss:Width="55"/>
<Column ss:Width="55"/><Column ss:Width="55"/><Column ss:Width="55"/>
${hdr('배치명', '설명', '어플리케이션', '서브어플리케이션', '서버(NODEID)', '시작시간', '서버계정', '스크립트명', '스크립트경로', '명령어', '우선순위', '중요도', '유형', '선행수', '후행수')}
${sheet1Rows}
</Table></Worksheet>`;

  // ── Sheet2: 선후행 관계 ────────────────────────────────────────────────────
  const condMap = new Map();
  for (const j of g.jobs)
    for (const ic of (j.inConds || [])) {
      const src = g.jobs.find(jj => (jj.outConds || []).some(oc => oc.name === ic.name));
      if (src) {
        const k = src.name + '→' + j.name;
        if (!condMap.has(k)) condMap.set(k, { from: src.name, to: j.name, cond: ic.name, andOr: ic.andOr || '' });
      }
    }
  for (const e of g.edges) {
    const k = e.from + '→' + e.to;
    if (!condMap.has(k)) condMap.set(k, { from: e.from, to: e.to, cond: e.cond || '', andOr: '' });
  }

  const sheet2Rows = [...condMap.values()].map(r => `<Row>
${cell(r.from)}${cell(r.to)}${cell(r.cond)}${cell(r.andOr)}
${cell((jobByName.get(r.from) || {}).desc || '')}
${cell((jobByName.get(r.to)   || {}).desc || '')}
</Row>`).join('');

  const sheet2 = `<Worksheet ss:Name="선후행 관계">
<Table ss:DefaultColumnWidth="80">
<Column ss:Width="160"/><Column ss:Width="160"/><Column ss:Width="160"/>
<Column ss:Width="60"/><Column ss:Width="200"/><Column ss:Width="200"/>
${hdr('선행 배치명', '후행 배치명', '조건명(COND)', 'AND/OR', '선행 배치 설명', '후행 배치 설명')}
${sheet2Rows}
</Table></Worksheet>`;

  // ── Sheet3: 배치별 선후행 요약 ────────────────────────────────────────────
  const sheet3Rows = g.jobs.map(j => {
    const preds = g.edges.filter(e => e.to   === j.name).map(e => e.from).join(', ');
    const succs = g.edges.filter(e => e.from === j.name).map(e => e.to).join(', ');
    return `<Row>
${cell(j.name)}${cell(j.desc || '')}${cell(typeLabel(j.name))}
${cell(preds)}${cell(succs)}
${cell((j.inConds  || []).map(c => c.name).join(', '))}
${cell((j.outConds || []).map(c => c.name).join(', '))}
</Row>`;
  }).join('');

  const sheet3 = `<Worksheet ss:Name="배치별 선후행 요약">
<Table ss:DefaultColumnWidth="80">
<Column ss:Width="160"/><Column ss:Width="200"/><Column ss:Width="55"/>
<Column ss:Width="300"/><Column ss:Width="300"/>
<Column ss:Width="300"/><Column ss:Width="300"/>
${hdr('배치명', '설명', '유형', '선행 배치 목록', '후행 배치 목록', 'IN 조건 목록', 'OUT 조건 목록')}
${sheet3Rows}
</Table></Worksheet>`;

  const { sheetLayout } = buildDiagramSheets(g, cell, hdr);

  const scopeNote = isPartial
    ? `현재 화면(${S.focusName ? '선후행:' + S.focusName : ''}${S.groupFilter ? (S.focusName ? ' / ' : '') + '그룹:' + S.groupFilter : ''}${!S.focusName && !S.groupFilter ? '부분' : ''} · 배치 ${g.jobs.length}개)`
    : `전체 XML · 배치 ${g.jobs.length}개`;

  const sheet0 = `<Worksheet ss:Name="내보내기범위">
<Table>
${hdr('항목', '값')}
<Row>${cell('범위')}${cell(scopeNote)}</Row>
<Row>${cell('배치 수')}${cell(g.jobs.length, 'Number')}</Row>
<Row>${cell('의존성 수')}${cell(g.edges.length, 'Number')}</Row>
<Row>${cell('기준 배치')}${cell(S.focusName || '')}</Row>
<Row>${cell('그룹 필터')}${cell(S.groupFilter || '')}</Row>
<Row>${cell('다이어그램시트')}${cell('다이어그램(계층)=화면과 같은 왼쪽→오른쪽 단계 표')}</Row>
</Table></Worksheet>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:x="urn:schemas-microsoft-com:office:excel">
<Styles>
  <Style ss:ID="Default"/>
  <Style ss:ID="H">
    <Font ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#1f4e79" ss:Pattern="Solid"/>
  </Style>
</Styles>
${sheet0}${sheetLayout}${sheet1}${sheet2}${sheet3}
</Workbook>`;

  const blob = new Blob(['\uFEFF' + xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `ControlM_배치선후행_${new Date().toISOString().slice(0, 10)}${scopeSuffix()}.xls`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
