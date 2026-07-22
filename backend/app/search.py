"""Гибридный поиск: вектор (Qdrant) + графовый обход (Neo4j).

Схема:
1. Entity-first: fulltext-поиск сущностей по вопросу в Neo4j
2. Обход графа от найденных сущностей → связанные сущности + chunk_id
3. Векторный поиск по вопросу в Qdrant (эмбеддинг через LLM-endpoint)
4. Слияние: чанки, найденные через граф, получают бонус к скору
"""

from __future__ import annotations

import logging
from typing import Any

from openai import OpenAI

from .config import settings
from .graph_store import GraphStore
from .qdrant_source import QdrantSource

log = logging.getLogger("graphlens.search")

# Бонус к скору чанка, найденного через граф (поверх векторного скора)
GRAPH_BOOST = 0.15


class HybridSearch:
    def __init__(self, qdrant: QdrantSource, graph: GraphStore) -> None:
        self.qdrant = qdrant
        self.graph = graph
        self.llm = OpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)

    def _embed(self, text: str) -> list[float]:
        resp = self.llm.embeddings.create(model=settings.embedding_model, input=text)
        return resp.data[0].embedding

    def _vector_search(self, collection: str, question: str, top_k: int) -> dict[Any, dict]:
        """Векторный поиск: {qdrant_id: {score, text, payload}}."""
        try:
            vector = self._embed(question)
            hits = self.qdrant.client.query_points(
                collection_name=collection, query=vector, limit=top_k, with_payload=True
            ).points
        except Exception:
            log.exception("векторный поиск не удался - продолжаю только графом")
            return {}
        text_field = self.qdrant._detect_text_field(collection)
        return {
            h.id: {"score": h.score, "text": (h.payload or {}).get(text_field, ""),
                   "payload": h.payload or {}}
            for h in hits
        }

    def search(self, collection: str, question: str, top_k: int | None = None) -> dict:
        top_k = top_k or settings.top_k_vector

        # 1-2. Графовый контур
        entities = self.graph.find_entities(question, limit=8)
        graph_chunk_ids: set[str] = set()
        subgraph = {"nodes": [], "edges": []}
        if entities:
            sub = self.graph.neighborhood(
                [e["name"] for e in entities], depth=settings.graph_neighbor_depth
            )
            graph_chunk_ids = {str(q) for q in sub["chunk_ids"]}
            subgraph = {"nodes": sub["nodes"], "edges": sub["edges"]}

        # 3. Векторный контур
        vector_hits = self._vector_search(collection, question, top_k)

        # 4. Слияние
        results = []
        for qid, hit in vector_hits.items():
            via_graph = str(qid) in graph_chunk_ids
            results.append({
                "qdrant_id": qid,
                "score": round(hit["score"] + (GRAPH_BOOST if via_graph else 0), 4),
                "vector_score": round(hit["score"], 4),
                "via_graph": via_graph,
                "text": hit["text"],
                "payload": hit["payload"],
            })
        # Чанки, найденные ТОЛЬКО графом (вне векторного топа) - дочитываем из Qdrant
        missing = [q for q in graph_chunk_ids if not any(str(r["qdrant_id"]) == q for r in results)]
        if missing:
            text_field = self.qdrant._detect_text_field(collection)
            for qid in missing[: top_k]:
                try:
                    points = self.qdrant.client.retrieve(collection, [self._cast_id(qid)], with_payload=True)
                    for p in points:
                        results.append({
                            "qdrant_id": p.id,
                            "score": GRAPH_BOOST,
                            "vector_score": 0.0,
                            "via_graph": True,
                            "text": (p.payload or {}).get(text_field, ""),
                            "payload": p.payload or {},
                        })
                except Exception:
                    log.warning("не удалось дочитать чанк %s из Qdrant", qid)

        results.sort(key=lambda r: r["score"], reverse=True)
        return {
            "question": question,
            "collection": collection,
            "entities": entities,
            "subgraph": subgraph,
            "results": results[: top_k * 2],
        }

    @staticmethod
    def _cast_id(qid: str) -> Any:
        """Qdrant id может быть int или uuid-строкой."""
        try:
            return int(qid)
        except (ValueError, TypeError):
            return qid
