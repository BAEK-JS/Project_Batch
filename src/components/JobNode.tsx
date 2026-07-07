import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export interface JobNodeData {
  label: string;
  application?: string;
  subApplication?: string;
  taskType?: string;
  inCount: number;
  outCount: number;
  isRoot: boolean;
  isLeaf: boolean;
  selected: boolean;
  dimmed: boolean;
  [key: string]: unknown;
}

function JobNode({ data }: NodeProps) {
  const d = data as JobNodeData;

  const cls = [
    "job-node",
    d.isRoot && !d.isLeaf ? "root" : "",
    d.isLeaf && !d.isRoot ? "leaf" : "",
    d.selected ? "selected" : "",
    d.dimmed ? "dimmed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const meta = [d.application, d.subApplication].filter(Boolean).join(" · ");

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className={cls}>
        <div className="job-node-name" title={d.label}>
          {d.label}
        </div>
        {meta && (
          <div className="job-node-meta" title={meta}>
            {meta}
          </div>
        )}
        <div className="job-node-badges">
          {d.inCount > 0 && (
            <span className="node-badge in">IN {d.inCount}</span>
          )}
          {d.outCount > 0 && (
            <span className="node-badge out">OUT {d.outCount}</span>
          )}
          {d.taskType && (
            <span className="node-badge">{d.taskType}</span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </>
  );
}

export default memo(JobNode);
