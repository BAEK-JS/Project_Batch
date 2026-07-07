import { useState, useMemo, useRef, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { parseControlMXML, SAMPLE_XML } from "./parser";
import type { ParsedGraph, JobInfo } from "./types";
import DiagramView from "./components/DiagramView";
import DetailPanel from "./components/DetailPanel";

type SidebarTab = "input" | "jobs" | "detail";

export default function App() {
  const [xmlInput, setXmlInput] = useState("");
  const [graph, setGraph] = useState<ParsedGraph | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("input");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 통계 ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!graph) return null;
    const rootCount = graph.jobs.filter(
      (j) => !graph.edges.some((e) => e.to === j.name)
    ).length;
    const leafCount = graph.jobs.filter(
      (j) => !graph.edges.some((e) => e.from === j.name)
    ).length;
    return {
      jobs: graph.jobs.length,
      edges: graph.edges.length,
      roots: rootCount,
      leaves: leafCount,
    };
  }, [graph]);

  const selectedJobInfo: JobInfo | null =
    graph?.jobs.find((j) => j.name === selectedJob) ?? null;

  // ── 핸들러 ────────────────────────────────────────────────────────────
  function handleGenerate() {
    try {
      const result = parseControlMXML(xmlInput);
      setGraph(result);
      setParseError(null);
      setSelectedJob(null);
      setSidebarTab("jobs");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "알 수 없는 오류");
    }
  }

  function handleSample() {
    setXmlInput(SAMPLE_XML);
    try {
      const result = parseControlMXML(SAMPLE_XML);
      setGraph(result);
      setParseError(null);
      setSelectedJob(null);
      setSidebarTab("jobs");
    } catch {
      // won't happen with valid sample
    }
  }

  function handleClear() {
    setXmlInput("");
    setGraph(null);
    setParseError(null);
    setSelectedJob(null);
    setSidebarTab("input");
  }

  function handleSelectJob(name: string | null) {
    setSelectedJob(name);
    if (name) setSidebarTab("detail");
  }

  function handleFileRead(text: string) {
    setXmlInput(text);
    setSidebarTab("input");
    try {
      const result = parseControlMXML(text);
      setGraph(result);
      setParseError(null);
      setSelectedJob(null);
      setSidebarTab("jobs");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "알 수 없는 오류");
    }
  }

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleFileRead(ev.target?.result as string);
    reader.readAsText(file, "UTF-8");
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => handleFileRead(ev.target?.result as string);
      reader.readAsText(file, "UTF-8");
      e.target.value = "";
    },
    []
  );

  // ── 잡 분류 ──────────────────────────────────────────────────────────
  function jobType(name: string): "root" | "leaf" | "middle" {
    if (!graph) return "middle";
    const isRoot = !graph.edges.some((e) => e.to === name);
    const isLeaf = !graph.edges.some((e) => e.from === name);
    if (isRoot) return "root";
    if (isLeaf) return "leaf";
    return "middle";
  }

  return (
    <div id="root" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* ── Header ── */}
      <header className="app-header">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
          <rect x="1" y="8" width="5" height="5" rx="1.5" fill="#388bfd" />
          <rect x="8" y="2" width="5" height="5" rx="1.5" fill="#2ea043" />
          <rect x="8" y="13" width="5" height="5" rx="1.5" fill="#388bfd" />
          <rect x="15" y="8" width="5" height="5" rx="1.5" fill="#d29922" />
          <line x1="6" y1="10.5" x2="8" y2="4.5" stroke="#444c56" strokeWidth="1.5" />
          <line x1="6" y1="10.5" x2="8" y2="15.5" stroke="#444c56" strokeWidth="1.5" />
          <line x1="13" y1="4.5" x2="15" y2="10.5" stroke="#444c56" strokeWidth="1.5" />
          <line x1="13" y1="15.5" x2="15" y2="10.5" stroke="#444c56" strokeWidth="1.5" />
        </svg>
        <h1>Control-M 배치 선후행 다이어그램</h1>
        <span className="badge">Beta</span>
        <div style={{ flex: 1 }} />
        {stats && (
          <span style={{ fontSize: 12, color: "var(--text3)" }}>
            잡 {stats.jobs}개 · 의존성 {stats.edges}개
          </span>
        )}
      </header>

      {/* ── Stats Strip ── */}
      {stats && (
        <div className="stats-strip">
          <div className="stat-cell">
            <div className="stat-value">{stats.jobs}</div>
            <div className="stat-label">전체 잡</div>
          </div>
          <div className="stat-cell">
            <div className="stat-value">{stats.edges}</div>
            <div className="stat-label">의존성</div>
          </div>
          <div className="stat-cell">
            <div className="stat-value success">{stats.roots}</div>
            <div className="stat-label">시작 잡</div>
          </div>
          <div className="stat-cell">
            <div className="stat-value info">{stats.leaves}</div>
            <div className="stat-label">종료 잡</div>
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div className="app-body">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="tabs">
            <button
              className={`tab ${sidebarTab === "input" ? "active" : ""}`}
              onClick={() => setSidebarTab("input")}
            >
              XML 입력
            </button>
            {graph && (
              <button
                className={`tab ${sidebarTab === "jobs" ? "active" : ""}`}
                onClick={() => setSidebarTab("jobs")}
              >
                잡 목록 ({graph.jobs.length})
              </button>
            )}
            {selectedJobInfo && (
              <button
                className={`tab ${sidebarTab === "detail" ? "active" : ""}`}
                onClick={() => setSidebarTab("detail")}
              >
                상세정보
              </button>
            )}
          </div>

          <div className="sidebar-scroll">
            {/* ── XML Input Tab ── */}
            {sidebarTab === "input" && (
              <div className="sidebar-section">
                {/* File drop zone */}
                <div
                  className={`drop-zone ${dragOver ? "drag-over" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xml,.txt"
                    onChange={handleFileChange}
                  />
                  <div style={{ fontSize: 24, marginBottom: 6, opacity: 0.5 }}>📂</div>
                  <div>XML 파일을 끌어다 놓거나 클릭해서 열기</div>
                  <div style={{ fontSize: 11, marginTop: 4, opacity: 0.6 }}>.xml, .txt 지원</div>
                </div>

                <textarea
                  rows={14}
                  value={xmlInput}
                  onChange={(e) => setXmlInput(e.target.value)}
                  placeholder="또는 Control-M XML을 여기에 직접 붙여넣으세요…&#10;&#10;DEFTABLE, FOLDER, SMART_FOLDER 형식 모두 지원"
                  spellCheck={false}
                />

                {parseError && (
                  <div className="alert danger" style={{ marginTop: 10, marginBottom: 0, marginLeft: 0, marginRight: 0 }}>
                    <span className="alert-icon">⚠</span>
                    <span>{parseError}</span>
                  </div>
                )}

                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleGenerate}
                    disabled={!xmlInput.trim()}
                  >
                    다이어그램 생성
                  </button>
                  <button className="btn btn-secondary" onClick={handleSample}>
                    샘플 로드
                  </button>
                  {(xmlInput || graph) && (
                    <button className="btn btn-ghost" onClick={handleClear}>
                      초기화
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Job List Tab ── */}
            {sidebarTab === "jobs" && graph && (
              <>
                <div className="sidebar-section" style={{ paddingBottom: 8 }}>
                  <div className="sidebar-section-title">전체 잡 목록</div>
                  <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--text3)" }}>
                    <span style={{ color: "var(--success)" }}>● 시작</span>
                    <span style={{ color: "var(--info)" }}>● 종료</span>
                    <span style={{ color: "var(--warning)" }}>● 중간</span>
                  </div>
                </div>
                {graph.jobs.map((job) => {
                  const type = jobType(job.name);
                  return (
                    <div
                      key={job.name}
                      className={`job-list-item ${selectedJob === job.name ? "active" : ""}`}
                      onClick={() => handleSelectJob(job.name)}
                    >
                      <div className={`job-list-dot ${type}`} />
                      <div className="job-list-name" title={job.name}>
                        {job.name}
                      </div>
                      <div className="job-list-counts">
                        {job.inConds.length}↓ {job.outConds.length}↑
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* ── Detail Tab ── */}
            {sidebarTab === "detail" && selectedJobInfo && graph && (
              <DetailPanel
                job={selectedJobInfo}
                graph={graph}
                onClose={() => {
                  setSelectedJob(null);
                  setSidebarTab("jobs");
                }}
              />
            )}
          </div>

          {/* ── Sidebar Toolbar ── */}
          {graph && sidebarTab !== "input" && (
            <div className="toolbar">
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12, height: 28 }}
                onClick={() => setSidebarTab("input")}
              >
                ← XML 수정
              </button>
              <div className="toolbar-sep" />
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12, height: 28 }}
                onClick={handleClear}
              >
                초기화
              </button>
            </div>
          )}
        </aside>

        {/* ── Main Area ── */}
        <main className="main-area">
          {!graph ? (
            <div className="empty-diagram">
              <div className="empty-diagram-icon">⬡</div>
              <div className="empty-diagram-text">
                <div style={{ fontWeight: 600, color: "var(--text2)", marginBottom: 4 }}>
                  다이어그램이 없습니다
                </div>
                <div>왼쪽에서 XML을 입력하고 "다이어그램 생성"을 누르거나</div>
                <div>"샘플 로드"로 예시를 확인해보세요</div>
              </div>
            </div>
          ) : (
            <div className="flow-wrapper">
              <ReactFlowProvider>
                <DiagramView
                  graph={graph}
                  selectedJob={selectedJob}
                  onSelectJob={handleSelectJob}
                />
              </ReactFlowProvider>

              {/* Legend */}
              <div className="legend">
                <div style={{ fontSize: 10, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>범례</div>
                <div className="legend-item">
                  <div className="legend-dot" style={{ background: "var(--node-root)", border: "1.5px solid var(--node-root-border)" }} />
                  <span>시작 잡 (선행 없음)</span>
                </div>
                <div className="legend-item">
                  <div className="legend-dot" style={{ background: "var(--node-leaf)", border: "1.5px solid var(--node-leaf-border)" }} />
                  <span>종료 잡 (후행 없음)</span>
                </div>
                <div className="legend-item">
                  <div className="legend-dot" style={{ background: "var(--node-bg)", border: "1.5px solid var(--node-border)" }} />
                  <span>중간 잡</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
