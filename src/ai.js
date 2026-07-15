import { S, API, EMB, AI } from './state.js';
import { $ , esc } from './utils.js';
import { setFocus, setGroupFocus } from './focus.js';

function listGroupNames() {
  if (!S.graph?.jobs?.length) return [];
  const set = new Set();
  for (const j of S.graph.jobs) {
    const g = j.sub || j.app || j.folder;
    if (g) set.add(g);
  }
  return [...set].sort((a, b) => b.length - a.length);
}

function jobCountInGroup(group) {
  return S.graph.jobs.filter(j => (j.sub || j.app || j.folder) === group).length;
}

/** "○○ 그룹 보여줘" 의도에서 그룹명 추출 */
export function resolveShowGroupIntent(msg) {
  if (!msg || !S.graph?.jobs?.length) return null;
  const text = msg.trim();
  const showIntent = /(보여\s*줘|보여줘|표시해|표시해\s*줘|포커스|다이어그램에|그려\s*줘|찾아\s*줘|그룹)/i.test(text);
  if (!showIntent) return null;

  const groups = listGroupNames();
  if (!groups.length) return null;

  // 1) 전문 그룹명 포함
  for (const g of groups) {
    if (text.includes(g)) return g;
  }

  // 2) "그룹" 키워드가 있거나 토큰 부분 일치
  const preferGroup = /그룹/.test(text);
  const tokens = text
    .replace(/[^\w가-힣._-]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2);
  const scored = [];
  for (const token of tokens) {
    if (/(보여|표시|포커스|선후행|다이어그램|배치|분석|질문|그룹)/.test(token)) continue;
    for (const g of groups) {
      if (g === token || g.includes(token) || token.includes(g)) {
        scored.push({ name: g, score: g === token ? 100 : Math.min(g.length, token.length) + (preferGroup ? 20 : 0) });
      }
    }
  }
  if (scored.length) {
    scored.sort((a, b) => b.score - a.score);
    return scored[0].name;
  }
  return null;
}

/** "○○ 보여줘/선후행/포커스" 의도에서 배치명 추출 */
export function resolveShowJobIntent(msg) {
  if (!msg || !S.graph?.jobs?.length) return null;
  const text = msg.trim();
  const showIntent = /(보여\s*줘|보여줘|표시해|표시해\s*줘|포커스|선후행|다이어그램에|그려\s*줘|찾아\s*줘)/i.test(text);
  if (!showIntent) return null;
  // 명시적 그룹 요청이면 잡 매칭보다 그룹 우선 (호출측에서 그룹 먼저 처리)
  if (/그룹/.test(text) && !/(배치|JOB|잡)/i.test(text)) return null;

  const names = S.graph.jobs.map(j => j.name).sort((a, b) => b.length - a.length);
  const lower = text.toLowerCase();

  for (const name of names) {
    if (text.includes(name) || lower.includes(name.toLowerCase())) return name;
  }

  const tokens = text
    .replace(/[^\w가-힣._-]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 4);
  const scored = [];
  for (const token of tokens) {
    const tl = token.toLowerCase();
    if (/(보여|표시|포커스|선후행|다이어그램|배치|분석|질문|그룹)/.test(tl)) continue;
    for (const name of names) {
      const nl = name.toLowerCase();
      if (nl === tl || nl.includes(tl) || tl.includes(nl)) {
        scored.push({ name, score: nl === tl ? 100 : Math.min(nl.length, tl.length) });
      }
    }
  }
  if (scored.length) {
    scored.sort((a, b) => b.score - a.score);
    return scored[0].name;
  }
  return null;
}

function matchLongestInText(text, names, minLen = 2) {
  if (!text || !names?.length) return null;
  const lower = text.toLowerCase();
  const sorted = [...names].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    if (!name || name.length < minLen) continue;
    if (text.includes(name) || lower.includes(name.toLowerCase())) return name;
  }
  return null;
}

function allConditionNames() {
  const set = new Set();
  for (const j of S.graph?.jobs || []) {
    for (const c of j.inConds || []) if (c.name) set.add(c.name);
    for (const c of j.outConds || []) if (c.name) set.add(c.name);
  }
  return [...set];
}

function numberedList(items) {
  if (!items.length) return '(없음)';
  return items.map((x, i) => `${i + 1}. ${x}`).join('\n');
}

/**
 * 선후행·조건 목록 조회 명령
 * 예: "JOB01 선행 목록", "그룹A 후행 알려줘", "BCOFN0001-OK 선행조건 가진 배치"
 */
export function resolveListQuery(msg) {
  if (!msg || !S.graph?.jobs?.length) return null;
  const text = msg.trim();

  const diagramOnly = /(보여\s*줘|보여줘|표시해|포커스|다이어그램에|그려\s*줘)/i.test(text)
    && !/(목록|리스트|조건|알려)/i.test(text);
  if (diagramOnly) return null;

  const wantsList = /(목록|리스트|알려\s*줘|알려줘|뭐가\s*있|어떤\s*배치|가진|갖고|있는\s*배|있는\s*것|있는\s*거|조회)/i.test(text)
    || (/(선행|후행|선후행)/.test(text) && /(관계|누구|뭐|어느|리스트|목록|알려)/.test(text));
  const condPhrase = /(선행\s*조건|후행\s*조건|선행기준|IN\s*조건|OUT\s*조건|INCOND|OUTCOND|조건으로|조건\s*기준)/i.test(text);
  if (!wantsList && !condPhrase) return null;

  const wantPredOnly = /선행/.test(text) && !/후행/.test(text) && !/선후행/.test(text);
  const wantSuccOnly = /후행/.test(text) && !/선행/.test(text);
  const wantOutCond = /(OUT\s*조건|OUTCOND|OUT으로|내보내는\s*조건|생산하는\s*조건)/i.test(text);
  const wantInCond = /(IN\s*조건|INCOND|선행\s*조건|선행기준|조건으로\s*가지|조건으로\s*갖고)/i.test(text)
    || (condPhrase && !wantOutCond);

  // 1) 조건명 우선 (BCOFN0001-OK 등)
  const cond = matchLongestInText(text, allConditionNames(), 3);
  if (cond && (condPhrase || /조건/.test(text))) {
    return {
      kind: 'cond',
      cond,
      mode: wantOutCond && !wantInCond ? 'out' : wantInCond && !wantOutCond ? 'in' : 'both',
    };
  }

  // 2) 그룹 (명시적 "그룹" 키워드)
  const groups = listGroupNames();
  if (/그룹/.test(text)) {
    const group = matchLongestInText(text, groups, 2);
    if (group) {
      return {
        kind: 'group',
        group,
        mode: wantPredOnly ? 'pred' : wantSuccOnly ? 'succ' : 'both',
      };
    }
  }

  // 3) 배치
  const job = matchLongestInText(text, S.graph.jobs.map(j => j.name), 3);
  if (job) {
    return {
      kind: 'job',
      job,
      mode: wantPredOnly ? 'pred' : wantSuccOnly ? 'succ' : 'both',
    };
  }

  // 4) 조건명만 매칭 (키워드 약해도 조건명이 본문에 있으면)
  if (cond && (wantsList || condPhrase)) {
    return { kind: 'cond', cond, mode: wantOutCond ? 'out' : wantInCond ? 'in' : 'both' };
  }
  return null;
}

