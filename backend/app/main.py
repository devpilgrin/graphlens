"""GraphLens API: извлечение графа из Qdrant, гибридный поиск, визуализация."""

from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import settings
from .extractor import Extractor
from .graph_store import GraphStore
from .qdrant_source import QdrantSource
from .search import HybridSearch

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("graphlens.api")

app = FastAPI(title="GraphLens", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

qdrant = QdrantSource()
graph = GraphStore()
extractor = Extractor()
search_engine = HybridSearch(qdrant, graph)


# ── Состояние задачи извлечения ─────────────────────────────────────────

_job: dict[str, Any] = {
    "running": False, "collection": None, "processed": 0, "total": None,
    "nodes": 0, "edges": 0, "errors": 0, "started_at": None, "finished_at": None,
}
_job_lock = threading.Lock()
_cancel = threading.Event()


class ExtractRequest(BaseModel):
    collection: str
    limit: int | None = None          # максимум чанков (None = все)
    batch_size: int | None = None     # чанков в одном LLM-запросе


class SearchRequest(BaseModel):
    collection: str
    question: str
    top_k: int | None = None


# ── Инфраструктура ──────────────────────────────────────────────────────

@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "graphlens"}


@app.get("/api/qdrant/collections")
def collections() -> dict:
    try:
        names = qdrant.list_collections()
        return {"collections": [qdrant.collection_info(n) for n in names]}
    except Exception as exc:
        raise HTTPException(502, f"Qdrant недоступен: {exc}")


# ── Извлечение ──────────────────────────────────────────────────────────

def _extract_worker(collection: str, limit: int | None, batch_size: int) -> None:
    global _job
    log.info("старт извлечения: collection=%s limit=%s batch=%s", collection, limit, batch_size)
    pool = ThreadPoolExecutor(max_workers=settings.extract_concurrency)
    chunks_seen = 0
    try:
        batch: list = []
        for chunk in qdrant.iter_chunks(collection):
            if _cancel.is_set():
                break
            batch.append(chunk)
            if len(batch) >= batch_size:
                _process_batch(collection, batch, pool)
                chunks_seen += len(batch)
                batch = []
            if limit and chunks_seen >= limit:
                break
        if batch and not _cancel.is_set():
            _process_batch(collection, batch, pool)
            chunks_seen += len(batch)
    except Exception:
        log.exception("извлечение прервано ошибкой")
        with _job_lock:
            _job["errors"] += 1
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
        with _job_lock:
            _job["running"] = False
            _job["finished_at"] = time.time()
        log.info("извлечение завершено: %s", _job)


def _process_batch(collection: str, batch: list, pool: ThreadPoolExecutor) -> None:
    texts = [c.text for c in batch]
    try:
        results = extractor.extract_batch(texts)
    except Exception:
        log.exception("extract_batch упал")
        results = [{"nodes": [], "edges": []} for _ in texts]
    for chunk, data in zip(batch, results):
        if _cancel.is_set():
            return
        try:
            counts = graph.upsert_extraction(collection, chunk.id, data)
            with _job_lock:
                _job["processed"] += 1
                _job["nodes"] += counts["nodes"]
                _job["edges"] += counts["edges"]
        except Exception:
            log.exception("запись в Neo4j не удалась (chunk %s)", chunk.id)
            with _job_lock:
                _job["errors"] += 1


@app.post("/api/extract")
def start_extract(req: ExtractRequest) -> dict:
    with _job_lock:
        if _job["running"]:
            raise HTTPException(409, "Извлечение уже выполняется")
        _job.update({
            "running": True, "collection": req.collection, "processed": 0,
            "total": req.limit, "nodes": 0, "edges": 0, "errors": 0,
            "started_at": time.time(), "finished_at": None,
        })
    _cancel.clear()
    thread = threading.Thread(
        target=_extract_worker,
        args=(req.collection, req.limit, req.batch_size or settings.extract_batch_size),
        daemon=True,
    )
    thread.start()
    return {"status": "started", "collection": req.collection}


@app.get("/api/extract/status")
def extract_status() -> dict:
    with _job_lock:
        return dict(_job)


@app.post("/api/extract/cancel")
def extract_cancel() -> dict:
    _cancel.set()
    return {"status": "cancelling"}


# ── Поиск ───────────────────────────────────────────────────────────────

@app.post("/api/search")
def search(req: SearchRequest) -> dict:
    try:
        return search_engine.search(req.collection, req.question, req.top_k)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


# ── Граф ────────────────────────────────────────────────────────────────

@app.get("/api/graph/stats")
def graph_stats() -> dict:
    return graph.stats()


@app.get("/api/graph")
def graph_view(collection: str | None = None, limit: int = 500) -> dict:
    return graph.full_graph(collection, limit)


@app.get("/api/graph/neighborhood")
def graph_neighborhood(names: str, depth: int = 2) -> dict:
    return graph.neighborhood([n.strip() for n in names.split(",") if n.strip()], depth)


@app.delete("/api/graph")
def graph_clear(collection: str | None = None) -> dict:
    graph.clear(collection)
    return {"status": "cleared", "collection": collection}


@app.on_event("shutdown")
def shutdown() -> None:
    graph.close()
