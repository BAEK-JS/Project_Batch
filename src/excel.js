import { S } from './state.js';

export function exportExcel() {
  const g = S.graph; if (!g) return;

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
${cell((g.jobs.find(j => j.name === r.from) || {}).desc || '')}
${cell((g.jobs.find(j => j.name === r.to)   || {}).desc || '')}
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
${sheet1}${sheet2}${sheet3}
</Workbook>`;

  const blob = new Blob(['\uFEFF' + xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `ControlM_배치선후행_${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