/** 목록 조회 결과를 텍스트로 생성 (전체 그래프 기준, LLM 없이 정확) */
export function formatListQueryAnswer(q) {
  const g = S.graph;
  if (!g || !q) return null;

  if (q.kind === 'cond') {
    const inJobs = g.jobs
      .filter(j => (j.inConds || []).some(c => c.name === q.cond))
      .map(j => j.name)
      .sort((a, b) => a.localeCompare(b, 'ko'));
    const outJobs = g.jobs
      .filter(j => (j.outConds || []).some(c => c.name === q.cond && (c.sign === '+' || !c.sign)))
      .map(j => {
        const signs = (j.outConds || []).filter(c => c.name === q.cond).map(c => c.sign).join('/');
        return signs && signs !== '+' ? `${j.name} (SIGN ${signs})` : j.name;
      })
      .sort((a, b) => a.localeCompare(b, 'ko'));
    const edgeUsers = g.edges
      .filter(e => e.cond === q.cond)
      .map(e => `${e.from} → ${e.to}`);
    let body = `🔖 조건 "${q.cond}" 조회 결과\n`;
    if (q.mode === 'in' || q.mode === 'both') {
      body += `\n■ IN(선행조건)으로 가진 배치 · ${inJobs.length}개\n${numberedList(inJobs)}\n`;
    }
    if (q.mode === 'out' || q.mode === 'both') {
      body += `\n■ OUT으로 내보내는 배치 · ${outJobs.length}개\n${numberedList(outJobs)}\n`;
    }
    if (edgeUsers.length && q.mode === 'both') {
      body += `\n■ 다이어그램 의존성 (이 조건으로 연결된 선) · ${edgeUsers.length}개\n${numberedList(edgeUsers)}\n`;
    }
    return body.trim();
  }

  if (q.kind === 'job') {
    const upEdges = g.edges.filter(e => e.to === q.job);
    const dnEdges = g.edges.filter(e => e.from === q.job);
    const job = g.jobs.find(j => j.name === q.job);
    let body = `📍 배치 "${q.job}" 선후행 목록\n`;
    if (q.mode === 'pred' || q.mode === 'both') {
      const lines = upEdges.map(e => e.cond ? `${e.from}  (조건: ${e.cond})` : e.from);
      body += `\n■ 선행 · ${upEdges.length}개\n${numberedList(lines)}\n`;
      if (job?.inConds?.length) {
        body += `\n· IN 조건: ${job.inConds.map(c => c.name).join(', ')}\n`;
      }
    }
    if (q.mode === 'succ' || q.mode === 'both') {
      const lines = dnEdges.map(e => e.cond ? `${e.to}  (조건: ${e.cond})` : e.to);
      body += `\n■ 후행 · ${dnEdges.length}개\n${numberedList(lines)}\n`;
      if (job?.outConds?.length) {
        body += `\n· OUT 조건: ${job.outConds.map(c => `${c.name}${c.sign && c.sign !== '+' ? '(' + c.sign + ')' : ''}`).join(', ')}\n`;
      }
    }
    return body.trim();
  }

  if (q.kind === 'group') {
    const members = g.jobs.filter(j => (j.sub || j.app || j.folder) === q.group);
    const memberNames = new Set(members.map(j => j.name));
    const up = new Map(); // external or any pred
    const dn = new Map();
    for (const e of g.edges) {
      if (memberNames.has(e.to) && !memberNames.has(e.from)) {
        const key = e.from;
        if (!up.has(key)) up.set(key, []);
        up.get(key).push(e.cond || '');
      }
      if (memberNames.has(e.from) && !memberNames.has(e.to)) {
        const key = e.to;
        if (!dn.has(key)) dn.set(key, []);
        dn.get(key).push(e.cond || '');
      }
    }
    // 그룹 내부 선후행도 보고 싶으면 mode both에 포함
    const inside = g.edges.filter(e => memberNames.has(e.from) && memberNames.has(e.to));
    let body = `📁 그룹 "${q.group}" 선후행 목록\n`;
    body += `· 그룹 내 배치 ${members.length}개\n`;
    if (q.mode === 'pred' || q.mode === 'both') {
      const lines = [...up.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
        .map(([name, conds]) => {
          const c = [...new Set(conds.filter(Boolean))];
          return c.length ? `${name}  (조건: ${c.join(', ')})` : name;
        });
      body += `\n■ 그룹 밖 → 그룹 안 (외부 선행) · ${lines.length}개\n${numberedList(lines)}\n`;
    }
    if (q.mode === 'succ' || q.mode === 'both') {
      const lines = [...dn.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
        .map(([name, conds]) => {
          const c = [...new Set(conds.filter(Boolean))];
          return c.length ? `${name}  (조건: ${c.join(', ')})` : name;
        });
      body += `\n■ 그룹 안 → 그룹 밖 (외부 후행) · ${lines.length}개\n${numberedList(lines)}\n`;
    }
    if (q.mode === 'both' && inside.length) {
      const lines = inside
        .map(e => e.cond ? `${e.from} → ${e.to}  (${e.cond})` : `${e.from} → ${e.to}`)
        .sort((a, b) => a.localeCompare(b, 'ko'));
      body += `\n■ 그룹 내부 의존성 · ${lines.length}개\n${numberedList(lines.slice(0, 200))}`;
      if (lines.length > 200) body += `\n… 외 ${lines.length - 200}개 생략`;
      body += '\n';
    }
    return body.trim();
  }

  return null;
}

/** 로컬 목록 답변 표시 (+ API 있으면 짧은 정리만 추가 요청) */
async function presentListAnswer(userMsg, answerText) {
  AI.error = '';
  AI.text = answerText;
  if (!AI.history.length) {
    AI.history = [{
      role: 'system',
      content: '당신은 Control-M 배치 워크플로우 전문가입니다. 목록·조건 조회 결과는 시스템이 이미 정확히 계산했습니다. 배치명·조건명을 바꾸거나 생략하지 마세요.',
    }];
  }
  AI.history.push({ role: 'user', content: userMsg });
  AI.history.push({ role: 'assistant', content: answerText });
  AI.running = false;
  renderAIPane();
  stayOnAiTab();

  // API가 있으면 목록을 짧게 한국어로만 정리 (사실 데이터는 위에 고정)
  const canStream = !!API.key && !(API.isDify && !normalizeBaseUrl(API.baseUrl));
  if (!canStream) return;

  AI.running = true;
  renderAIPane();
  stayOnAiTab();
  const follow =
    '아래는 시스템이 전체 XML에서 조회한 정확한 목록입니다.\n' +
    '배치명·조건명을 빠뜨리거나 바꾸지 말고, 2~4문장으로만 요약을 덧붙여 주세요.\n\n' +
    answerText;
  let newText = answerText + '\n\n——\n';
  try {
    await streamChat(
      [
        ...AI.history.slice(0, -1),
        { role: 'user', content: follow },
      ],
      chunk => {
        newText += chunk;
        AI.text = newText;
        const el = $('ai-output');
        if (el) el.innerHTML = linkifyJobNames(newText);
      },
    );
    AI.history[AI.history.length - 1] = { role: 'assistant', content: newText };
    AI.running = false;
  } catch (e) {
    AI.running = false;
    // 목록은 이미 있으므로 요약 실패는 힌트만
    AI.error = '목록은 표시됨 · 요약 실패: ' + e.message;
  }
  renderAIPane();
  stayOnAiTab();
}

function linkifyJobNames(text) {
  if (!text || !S.graph?.jobs?.length) return esc(text);
  const names = [...new Set(S.graph.jobs.map(j => j.name))].sort((a, b) => b.length - a.length);
  const groups = listGroupNames();
  if (!names.length && !groups.length) return esc(text);

  let out = '';
  let i = 0;
  while (i < text.length) {
    let hit = null;
    let kind = 'job';
    for (const name of names) {
      if (text.startsWith(name, i)) { hit = name; kind = 'job'; break; }
    }
    if (!hit) {
      for (const g of groups) {
        if (text.startsWith(g, i)) { hit = g; kind = 'group'; break; }
      }
    }
    if (hit) {
      if (kind === 'job') {
        out += `<button type="button" class="ai-job-link" data-job="${esc(hit)}" title="선후행 보기">${esc(hit)}</button>`;
      } else {
        out += `<button type="button" class="ai-job-link ai-group-link" data-group="${esc(hit)}" title="그룹 보기">${esc(hit)}</button>`;
      }
      i += hit.length;
    } else {
      const ch = text[i];
      out += ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch;
      i += 1;
    }
  }
  return out;
}

function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

export function exportAnalysisTxt() {
  if (!AI.text) { alert('저장할 분석 결과가 없습니다.'); return; }
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(`ControlM_AI분석_${stamp}.txt`, AI.text, 'text/plain;charset=utf-8');
}

export function exportAnalysisExcel() {
  if (!AI.text) { alert('저장할 분석 결과가 없습니다.'); return; }
  const xlEsc = v => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const stamp = new Date().toISOString().slice(0, 10);
  const lines = AI.text.split(/\r?\n/);
  const rows = lines.map(line =>
    `<Row><Cell ss:StyleID="T"><Data ss:Type="String">${xlEsc(line)}</Data></Cell></Row>`
  ).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
  <Style ss:ID="Default"/>
  <Style ss:ID="H"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1f4e79" ss:Pattern="Solid"/></Style>
  <Style ss:ID="T"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>
</Styles>
<Worksheet ss:Name="AI 분석">
<Table>
<Column ss:Width="480"/>
<Row><Cell ss:StyleID="H"><Data ss:Type="String">AI 분석 결과 (${stamp})</Data></Cell></Row>
${rows}
</Table>
</Worksheet>
</Workbook>`;
  downloadBlob(`ControlM_AI분석_${stamp}.xls`, '\uFEFF' + xml, 'application/vnd.ms-excel;charset=utf-8');
}

function stayOnAiTab() {
  S.tab = 'ai';
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('on', el.dataset.tab === 'ai'));
  document.querySelectorAll('.pane').forEach(el => el.classList.toggle('on', el.id === 'pane-ai'));
  const footer = $('sfooter');
  if (footer) footer.classList.add('on');
}

async function runShowAndAnalyze(userMsg, note, followPrompt) {
  AI.running = true; AI.error = '';
  AI.text = note;
  if (!AI.history.length) {
    AI.history = [
      { role: 'system', content: '당신은 Control-M 배치 워크플로우 전문가입니다. 배치 구조를 분석하여 실용적이고 명확한 한국어로 답변해주세요. 사용자가 특정 배치/그룹을 보여달라고 하면 해당 범위 중심으로 설명하세요.' },
    ];
  }
  AI.history.push({ role: 'user', content: userMsg });
  renderAIPane();
  stayOnAiTab();

  AI.history.push({ role: 'user', content: followPrompt });
  let newText = note + '\n\n';
  try {
    await streamChat(AI.history, chunk => {
      newText += chunk; AI.text = newText;
      const el = $('ai-output');
      if (el) el.innerHTML = linkifyJobNames(newText);
    });
    AI.history.push({ role: 'assistant', content: newText });
    AI.running = false;
  } catch (e) {
    AI.running = false; AI.error = e.message;
  }
  renderAIPane();
  stayOnAiTab();
}

// ── 배치 텍스트 빌드 (임베딩 & AI 분석용) ─────────────────────────────────────
export function buildJobText(job, graph) {
  const g = graph || S.graph;
  const up = g.edges.filter(e => e.to   === job.name).map(e => e.from);
  const dn = g.edges.filter(e => e.from === job.name).map(e => e.to);
  return [
    `배치 이름: ${job.name}`,
    job.desc     ? `설명: ${job.desc}`              : '',
    job.app      ? `어플리케이션: ${job.app}`        : '',
    job.sub      ? `서브: ${job.sub}`               : '',
    job.type     ? `유형: ${job.type}`              : '',
    job.nodeId   ? `실행 서버: ${job.nodeId}`        : '',
    job.timeFrom ? `시작 시간: ${job.timeFrom}`      : '',
    job.runAs    ? `서버 계정: ${job.runAs}`         : '',
    job.daysCal  ? `캘린더: ${job.daysCal}`         : '',
    job.memName  ? `스크립트: ${job.memName}`        : '',
    job.folder   ? `폴더: ${job.folder}`            : '',
    job.inConds.length  ? `IN 조건: ${job.inConds.map(c => c.name).join(', ')}`  : '',
    job.outConds.length ? `OUT 조건: ${job.outConds.map(c => c.name).join(', ')}` : '',
    up.length ? `선행 배치: ${up.join(', ')}` : '',
    dn.length ? `후행 배치: ${dn.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

export function cosineSim(a, b) {
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; ma += a[i] * a[i]; mb += b[i] * b[i]; }
  return dot / (Math.sqrt(ma) * Math.sqrt(mb));
}

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (API.key) h.Authorization = `Bearer ${API.key}`;
  return h;
}

function normalizeBaseUrl(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

function difyChatUrl() {
  const base = normalizeBaseUrl(API.baseUrl);
  if (!base) throw new Error('Dify API 엔드포인트를 설정해주세요 (예: http://서버/v1)');
  return base.endsWith('chat-messages') ? base : `${base}/chat-messages`;
}

export async function fetchEmbeddings(texts) {
  if (API.isDify) {
    throw new Error('사내 Dify 모드에서는 임베딩 API를 아직 지원하지 않습니다. 키워드 검색을 이용해 주세요.');
  }
  const res = await fetch(`${normalizeBaseUrl(API.baseUrl)}/embeddings`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ model: API.embedModel, input: texts }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `임베딩 API 오류 (${res.status})`);
  return json.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

export async function buildEmbeddings() {
  if (!API.key) { alert('API 키를 먼저 설정해주세요 (헤더 ⚙ 버튼).'); return; }
  if (API.isDify) {
    alert('사내 Dify/Ollama 모드에서는 시맨틱 임베딩을 지원하지 않습니다.\nAI 분석은 사용 가능하며, 검색은 키워드 검색으로 동작합니다.');
    return;
  }
  if (!S.graph) return;
  EMB.built = false; EMB.building = true; EMB.progress = 0; EMB.total = S.graph.jobs.length; EMB.data.clear();
  renderAIPane();
  const BATCH = 20, jobs = S.graph.jobs;
  try {
    for (let i = 0; i < jobs.length; i += BATCH) {
      const batch = jobs.slice(i, i + BATCH);
      const embeddings = await fetchEmbeddings(batch.map(j => buildJobText(j)));
      batch.forEach((j, k) => EMB.data.set(j.name, embeddings[k]));
      EMB.progress = Math.min(i + BATCH, jobs.length);
      renderAIPaneProgress();
    }
    EMB.built = true;
  } catch (e) {
    alert('임베딩 생성 실패: ' + e.message);
  } finally {
    EMB.building = false; renderAIPane();
  }
}

/** OpenAI 호환 SSE */
async function streamOpenAI(messages, onChunk) {
  const res = await fetch(`${normalizeBaseUrl(API.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ model: API.chatModel, messages, stream: true }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
    throw new Error(j.error?.message || `API 오류 (${res.status})`);
  }
  await readSse(res, (j) => {
    const c = j.choices?.[0]?.delta?.content;
    if (c) onChunk(c);
  });
}

/**
 * Dify Chat API (/v1/chat-messages)
 * messages → query 로 변환, conversation_id 로 이어가기
 */
async function streamDify(messages, onChunk) {
  const systemParts = messages.filter(m => m.role === 'system').map(m => m.content);
  const userParts = messages.filter(m => m.role === 'user').map(m => m.content);
  const isFollowUp = !!AI.conversationId;
  let query;
  if (isFollowUp) {
    query = userParts.at(-1) || '';
  } else {
    const sys = systemParts.join('\n\n');
    const usr = userParts.join('\n\n');
    query = sys ? `${sys}\n\n---\n\n${usr}` : usr;
  }

  const body = {
    inputs: {},
    query,
    response_mode: 'streaming',
    conversation_id: AI.conversationId || '',
    user: API.userId || 'batch-diagram',
  };

  const res = await fetch(difyChatUrl(), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const msg = j.message || j.error?.message || j.code || `HTTP ${res.status}`;
    throw new Error(`Dify API 오류: ${msg}`);
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json') && !ct.includes('event-stream') && !ct.includes('text/event-stream')) {
    const j = await res.json();
    if (j.conversation_id) AI.conversationId = j.conversation_id;
    if (j.answer) onChunk(j.answer);
    return;
  }

  await readSse(res, (j) => {
    if (j.conversation_id) AI.conversationId = j.conversation_id;
    if (j.event === 'error') {
      throw new Error(j.message || j.code || 'Dify 스트림 오류');
    }
    if (j.event === 'message' || j.event === 'agent_message') {
      if (j.answer) onChunk(j.answer);
    }
  });
}

async function readSse(res, onJson) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        onJson(JSON.parse(data));
      } catch {
        /* ignore partial / non-json */
      }
    }
  }
}

export async function streamChat(messages, onChunk) {
  if (API.isDify) return streamDify(messages, onChunk);
  return streamOpenAI(messages, onChunk);
}

const MAX_SUMMARY_CHARS = 48000;

export function jobGroupOf(job) {
  return job.sub || job.app || job.folder || '(미분류)';
}

/** 그룹명 → 배치 수 (이름순) */
export function listAiGroups() {
  const map = new Map();
  for (const j of S.graph?.jobs || []) {
    const g = jobGroupOf(j);
    map.set(g, (map.get(g) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'));
}

function graphFromJobNames(jobs, full) {
  const names = new Set(jobs.map(j => j.name));
  const edges = full.edges.filter(e => names.has(e.from) && names.has(e.to));
  return { jobs, edges };
}

/**
 * AI에 넣을 그래프 범위 결정
 * @returns {{ graph, label, compact?: boolean, error?: string }}
 */
export function resolveAiScope() {
  const full = S.graph;
  if (!full?.jobs?.length) return { error: '먼저 XML을 로드하고 다이어그램을 생성해주세요.' };

  const mode = AI.scopeMode || 'auto';

  if (mode === 'groups') {
    const sel = AI.selectedGroups;
    if (!sel?.size) return { error: '분석할 그룹을 하나 이상 선택해주세요.' };
    const jobs = full.jobs.filter(j => sel.has(jobGroupOf(j)));
    if (!jobs.length) return { error: '선택한 그룹에 배치가 없습니다.' };
    return {
      graph: graphFromJobNames(jobs, full),
      label: `선택 그룹 ${sel.size}개 (${[...sel].slice(0, 5).join(', ')}${sel.size > 5 ? ' …' : ''})`,
    };
  }

  if (mode === 'all') {
    return {
      graph: full,
      label: '전체',
      compact: full.jobs.length > 500,
    };
  }

  // auto: 현재 화면 우선
  if (S.viewGraph?.jobs?.length) {
    const label = S.groupFilter
      ? `현재 화면 · 그룹 ${S.groupFilter}`
      : S.focusName
        ? `현재 화면 · ${S.focusName} 선후행`
        : '현재 화면';
    return { graph: S.viewGraph, label };
  }
  if (S.groupFilter) {
    const jobs = full.jobs.filter(j => jobGroupOf(j) === S.groupFilter);
    return { graph: graphFromJobNames(jobs, full), label: `그룹 ${S.groupFilter}` };
  }

  // 전체 화면 + 대용량 → 요약만 (그룹 선택 유도)
  if (full.jobs.length > 300) {
    return { graph: full, label: '전체(요약 · 상세는 그룹 선택)', compact: true };
  }
  return { graph: full, label: '전체' };
}

function buildCompactSummary(g, label) {
  const hasOut = new Set();
  const hasIn = new Set();
  const deg = new Map();
  for (const j of g.jobs) deg.set(j.name, 0);
  for (const e of g.edges) {
    hasOut.add(e.from);
    hasIn.add(e.to);
    deg.set(e.from, (deg.get(e.from) || 0) + 1);
    deg.set(e.to, (deg.get(e.to) || 0) + 1);
  }
  const roots = g.jobs.filter(j => !hasIn.has(j.name)).map(j => j.name);
  const leaves = g.jobs.filter(j => !hasOut.has(j.name)).map(j => j.name);
  const byGroup = new Map();
  for (const j of g.jobs) {
    const key = jobGroupOf(j);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(j.name);
  }
  const hubs = [...deg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);

  let s = `Control-M 배치 구조 [${label} · 요약]\n`;
  s += `배치: ${g.jobs.length}개 | 의존성: ${g.edges.length}개 | 그룹: ${byGroup.size}개\n`;
  s += `시작 배치(일부): ${roots.slice(0, 40).join(', ')}${roots.length > 40 ? ` …외 ${roots.length - 40}` : ''}\n`;
  s += `종료 배치(일부): ${leaves.slice(0, 40).join(', ')}${leaves.length > 40 ? ` …외 ${leaves.length - 40}` : ''}\n\n`;
  s += `■ 그룹별 배치 수\n`;
  for (const [name, list] of [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'))) {
    const sample = list.slice(0, 8).join(', ');
    s += `• ${name}: ${list.length}개${list.length ? ` (예: ${sample}${list.length > 8 ? ' …' : ''})` : ''}\n`;
  }
  s += `\n■ 연결 많은 배치(허브)\n`;
  for (const [name, d] of hubs) s += `• ${name} (연결 ${d})\n`;
  s += `\n※ 상세 선후행이 필요하면 AI 탭에서 "그룹 선택" 후 해당 그룹만 분석하세요.\n`;
  return s;
}

/** @param {{ graph?: object, label?: string, compact?: boolean }} [scope] */
export function buildGraphSummary(scope) {
  const resolved = scope?.graph ? scope : resolveAiScope();
  if (resolved.error || !resolved.graph) return resolved.error || '';

  const g = resolved.graph;
  const label = resolved.label || '범위';
  if (resolved.compact) return buildCompactSummary(g, label);

  const preds = new Map();
  const succs = new Map();
  for (const j of g.jobs) {
    preds.set(j.name, []);
    succs.set(j.name, []);
  }
  for (const e of g.edges) {
    if (succs.has(e.from)) succs.get(e.from).push(e.to);
    if (preds.has(e.to)) preds.get(e.to).push(e.from);
  }
  const roots = g.jobs.filter(j => !(preds.get(j.name) || []).length).map(j => j.name);
  const leaves = g.jobs.filter(j => !(succs.get(j.name) || []).length).map(j => j.name);

  let s = `Control-M 배치 구조 [${label}]\n배치: ${g.jobs.length}개 | 의존성: ${g.edges.length}개\n`;
  s += `시작 배치: ${roots.join(', ')}\n종료 배치: ${leaves.join(', ')}\n\n`;

  let omitted = 0;
  for (const job of g.jobs) {
    const up = preds.get(job.name) || [];
    const dn = succs.get(job.name) || [];
    const meta = [job.app, job.sub, job.type, job.desc].filter(Boolean).join('/');
    let block = `• ${job.name}${meta ? ' [' + meta + ']' : ''}\n`;
    if (up.length) block += `  ← ${up.join(', ')}\n`;
    if (dn.length) block += `  → ${dn.join(', ')}\n`;
    if (s.length + block.length > MAX_SUMMARY_CHARS) {
      omitted = g.jobs.length - (g.jobs.indexOf(job));
      break;
    }
    s += block;
  }
  if (omitted > 0) {
    s += `\n… 분량 제한으로 ${omitted}개 배치 상세 생략. 그룹을 나눠 다시 분석하세요.\n`;
  }
  return s;
}

export function describeAiScope() {
  const scope = resolveAiScope();
  if (scope.error) return scope.error;
  const n = scope.graph.jobs.length;
  const e = scope.graph.edges.length;
  return `전송 범위: ${scope.label} · 배치 ${n}개 · 의존성 ${e}개${scope.compact ? ' · 요약 모드' : ''}`;
}

export async function runAnalysis(userMsg) {
  if (!S.graph) return;

  // 선후행·조건 목록 명령 → 전체 그래프에서 정확히 조회 (대용량에도 LLM 컨텍스트 불필요)
  if (userMsg) {
    const listQ = resolveListQuery(userMsg);
    if (listQ) {
      const answer = formatListQueryAnswer(listQ);
      if (answer) {
        await presentListAnswer(userMsg, answer);
        return;
      }
    }
  }

  if (!API.key) { alert('API 키를 먼저 설정해주세요 (헤더 ⚙ 버튼).'); return; }
  if (API.isDify && !normalizeBaseUrl(API.baseUrl)) {
    alert('사내 LLM 엔드포인트를 설정해주세요.\n예: http://128.1.233.75/v1');
    return;
  }

  // 그룹 / 배치 "보여줘" → 다이어그램만 갱신, AI 탭 유지
  if (userMsg) {
    const preferGroup = /그룹/.test(userMsg);
    const showGroup = resolveShowGroupIntent(userMsg);
    const showJob = preferGroup ? null : resolveShowJobIntent(userMsg);

    if (preferGroup && showGroup) {
      setGroupFocus(showGroup, { keepTab: true });
      const cnt = jobCountInGroup(showGroup);
      const note =
        `📁 그룹 "${showGroup}" 을(를) 다이어그램에 표시했습니다.\n` +
        `그룹 내 배치 약 ${cnt}개 (연관 선행·후행 포함 가능)\n` +
        `\n아래에서 이 그룹에 대한 추가 분석을 이어갑니다.`;
      await runShowAndAnalyze(
        userMsg,
        note,
        `그룹 "${showGroup}"(배치 약 ${cnt}개)의 역할과 주요 흐름을 간단히 설명해 주세요.`,
      );
      return;
    }

    if (showJob) {
      setFocus(showJob, { keepTab: true });
      const g = S.graph;
      const up = g.edges.filter(e => e.to === showJob).map(e => e.from);
      const dn = g.edges.filter(e => e.from === showJob).map(e => e.to);
      const note =
        `📍 "${showJob}" 선후행을 다이어그램에 표시했습니다.\n` +
        `선행 ${up.length}개 · 후행 ${dn.length}개\n` +
        (up.length ? `← ${up.slice(0, 12).join(', ')}${up.length > 12 ? ' …' : ''}\n` : '') +
        (dn.length ? `→ ${dn.slice(0, 12).join(', ')}${dn.length > 12 ? ' …' : ''}\n` : '') +
        `\n아래에서 이 배치에 대한 추가 분석을 이어갑니다.`;
      await runShowAndAnalyze(
        userMsg,
        note,
        `배치 "${showJob}"의 선후행 관계를 간단히 설명해 주세요.\n선행: ${up.join(', ') || '(없음)'}\n후행: ${dn.join(', ') || '(없음)'}`,
      );
      return;
    }

    // 그룹 키워드 없이 그룹명만 매칭된 경우
    if (showGroup && !showJob) {
      setGroupFocus(showGroup, { keepTab: true });
      const cnt = jobCountInGroup(showGroup);
      const note =
        `📁 그룹 "${showGroup}" 을(를) 다이어그램에 표시했습니다.\n` +
        `그룹 내 배치 약 ${cnt}개\n` +
        `\n아래에서 이 그룹에 대한 추가 분석을 이어갑니다.`;
      await runShowAndAnalyze(
        userMsg,
        note,
        `그룹 "${showGroup}"(배치 약 ${cnt}개)의 역할과 주요 흐름을 간단히 설명해 주세요.`,
      );
      return;
    }
  }

  const scope = resolveAiScope();
  if (scope.error) {
    alert(scope.error);
    return;
  }

  AI.running = true; AI.error = '';
  if (!userMsg) {
    // 배치 흐름 분석 (선택 범위)
    AI.text = '';
    AI.history = [];
    AI.conversationId = '';
    const summary = buildGraphSummary(scope);
    AI.history = [
      { role: 'system', content: '당신은 Control-M 배치 워크플로우 전문가입니다. 배치 구조를 분석하여 실용적이고 명확한 한국어로 답변해주세요. 특정 배치명·그룹명을 언급할 때는 이름을 정확히 쓰세요. 제공된 범위(그룹/화면)만 기준으로 답하세요. 사용자가 선후행 목록·조건(IN/OUT) 조회를 물으면 배치명을 빠짐없이 나열하세요.' },
      { role: 'user',   content: `다음 Control-M 배치 구조를 분석해주세요. (범위: ${scope.label})\n\n${summary}\n\n다음 항목으로 분석해주세요:\n1. 📋 배치 흐름 요약\n2. ⚡ 병렬 처리 구간 식별\n3. ⚠️ 잠재적 위험 요소 (단일 장애점, 병목 등)\n4. 💡 최적화 및 개선 제안` },
    ];
  } else {
    // 바로 질문 — 이력이 없으면 그래프 컨텍스트만 먼저 심어 둠
    if (!AI.history.length) {
      AI.conversationId = '';
      const summary = buildGraphSummary(scope);
      AI.history = [
        { role: 'system', content: '당신은 Control-M 배치 워크플로우 전문가입니다. 배치 구조를 분석하여 실용적이고 명확한 한국어로 답변해주세요. 특정 배치명·그룹명을 언급할 때는 이름을 정확히 쓰세요. 제공된 범위(그룹/화면)만 기준으로 답하세요. 사용자가 선후행 목록·조건(IN/OUT) 조회를 물으면 배치명을 빠짐없이 나열하세요.' },
        { role: 'user', content: `참고용 Control-M 배치 구조입니다. (범위: ${scope.label})\n이후 질문에 활용하세요.\n\n${summary}` },
        { role: 'assistant', content: `배치 구조(${scope.label})를 확인했습니다. 궁금한 점이나 보고 싶은 배치·그룹을 말씀해 주세요.` },
      ];
    }
    AI.history.push({ role: 'user', content: userMsg });
    AI.text = '';
  }
  renderAIPane();
  stayOnAiTab();
  const outputEl = $('ai-output');
  if (outputEl) outputEl.textContent = '';
  let newText = '';
  try {
    await streamChat(AI.history, chunk => {
      newText += chunk; AI.text = newText;
      const el = $('ai-output');
      if (el) el.innerHTML = linkifyJobNames(newText);
    });
    AI.history.push({ role: 'assistant', content: newText });
    AI.running = false;
  } catch (e) {
    AI.running = false; AI.error = e.message;
  }
  renderAIPane();
  stayOnAiTab();
}

export function renderAIPaneProgress() {
  const bar = $('embed-progress-fill');
  if (bar) bar.style.width = Math.round(EMB.progress / EMB.total * 100) + '%';
  const lbl = $('embed-progress-lbl');
  if (lbl) lbl.textContent = `임베딩 생성 중… (${EMB.progress}/${EMB.total})`;
}

export function renderAIPane() {
  const hasKey = !!API.key;
  const providerLabel = API.isDify ? '사내 Dify/Ollama' : esc(API.chatModel);
  let embStatus = '';
  if (API.isDify) {
    embStatus = `<div class="embed-bar">
  <div class="embed-row"><div class="sdot" style="color:var(--text3)"></div>
    <span style="color:var(--text3);font-size:12px">사내 모드 · 시맨틱 임베딩 미지원 · 키워드 검색 사용</span>
  </div>
</div>`;
  } else if (EMB.building) {
    const pct = Math.round(EMB.progress / EMB.total * 100);
    embStatus = `<div class="embed-bar">
  <div class="embed-row"><div class="sdot" style="color:var(--warning)"></div>
    <span id="embed-progress-lbl" style="color:var(--text2)">임베딩 생성 중… (${EMB.progress}/${EMB.total})</span>
  </div>
  <div class="progress"><div class="progress-fill" id="embed-progress-fill" style="width:${pct}%"></div></div>
</div>`;
  } else if (EMB.built) {
    embStatus = `<div class="embed-bar">
  <div class="embed-row"><div class="sdot" style="color:var(--success)"></div>
    <span style="color:var(--success);font-size:12px">임베딩 준비됨 · ${EMB.data.size}개 배치 · 시맨틱 검색 가능</span>
  </div>
</div>`;
  } else {
    embStatus = `<div class="embed-bar">
  <div class="embed-row"><div class="sdot" style="color:var(--text3)"></div>
    <span style="color:var(--text3);font-size:12px">임베딩 미생성 — 시맨틱 검색 비활성화</span>
  </div>
</div>`;
  }

  const canAsk = !!S.graph && !AI.running;
  const mode = AI.scopeMode || 'auto';
  const groups = listAiGroups();
  // 그룹 모드인데 선택이 비고 현재 그룹 필터가 있으면 미리 체크
  if (mode === 'groups' && !AI.selectedGroups.size && S.groupFilter) {
    AI.selectedGroups.add(S.groupFilter);
  }
  const groupListHtml = groups.length
    ? groups.map(([name, cnt]) => {
      const checked = AI.selectedGroups.has(name) ? ' checked' : '';
      return `<label><input type="checkbox" class="ai-grp-cb" value="${esc(name)}"${checked} ${AI.running ? 'disabled' : ''}>${esc(name)}<span>${cnt}</span></label>`;
    }).join('')
    : '<div style="color:var(--text3);font-size:11.5px;padding:4px">그룹 정보가 없습니다.</div>';

  let scopeHint = '';
  try { scopeHint = describeAiScope(); } catch { scopeHint = ''; }

  const scopeBox = `
  <div class="ai-scope">
    <div class="ai-scope-title">AI 분석 범위</div>
    <div class="ai-scope-modes">
      <label><input type="radio" name="ai-scope" value="auto" ${mode === 'auto' ? 'checked' : ''} ${AI.running ? 'disabled' : ''}> 현재 화면 (기본)</label>
      <label><input type="radio" name="ai-scope" value="groups" ${mode === 'groups' ? 'checked' : ''} ${AI.running ? 'disabled' : ''}> 그룹 선택</label>
      <label><input type="radio" name="ai-scope" value="all" ${mode === 'all' ? 'checked' : ''} ${AI.running ? 'disabled' : ''}> 전체 (대용량은 요약)</label>
    </div>
    <div id="ai-scope-groups-wrap" style="display:${mode === 'groups' ? 'block' : 'none'}">
      <div class="ai-scope-groups" id="ai-scope-groups">${groupListHtml}</div>
      <div class="ai-scope-actions">
        <button type="button" class="btn btn-g" id="btn-ai-grp-all" style="height:24px;padding:0 8px;font-size:11px" ${AI.running ? 'disabled' : ''}>전체 선택</button>
        <button type="button" class="btn btn-g" id="btn-ai-grp-none" style="height:24px;padding:0 8px;font-size:11px" ${AI.running ? 'disabled' : ''}>선택 해제</button>
      </div>
    </div>
    <div class="ai-scope-hint" id="ai-scope-hint">${esc(scopeHint)}</div>
  </div>`;

  const askBox = `
  <div class="ai-followup" style="margin-top:10px">
    <input type="text" id="ai-followup-inp" placeholder="예: BCOFN0001-OK 선행조건 목록 / JOB01 후행 알려줘" ${canAsk ? '' : 'disabled'}>
    <button class="btn btn-s" id="btn-followup" style="height:30px;padding:0 10px" ${canAsk ? '' : 'disabled'}>질문</button>
  </div>`;

  const outputSection = (AI.text || AI.running)
    ? `<div class="pane-pad" style="padding-top:8px">
  <div class="section-title" style="margin-top:0;display:flex;align-items:center;justify-content:space-between;gap:8px">
    <span>분석 결과</span>
    ${AI.text && !AI.running ? `<span class="btn-row" style="margin:0;gap:4px">
      <button type="button" class="btn btn-g" id="btn-ai-txt" style="height:26px;padding:0 8px;font-size:11px">TXT</button>
      <button type="button" class="btn btn-g" id="btn-ai-xls" style="height:26px;padding:0 8px;font-size:11px">엑셀</button>
    </span>` : ''}
  </div>
  <div class="ai-output${AI.running && !AI.text ? ' blink' : ''}" id="ai-output">${AI.text ? linkifyJobNames(AI.text) : ''}</div>
</div>` : '';

  $('ai-inner').innerHTML = `
<div class="pane-pad" style="padding-bottom:8px">
  <div class="api-status ${hasKey ? 'ok' : 'no'}">
    <div class="sdot"></div>
    ${hasKey ? `API 키 설정됨 · <span style="color:var(--text3)">${providerLabel}</span>` : 'API 키 미설정 — 헤더 ⚙ 에서 설정'}
  </div>
  <div class="btn-row" style="margin-top:0">
    <button class="btn btn-s" id="btn-embed" ${!hasKey || EMB.building || API.isDify ? 'disabled' : ''}>
      ${EMB.building ? '생성 중…' : EMB.built ? '임베딩 재생성' : '임베딩 생성'}
    </button>
    <button class="btn btn-p" id="btn-analyze" ${!hasKey || AI.running ? 'disabled' : ''}>
      ${AI.running ? '분석 중…' : '배치 흐름 분석'}
    </button>
  </div>
  ${scopeBox}
  ${askBox}
  <div style="font-size:10.5px;color:var(--text3);margin-top:8px;line-height:1.6">
    • <b>분석 범위</b>: 현재 화면 / 그룹 선택 / 전체(요약) 중 선택 후 분석<br>
    • <b>다이어그램</b>: "<code>배치명 보여줘</code>" · "<code>그룹명 그룹 보여줘</code>"<br>
    • <b>목록 조회</b>: "<code>배치명 선행 목록</code>" · "<code>그룹명 그룹 후행 알려줘</code>" · "<code>BCOFN0001-OK 선행조건 가진 배치</code>"<br>
    • <b>결과 저장</b>: 답변 후 TXT / 엑셀
  </div>
</div>
${embStatus}
${AI.error ? `<div class="err" style="display:block;margin:10px 13px">${esc(AI.error)}</div>` : ''}
${outputSection}`;

  const refreshScopeHint = () => {
    const el = $('ai-scope-hint');
    if (el) el.textContent = describeAiScope();
  };
  const syncGroupChecks = () => {
    AI.selectedGroups = new Set();
    document.querySelectorAll('.ai-grp-cb:checked').forEach(cb => {
      AI.selectedGroups.add(cb.value);
    });
    refreshScopeHint();
  };

  document.querySelectorAll('input[name="ai-scope"]').forEach(r => {
    r.addEventListener('change', () => {
      AI.scopeMode = r.value;
      const wrap = $('ai-scope-groups-wrap');
      if (wrap) wrap.style.display = AI.scopeMode === 'groups' ? 'block' : 'none';
      if (AI.scopeMode === 'groups' && !AI.selectedGroups.size && S.groupFilter) {
        AI.selectedGroups.add(S.groupFilter);
        document.querySelectorAll('.ai-grp-cb').forEach(cb => {
          cb.checked = AI.selectedGroups.has(cb.value);
        });
      }
      refreshScopeHint();
    });
  });
  document.querySelectorAll('.ai-grp-cb').forEach(cb => {
    cb.addEventListener('change', syncGroupChecks);
  });
  $('btn-ai-grp-all')?.addEventListener('click', () => {
    document.querySelectorAll('.ai-grp-cb').forEach(cb => { cb.checked = true; });
    syncGroupChecks();
  });
  $('btn-ai-grp-none')?.addEventListener('click', () => {
    document.querySelectorAll('.ai-grp-cb').forEach(cb => { cb.checked = false; });
    syncGroupChecks();
  });

  $('btn-embed')?.addEventListener('click', buildEmbeddings);
  $('btn-analyze')?.addEventListener('click', () => {
    syncGroupChecks();
    runAnalysis(null);
  });
  $('btn-followup')?.addEventListener('click', () => {
    syncGroupChecks();
    const v = ($('ai-followup-inp')?.value || '').trim(); if (v) runAnalysis(v);
  });
  $('ai-followup-inp')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      syncGroupChecks();
      const v = e.target.value.trim(); if (v) runAnalysis(v);
    }
  });
  $('btn-ai-txt')?.addEventListener('click', exportAnalysisTxt);
  $('btn-ai-xls')?.addEventListener('click', exportAnalysisExcel);
  $('ai-output')?.addEventListener('click', e => {
    const btn = e.target.closest?.('.ai-job-link');
    if (!btn) return;
    const job = btn.getAttribute('data-job');
    const group = btn.getAttribute('data-group');
    if (job) setFocus(job, { keepTab: true });
    else if (group) setGroupFocus(group, { keepTab: true });
    stayOnAiTab();
  });
}
