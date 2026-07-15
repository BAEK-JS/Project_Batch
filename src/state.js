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
  nodeDrag: null, // { name, ox, oy, cx, cy, moved }
  dragRaf: 0,     // requestAnimationFrame id (드래그 시각 갱신)
  groupClick: null, // { group, cx, cy } 박스 안 그룹 라벨 클릭
  layoutSnapshot: null, // Map 자동배치 스냅샷 (위치 초기화용)
  jobPreview: null, // 다이어그램 클릭 시 선후행 색 강조(이동 전)
  focusSet: null,   // null=전체, Set=포커스 배치 집합
  focusName: null,  // 포커스 기준 배치명
  groupFilter: null, // null=전체, string=실제 이동된 그룹 필터
  groupPreview: null, // 클릭만 한 미리보기 그룹(색 강조, 아직 이동 전)
  groupPanelOpen: false, // 우측 그룹내역 패널 열림 여부
  groupScope: null, // Set|null 그룹 탐색 범위(이동 후 현재 화면이 새 기준)
  viewGraph: null, // 렌더용 부분 그래프(그룹/포커스 시). null이면 S.graph 전체
  viewHistory: [], // 뒤로가기용 화면 스냅샷 스택
  _restoringView: false, // 복원 중이면 push 생략
};

// ── API 설정 (localStorage 연동) ─────────────────────────────────────────────
export const API = {
  get provider()  { return localStorage.getItem('ctm_provider') || 'openai'; }, // openai | dify
  set provider(v) { localStorage.setItem('ctm_provider', v === 'dify' ? 'dify' : 'openai'); },
  get key()       { return localStorage.getItem('ctm_key')   || ''; },
  set key(v)      { v ? localStorage.setItem('ctm_key', v)   : localStorage.removeItem('ctm_key'); },
  get chatModel() { return localStorage.getItem('ctm_model') || 'gpt-4o-mini'; },
  set chatModel(v){ localStorage.setItem('ctm_model', v); },
  get baseUrl()   {
    const saved = localStorage.getItem('ctm_url');
    if (saved) return saved;
    return this.provider === 'dify' ? '' : 'https://api.openai.com/v1';
  },
  set baseUrl(v)  { v ? localStorage.setItem('ctm_url', v)   : localStorage.removeItem('ctm_url'); },
  get userId()    { return localStorage.getItem('ctm_user')  || 'batch-diagram'; },
  set userId(v)   { localStorage.setItem('ctm_user', v || 'batch-diagram'); },
  embedModel: 'text-embedding-3-small',
  get isDify()    { return this.provider === 'dify'; },
};

// ── 임베딩 상태 ───────────────────────────────────────────────────────────────
export const EMB = { data: new Map(), built: false, building: false, progress: 0, total: 0 };

// ── AI 분석 상태 ──────────────────────────────────────────────────────────────
export const AI = {
  running: false,
  text: '',
  error: '',
  history: [],
  conversationId: '',
  /** 'auto' 현재 화면 | 'groups' 선택 그룹 | 'all' 전체 */
  scopeMode: 'auto',
  selectedGroups: new Set(),
};

// ── 검색 상태 ─────────────────────────────────────────────────────────────────
export const SRCH = { results: [], last: '', running: false };

// ── 검색 필터 상태 ────────────────────────────────────────────────────────────
export const FILTER = {
  app:  new Set(),  // 선택된 APPLICATION
  sub:  new Set(),  // 선택된 SUB_APPLICATION
  node: new Set(),  // 선택된 NODEID
};
