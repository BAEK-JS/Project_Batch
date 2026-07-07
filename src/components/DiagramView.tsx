import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeMouseHandler,
  MarkerType,
  BackgroundVariant,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import JobNode, { type JobNodeData } from "./JobNode";
import type { ParsedGraph } from "../types";
import { computeLayout, NODE_W, NODE_H } from "../layout";

const nodeTypes = { jobNode: JobNode };

interface Props {
  graph: ParsedGraph;
  selectedJob: string | null;
  onSelectJob: (name: string | null) => void;
}

export default function DiagramView({ graph, selectedJob, onSelectJob }: Props) {
  const positions = useMemo(() => computeLayout(graph), [graph]);

  const connectedSet = useMemo(() => {
    if (!selectedJob) return new Set<string>();
    const s = new Set<string>([selectedJob]);
    for (const e of graph.edges) {
      if (e.from === selectedJob) s.add(e.to);
      if (e.to === selectedJob) s.add(e.from);
    }
    return s;
  }, [selectedJob, graph.edges]);

  const nodes: Node[] = useMemo(() => {
    return graph.jobs.map((job) => {
      const pos = positions.get(job.name) ?? { x: 0, y: 0 };
      const isRoot = !graph.edges.some((e) => e.to === job.name);
      const isLeaf = !graph.edges.some((e) => e.from === job.name);
      const isSel = job.name === selectedJob;
      const isDimmed =
        selectedJob !== null && !connectedSet.has(job.name);

      const data: JobNodeData = {
        label: job.name,
        application: job.application,
        subApplication: job.subApplication,
        taskType: job.taskType,
        inCount: job.inConds.length,
        outCount: job.outConds.length,
        isRoot,
        isLeaf,
        selected: isSel,
        dimmed: isDimmed,
      };

      return {
        id: job.name,
        type: "jobNode",
        position: pos,
        data,
        width: NODE_W,
        height: NODE_H,
        selectable: true,
        focusable: false,
      };
    });
  }, [graph, positions, selectedJob, connectedSet]);

  const edges: Edge[] = useMemo(() => {
    return graph.edges.map((e) => {
      const isHi =
        selectedJob !== null &&
        (e.from === selectedJob || e.to === selectedJob);
      const isDimmed =
        selectedJob !== null && !isHi;

      return {
        id: `${e.from}→${e.to}`,
        source: e.from,
        target: e.to,
        type: "smoothstep",
        animated: isHi,
        label: isHi ? e.condName : undefined,
        labelStyle: {
          fontSize: 10,
          fill: "#8b949e",
          fontFamily: "monospace",
        },
        labelBgStyle: { fill: "#161b22", fillOpacity: 0.9 },
        style: {
          stroke: isHi ? "#388bfd" : isDimmed ? "#21262d" : "#444c56",
          strokeWidth: isHi ? 2 : 1.5,
          opacity: isDimmed ? 0.2 : 1,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isHi ? "#388bfd" : isDimmed ? "#21262d" : "#444c56",
          width: 12,
          height: 12,
        },
      };
    });
  }, [graph.edges, selectedJob]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      onSelectJob(node.id === selectedJob ? null : node.id);
    },
    [selectedJob, onSelectJob]
  );

  const onPaneClick = useCallback(() => {
    onSelectJob(null);
  }, [onSelectJob]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="#21262d"
      />
      <Controls
        style={{
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 8,
        }}
      />
      <MiniMap
        nodeColor={(n) => {
          const d = n.data as JobNodeData;
          if (d.isRoot) return "#2ea043";
          if (d.isLeaf) return "#388bfd";
          return "#444c56";
        }}
        style={{
          background: "#0f1117",
          border: "1px solid #30363d",
          borderRadius: 8,
        }}
        maskColor="rgba(0,0,0,0.4)"
      />
    </ReactFlow>
  );
}
