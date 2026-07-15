export function sanitizeXML(xmlStr) {
  // Control-M export에서 VERSION_HOST="<DOWNLOAD>" 처럼
  // 속성값 안에 이스케이프되지 않은 꺽쇠(<>)가 포함되는 경우가 있음.
  return xmlStr.replace(/="([^"]*)"/g, (_, v) => {
    const fixed = v.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `="${fixed}"`;
  });
}

export function parseXML(xmlStr) {
  const cleaned = sanitizeXML(xmlStr.trim());
  const doc = new DOMParser().parseFromString(cleaned, 'text/xml');
  const errEl = doc.querySelector('parsererror');
  if (errEl) throw new Error('XML 파싱 오류: ' + (errEl.textContent || '').slice(0, 250));

  const jobEls = [...doc.querySelectorAll('JOB')];
  if (!jobEls.length) throw new Error('JOB 엘리먼트를 찾을 수 없습니다. Control-M XML 형식인지 확인하세요.');

  const normalizeAndOr = v =>
    (!v || v === 'A' || v === 'AND') ? 'AND' : (v === 'O' || v === 'OR') ? 'OR' : v;

  const jobs = [];
  for (const el of jobEls) {
    const name = el.getAttribute('JOBNAME') || el.getAttribute('JOB_NAME') || '';
    if (!name) continue;
    jobs.push({
      name,
      app:      el.getAttribute('APPLICATION')     || '',
      sub:      el.getAttribute('SUB_APPLICATION') || '',
      type:     el.getAttribute('TASKTYPE') || el.getAttribute('TASK_TYPE') || '',
      desc:     el.getAttribute('DESCRIPTION')     || '',
      folder:   el.closest('FOLDER')?.getAttribute('FOLDER_NAME') || '',
      nodeId:   el.getAttribute('NODEID')    || '',
      timeFrom: el.getAttribute('TIMEFROM')  || '',
      runAs:    el.getAttribute('RUN_AS')    || '',
      cmdLine:  el.getAttribute('CMDLINE')   || '',
      memName:  el.getAttribute('MEMNAME')   || '',
      memLib:   el.getAttribute('MEMLIB')    || '',
      daysCal:  el.getAttribute('DAYSCAL')   || '',
      priority: el.getAttribute('PRIORITY')  || '',
      maxWait:  el.getAttribute('MAXWAIT')   || '',
      critical: el.getAttribute('CRITICAL')  || '0',
      cyclic:   el.getAttribute('CYCLIC')    || '0',
      inConds:  [...el.querySelectorAll('INCOND')].map(c => ({
        name:  c.getAttribute('NAME')   || '',
        odate: c.getAttribute('ODATE')  || 'ODAT',
        andOr: normalizeAndOr(c.getAttribute('AND_OR')),
      })).filter(c => c.name),
      outConds: [...el.querySelectorAll('OUTCOND')].map(c => ({
        name:  c.getAttribute('NAME')  || '',
        odate: c.getAttribute('ODATE') || 'ODAT',
        sign:  c.getAttribute('SIGN')  || '+',
      })).filter(c => c.name),
    });
  }

  const prod = new Map();
  for (const j of jobs)
    for (const c of j.outConds)
      if (c.sign === '+') prod.set(c.name, j.name);

  const edges = [], seen = new Set();
  for (const j of jobs)
    for (const c of j.inConds) {
      const from = prod.get(c.name);
      if (from && from !== j.name) {
        const k = from + '→' + j.name;
        if (!seen.has(k)) { seen.add(k); edges.push({ from, to: j.name, cond: c.name }); }
      }
    }

  return { jobs, edges };
}
