export interface QdrantCollection {
  name: string;
  points: number;
  vectors: number | null;
}

export interface GraphStats {
  entities: number;
  relations: number;
  chunks: number;
  types: string[];
}

export interface ApiNode {
  name: string;
  type: string;
  description: string;
}

export interface ApiEdge {
  src: string;
  dst: string;
  relation: string;
  description: string;
}

export interface ApiGraph {
  nodes: ApiNode[];
  edges: ApiEdge[];
}

export interface SearchEntity {
  name: string;
  type: string;
  description: string;
  score: number;
}

export interface SearchResult {
  qdrant_id: string | number;
  score: number;
  vector_score: number;
  via_graph: boolean;
  text: string;
  payload: Record<string, unknown>;
}

export interface SearchResponse {
  question: string;
  entities: SearchEntity[];
  subgraph: ApiGraph;
  results: SearchResult[];
}

export interface ExtractStatus {
  running: boolean;
  processed: number;
  total: number;
  nodes: number;
  edges: number;
  errors: number;
  started_at: string | null;
  finished_at: string | null;
}
