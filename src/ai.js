import { S, API, EMB, AI } from './state.js';
import { $ , esc } from './utils.js';

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

export async function fetchEmbeddings(texts) {
  const res = await fetch(`${API.baseUrl}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API.key}` },
    body: JSON.stringify({ model: API.embedModel, input: texts }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `임베딩 API 오류 (${res.status})`);
  return json.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

export async function buildEmbeddings() {
  if (!API.key) { alert('API 키를 먼저 설정해주세요 (헤더 ⚙ 버튼).'); return; }
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

export async function streamChat(messages, onChunk) {
  const res = await fetch(`${API.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API.key}` },
    body: JSON.stringify({ model: API.chatModel, messages, stream: true }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
    throw new Error(j.error?.message || `API 오류 (${res.status})`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try { const j = JSON.parse(data); const c = j.choices?.[0]?.delta?.content; if (c) onChunk(c); } catch {}
    }
  }
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
  if (!S.graph) return;
  AI.running = true; AI.error = '';
  if (!userMsg) {
    AI.text = ''; AI.history = [];
    const summary = buildGraphSummary();
    AI.history = [
      { role: 'system', content: '당신은 Control-M 배치 워크플로우 전문가입니다. 배치 구조를 분석하여 실용적이고 명확한 한국어로 답변해주세요.' },
      { role: 'user',   content: `다음 Control-M 배치 구조를 분석해주세요:\n\n${summary}\n\n다음 항목으로 분석해주세요:\n1. 📋 전체 배치 흐름 요약\n2. ⚡ 병렬 처리 구간 식별\n3. ⚠️ 잠재적 위험 요소 (단일 장애점, 병목 등)\n4. 💡 최적화 및 개선 제안` },
    ];
  } else {
    AI.history.push({ role: 'user', content: userMsg });
    AI.history.push({ role: 'assistant', content: AI.text });
    AI.text = '';
    AI.history[AI.history.length - 2] = { role: 'user', content: userMsg };
  }
  renderAIPane();
  const outputEl = $('ai-output');
  if (outputEl) outputEl.textContent = '';
  let newText = '';
  try {
    await streamChat(AI.history, chunk => {
      newText += chunk; AI.text = newText;
      const el = $('ai-output');
      if (el) el.appendChild(document.createTextNode(chunk));
    });
    AI.history.push({ role: 'assistant', content: newText });
    AI.running = false;
  } catch (e) {
    AI.running = false; AI.error = e.message;
  }
  renderAIPane();
}

export function renderAIPaneProgress() {
  const bar = $('embed-progress-fill');
  if (bar) bar.style.width = Math.round(EMB.progress / EMB.total * 100) + '%';
  const lbl = $('embed-progress-lbl');
  if (lbl) lbl.textContent = `임베딩 생성 중… (${EMB.progress}/${EMB.total})`;
}

export function renderAIPane() {
  const hasKey = !!API.key;
  let embStatus = '';
  if (EMB.building) {
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

  const outputSection = (AI.text || AI.running)
    ? `<div class="pane-pad" style="padding-top:8px">
  <div class="section-title" style="margin-top:0">분석 결과</div>
  <div class="ai-output${AI.running && !AI.text ? ' blink' : ''}" id="ai-output">${esc(AI.text)}</div>
  ${AI.history.length >= 2 && !AI.running ? `<div class="ai-followup">
    <input type="text" id="ai-followup-inp" placeholder="추가 질문을 입력하세요…">
    <button class="btn btn-s" id="btn-followup" style="height:30px;padding:0 10px">질문</button>
  </div>` : ''}
</div>` : '';

  $('ai-inner').innerHTML = `
<div class="pane-pad" style="padding-bottom:8px">
  <div class="api-status ${hasKey ? 'ok' : 'no'}">
    <div class="sdot"></div>
    ${hasKey ? `API 키 설정됨 · <span style="color:var(--text3)">${esc(API.chatModel)}</span>` : 'API 키 미설정 — 헤더 ⚙ 에서 설정'}
  </div>
  <div class="btn-row" style="margin-top:0">
    <button class="btn btn-s" id="btn-embed" ${!hasKey || EMB.building ? 'disabled' : ''}>
      ${EMB.building ? '생성 중…' : EMB.built ? '임베딩 재생성' : '임베딩 생성'}
    </button>
    <button class="btn btn-p" id="btn-analyze" ${!hasKey || AI.running ? 'disabled' : ''}>
      ${AI.running ? '분석 중…' : '배치 흐름 분석'}
    </button>
  </div>
  <div style="font-size:10.5px;color:var(--text3);margin-top:8px;line-height:1.6">
    • <b>임베딩 생성</b>: 배치 정보를 벡터화해 시맨틱 검색 활성화<br>
    • <b>배치 흐름 분석</b>: AI가 전체 흐름·위험요소·개선안 분석
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
}
