export interface InCond {
  name: string;
  odate: string;
  andOr: string;
}

export interface OutCond {
  name: string;
  odate: string;
  sign: string;
}

export interface JobInfo {
  name: string;
  application?: string;
  subApplication?: string;
  taskType?: string;
  folder?: string;
  inConds: InCond[];
  outConds: OutCond[];
}

export interface GraphEdge {
  from: string;
  to: string;
  condName: string;
}

export interface ParsedGraph {
  jobs: JobInfo[];
  edges: GraphEdge[];
}
