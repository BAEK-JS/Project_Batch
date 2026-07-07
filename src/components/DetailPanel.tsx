import type { JobInfo, ParsedGraph } from "../types";

interface Props {
  job: JobInfo;
  graph: ParsedGraph;
  onClose: () => void;
}

export default function DetailPanel({ job, graph, onClose }: Props) {
  const upstream = graph.edges
    .filter((e) => e.to === job.name)
    .map((e) => e.from);
  const downstream = graph.edges
    .filter((e) => e.from === job.name)
    .map((e) => e.to);

  return (
    <div className="detail-panel">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div className="detail-title" style={{ flex: 1 }}>
          {job.name}
        </div>
        <button
          className="btn btn-ghost"
          onClick={onClose}
          style={{ padding: "0 8px", height: 26, fontSize: 12, flexShrink: 0 }}
        >
          닫기
        </button>
      </div>

      {(job.application || job.taskType) && (
        <div className="detail-pills">
          {job.application && (
            <span className="pill">{job.application}</span>
          )}
          {job.subApplication && (
            <span className="pill">{job.subApplication}</span>
          )}
          {job.taskType && (
            <span className="pill active">{job.taskType}</span>
          )}
          {job.folder && (
            <span className="pill">{job.folder}</span>
          )}
        </div>
      )}

      <div className="detail-stats">
        <div className="detail-stat">
          <div className="detail-stat-val">{job.inConds.length}</div>
          <div className="detail-stat-label">IN 조건</div>
        </div>
        <div className="detail-stat">
          <div className="detail-stat-val">{job.outConds.length}</div>
          <div className="detail-stat-label">OUT 조건</div>
        </div>
      </div>

      {upstream.length > 0 && (
        <>
          <div className="detail-section-title">
            선행 잡 ({upstream.length})
          </div>
          <div className="dep-list">
            {upstream.map((name) => (
              <div key={name} className="dep-item">
                <span className="arrow">←</span>
                {name}
              </div>
            ))}
          </div>
        </>
      )}

      {downstream.length > 0 && (
        <>
          <div className="detail-section-title">
            후행 잡 ({downstream.length})
          </div>
          <div className="dep-list">
            {downstream.map((name) => (
              <div key={name} className="dep-item">
                <span className="arrow">→</span>
                {name}
              </div>
            ))}
          </div>
        </>
      )}

      {(job.inConds.length > 0 || job.outConds.length > 0) && (
        <div className="dep-divider" />
      )}

      {job.inConds.length > 0 && (
        <>
          <div className="detail-section-title">IN 조건 목록</div>
          <table className="cond-table">
            <thead>
              <tr>
                <th>조건명</th>
                <th>ODATE</th>
                <th>AND/OR</th>
              </tr>
            </thead>
            <tbody>
              {job.inConds.map((c, i) => (
                <tr key={i}>
                  <td>{c.name}</td>
                  <td>{c.odate}</td>
                  <td>{c.andOr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {job.outConds.length > 0 && (
        <>
          <div className="detail-section-title">OUT 조건 목록</div>
          <table className="cond-table">
            <thead>
              <tr>
                <th>조건명</th>
                <th>ODATE</th>
                <th>SIGN</th>
              </tr>
            </thead>
            <tbody>
              {job.outConds.map((c, i) => (
                <tr key={i}>
                  <td>{c.name}</td>
                  <td>{c.odate}</td>
                  <td>{c.sign}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
