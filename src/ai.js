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

export function buildGraphSummary() {
  const g = S.graph;
  const roots  = g.jobs.filter(j => !g.edges.some(e => e.to   === j.name)).map(j => j.name);
  const leaves = g.jobs.filter(j => !g.edges.some(e => e.from === j.name)).map(j => j.name);
  let s = `Control-M 배치 구조\n배치: ${g.jobs.length}개 | 의존성: ${g.edges.length}개\n시작 배치: ${roots.join(', ')}\n종료 배치: ${leaves.join(', ')}\n\n`;
  for (const job of g.jobs) {
    const up = g.edges.filter(e => e.to   === job.name).map(e => e.from);
    const dn = g.edges.filter(e => e.from === job.name).map(e => e.to);
    const meta = [job.app, job.sub, job.type, job.desc].filter(Boolean).join('/');
    s += `• ${job.name}${meta ? ' [' + meta + ']' : ''}\n`;
    if (up.length) s += `  ← ${up.join(', ')}\n`;
    if (dn.length) s += `  → ${dn.join(', ')}\n`;
  }
  return s;
}

export async function runAnalysis(userMsg) {
  if (!API.key) { alert('API 키를 먼저 설정해주세요 (헤더 ⚙ 버튼).'); return; }
  if (API.isDify && !normalizeBaseUrl(API.baseUrl)) {
    alert('사내 LLM 엔드포인트를 설정해주세요.\n예: http://128.1.233.75/v1');
    return;
  }
  if (!S.graph) return;

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

  AI.running = true; AI.error = '';
  if (!userMsg) {
    // 전체 배치 흐름 분석
    AI.text = '';
    AI.history = [];
    AI.conversationId = '';
    const summary = buildGraphSummary();
    AI.history = [
      { role: 'system', content: '당신은 Control-M 배치 워크플로우 전문가입니다. 배치 구조를 분석하여 실용적이고 명확한 한국어로 답변해주세요. 특정 배치명·그룹명을 언급할 때는 이름을 정확히 쓰세요.' },
      { role: 'user',   content: `다음 Control-M 배치 구조를 분석해주세요:\n\n${summary}\n\n다음 항목으로 분석해주세요:\n1. 📋 전체 배치 흐름 요약\n2. ⚡ 병렬 처리 구간 식별\n3. ⚠️ 잠재적 위험 요소 (단일 장애점, 병목 등)\n4. 💡 최적화 및 개선 제안` },
    ];
  } else {
    // 바로 질문 — 이력이 없으면 그래프 컨텍스트만 먼저 심어 둠
    if (!AI.history.length) {
      AI.conversationId = '';
      const summary = buildGraphSummary();
      AI.history = [
        { role: 'system', content: '당신은 Control-M 배치 워크플로우 전문가입니다. 배치 구조를 분석하여 실용적이고 명확한 한국어로 답변해주세요. 특정 배치명·그룹명을 언급할 때는 이름을 정확히 쓰세요.' },
        { role: 'user', content: `참고용 Control-M 배치 구조입니다. 이후 질문에 활용하세요.\n\n${summary}` },
        { role: 'assistant', content: '배치 구조를 확인했습니다. 궁금한 점이나 보고 싶은 배치·그룹을 말씀해 주세요.' },
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

  const canAsk = hasKey && !!S.graph && !AI.running;
  const askBox = `
  <div class="ai-followup" style="margin-top:10px">
    <input type="text" id="ai-followup-inp" placeholder="바로 질문… 예: 01.수신 그룹 보여줘 / 병목 구간이 어디야?" ${canAsk ? '' : 'disabled'}>
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
  ${askBox}
  <div style="font-size:10.5px;color:var(--text3);margin-top:8px;line-height:1.6">
    • <b>배치 흐름 분석</b>: 전체 흐름·병목·개선안 한 번에 분석<br>
    • <b>바로 질문</b>: 입력창에 바로 질문 / "<code>배치명 보여줘</code>" · "<code>그룹명 그룹 보여줘</code>"<br>
    • <b>결과 저장</b>: 답변 후 TXT / 엑셀
  </div>
</div>
${embStatus}
${AI.error ? `<div class="err" style="display:block;margin:10px 13px">${esc(AI.error)}</div>` : ''}
${outputSection}`;

  $('btn-embed')?.addEventListener('click', buildEmbeddings);
  $('btn-analyze')?.addEventListener('click', () => runAnalysis(null));
  $('btn-followup')?.addEventListener('click', () => {
    const v = ($('ai-followup-inp')?.value || '').trim(); if (v) runAnalysis(v);
  });
  $('ai-followup-inp')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) runAnalysis(v); }
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
