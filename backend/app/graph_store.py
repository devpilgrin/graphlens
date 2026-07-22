"""Слой Neo4j: хранение графа знаний и обходы для поиска/визуализации.

Модель данных:
  (:Entity {name, type, description, collections: [str]})
  (:Chunk  {qid, collection})                 — ссылка на точку в Qdrant
  (:Entity)-[:УПОМИНАЕТСЯ_В]->(:Chunk)
  (:Entity)-[:REL {relation, description, collections}]->(:Entity)

Тип связи хранится в свойстве relation (фиксированный список из extractor),
что позволяет обходиться без APOC и динамических типов отношений.
"""

from __future__ import annotations

import logging
from typing import Any

from neo4j import GraphDatabase

from .config import settings

log = logging.getLogger("graphlens.neo4j")


class GraphStore:
    def __init__(self) -> None:
        self.driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
        self._ensure_constraints()

    def close(self) -> None:
        self.driver.close()

    def _ensure_constraints(self) -> None:
        with self.driver.session() as s:
            s.run("CREATE CONSTRAINT entity_name_type IF NOT EXISTS "
                  "FOR (e:Entity) REQUIRE (e.name, e.type) IS UNIQUE")
            s.run("CREATE CONSTRAINT chunk_qid IF NOT EXISTS "
                  "FOR (c:Chunk) REQUIRE (c.qid, c.collection) IS UNIQUE")
            s.run("CREATE FULLTEXT INDEX entity_names IF NOT EXISTS "
                  "FOR (e:Entity) ON EACH [e.name, e.description]")

    # ── Запись ──────────────────────────────────────────────────────────

    def upsert_extraction(self, collection: str, chunk_qid: Any, data: dict) -> dict:
        """Записывает результат извлечения одного чанка. Возвращает счётчики."""
        nodes = [n for n in data.get("nodes", []) if n.get("name") and n.get("type")]
        edges = [e for e in data.get("edges", [])
                 if e.get("source") and e.get("target") and e.get("relation")]
        with self.driver.session() as s:
            s.execute_write(self._write_tx, collection, str(chunk_qid), nodes, edges)
        return {"nodes": len(nodes), "edges": len(edges)}

    @staticmethod
    def _write_tx(tx, collection: str, qid: str, nodes: list, edges: list) -> None:
        tx.run(
            "MERGE (c:Chunk {qid: $qid, collection: $collection})",
            qid=qid, collection=collection,
        )
        for n in nodes:
            tx.run(
                """
                MERGE (e:Entity {name: $name, type: $type})
                ON CREATE SET e.description = $desc, e.collections = [$collection]
                ON MATCH  SET e.collections =
                    CASE WHEN $collection IN e.collections THEN e.collections
                         ELSE e.collections + $collection END
                WITH e
                MATCH (c:Chunk {qid: $qid, collection: $collection})
                MERGE (e)-[:УПОМИНАЕТСЯ_В]->(c)
                """,
                name=n["name"].strip(), type=n["type"],
                desc=(n.get("description") or "")[:500],
                collection=collection, qid=qid,
            )
        for e in edges:
            tx.run(
                """
                MATCH (a:Entity {name: $src}), (b:Entity {name: $dst})
                MERGE (a)-[r:REL {relation: $rel}]->(b)
                ON CREATE SET r.description = $desc, r.collections = [$collection]
                ON MATCH  SET r.collections =
                    CASE WHEN $collection IN r.collections THEN r.collections
                         ELSE r.collections + $collection END
                """,
                src=e["source"].strip(), dst=e["target"].strip(),
                rel=e["relation"], desc=(e.get("description") or "")[:500],
                collection=collection,
            )

    # ── Поиск ───────────────────────────────────────────────────────────

    def find_entities(self, query: str, limit: int = 10) -> list[dict]:
        """Fulltext-поиск сущностей по имени/описанию."""
        with self.driver.session() as s:
            res = s.run(
                """
                CALL db.index.fulltext.queryNodes('entity_names', $q)
                YIELD node, score
                RETURN node.name AS name, node.type AS type,
                       node.description AS description, score
                ORDER BY score DESC LIMIT $limit
                """,
                q=query, limit=limit,
            )
            return [dict(r) for r in res]

    def neighborhood(self, names: list[str], depth: int = 2, limit: int = 100) -> dict:
        """Подграф вокруг сущностей: узлы, связи, связанные чанки."""
        with self.driver.session() as s:
            res = s.run(
                f"""
                MATCH (start:Entity) WHERE start.name IN $names
                MATCH path = (start)-[:REL*1..{depth}]-(nb:Entity)
                WITH collect(DISTINCT nb) + collect(DISTINCT start) AS nodes
                UNWIND nodes AS n
                WITH collect(DISTINCT n) AS ns
                MATCH (a:Entity)-[r:REL]->(b:Entity)
                WHERE a IN ns AND b IN ns
                WITH ns, collect(DISTINCT {{src: a.name, dst: b.name,
                        relation: r.relation, description: r.description}}) AS rels
                OPTIONAL MATCH (n:Entity)-[:УПОМИНАЕТСЯ_В]->(c:Chunk) WHERE n IN ns
                WITH ns, rels, collect(DISTINCT c.qid) AS chunk_ids
                RETURN [x IN ns | {{name: x.name, type: x.type,
                        description: x.description}}] AS nodes,
                       rels, chunk_ids
                LIMIT $limit
                """,
                names=names, limit=limit,
            )
            row = res.single()
            if not row:
                return {"nodes": [], "edges": [], "chunk_ids": []}
            return {"nodes": row["nodes"], "edges": row["rels"], "chunk_ids": row["chunk_ids"]}

    def full_graph(self, collection: str | None = None, limit: int = 500) -> dict:
        """Граф для визуализации (узлы + связи, с ограничением)."""
        where = "WHERE $collection IN e.collections" if collection else ""
        with self.driver.session() as s:
            res = s.run(
                f"""
                MATCH (e:Entity) {where}
                WITH e ORDER BY size([(e)-[:REL]-() | 1]) DESC LIMIT $limit
                WITH collect(e) AS ns
                MATCH (a:Entity)-[r:REL]->(b:Entity) WHERE a IN ns AND b IN ns
                RETURN [x IN ns | {{name: x.name, type: x.type,
                        description: x.description}}] AS nodes,
                       collect({{src: a.name, dst: b.name, relation: r.relation,
                        description: r.description}}) AS edges
                """,
                collection=collection, limit=limit,
            )
            row = res.single()
            return {"nodes": row["nodes"] if row else [], "edges": row["edges"] if row else []}

    # ── Служебное ───────────────────────────────────────────────────────

    def stats(self) -> dict:
        with self.driver.session() as s:
            row = s.run(
                """
                MATCH (e:Entity) WITH count(e) AS entities
                MATCH ()-[r:REL]->() WITH entities, count(r) AS relations
                MATCH (c:Chunk) WITH entities, relations, count(c) AS chunks
                MATCH (e2:Entity) WITH entities, relations, chunks,
                     collect(DISTINCT e2.type) AS types
                RETURN entities, relations, chunks, types
                """
            ).single()
            return dict(row) if row else {"entities": 0, "relations": 0, "chunks": 0, "types": []}

    def clear(self, collection: str | None = None) -> None:
        with self.driver.session() as s:
            if collection:
                s.run("MATCH (c:Chunk {collection: $c}) DETACH DELETE c", c=collection)
                s.run(
                    """
                    MATCH (e:Entity) WHERE $c IN e.collections
                    SET e.collections = [x IN e.collections WHERE x <> $c]
                    WITH e WHERE size(e.collections) = 0
                    DETACH DELETE e
                    """,
                    c=collection,
                )
            else:
                s.run("MATCH (n) DETACH DELETE n")
