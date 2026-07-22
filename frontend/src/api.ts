import type {
  ApiGraph,
  CollectionProbe,
  ExtractStatus,
  GraphStats,
  QdrantCollection,
  SearchResponse,
} from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${body ? `: ${body}` : ""}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string }>("/api/health"),

  collections: () =>
    request<{ collections: QdrantCollection[] }>("/api/qdrant/collections"),

  probe: (name: string) =>
    request<CollectionProbe>(
      `/api/qdrant/collections/${encodeURIComponent(name)}/probe`,
    ),

  graph: (collection: string, limit = 500) =>
    request<ApiGraph>(
      `/api/graph?collection=${encodeURIComponent(collection)}&limit=${limit}`,
    ),

  graphStats: () => request<GraphStats>("/api/graph/stats"),

  clearGraph: (collection: string) =>
    request<unknown>(`/api/graph?collection=${encodeURIComponent(collection)}`, {
      method: "DELETE",
    }),

  search: (collection: string, question: string, topK = 8) =>
    request<SearchResponse>("/api/search", {
      method: "POST",
      body: JSON.stringify({ collection, question, top_k: topK }),
    }),

  extractStart: (collection: string, limit?: number) =>
    request<unknown>("/api/extract", {
      method: "POST",
      body: JSON.stringify(
        limit && limit > 0 ? { collection, limit } : { collection },
      ),
    }),

  extractStatus: () => request<ExtractStatus>("/api/extract/status"),

  extractCancel: () =>
    request<unknown>("/api/extract/cancel", { method: "POST" }),
};
