// ── 다이어그램 상수 ────────────────────────────────────────────────────────────
export const NW = 220, NH = 76, RG = 140, NG = 58, PAD = 50;

// ── 앱 전역 상태 ───────────────────────────────────────────────────────────────
export const S = {
  graph: null,
  pos: null,
  selected: null,
  tab: 'input',
  vt: { x: 60, y: 40, s: 1 },
  panStart: null,
  panned: false,
  focusSet: null,   // null=전체, Set=포커스 배치 집합
  focusName: null,  // 포커스 기준 배치명
  groupFilter: null, // null=전체, string=SUB_APPLICATION(또는 app/folder) 그룹 필터
  groupPanelOpen: false, // 우측 그룹내역 패널 열림 여부
};

// ── API 설정 (localStorage 연동) ─────────────────────────────────────────────
export const API = {
  get key()       { return localStorage.getItem('ctm_key')   || ''; },
  set key(v)      { v ? localStorage.setItem('ctm_key', v)   : localStorage.removeItem('ctm_key'); },
  get chatModel() { return localStorage.getItem('ctm_model') || 'gpt-4o-mini'; },
  set chatModel(v){ localStorage.setItem('ctm_model', v); },
  get baseUrl()   { return localStorage.getItem('ctm_url')   || 'https://api.openai.com/v1'; },
  set baseUrl(v)  { v ? localStorage.setItem('ctm_url', v)   : localStorage.removeItem('ctm_url'); },
  embedModel: 'text-embedding-3-small',
};

// ── 임베딩 상태 ───────────────────────────────────────────────────────────────
export const EMB = { data: new Map(), built: false, building: false, progress: 0, total: 0 };

// ── AI 분석 상태 ──────────────────────────────────────────────────────────────
export const AI = { running: false, text: '', error: '', history: [] };

// ── 검색 상태 ─────────────────────────────────────────────────────────────────
export const SRCH = { results: [], last: '', running: false };

// ── 검색 필터 상태 ────────────────────────────────────────────────────────────
export const FILTER = {
  app:  new Set(),  // 선택된 APPLICATION
  sub:  new Set(),  // 선택된 SUB_APPLICATION
  node: new Set(),  // 선택된 NODEID
};
