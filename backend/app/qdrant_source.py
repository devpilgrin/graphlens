"""Чтение чанков из произвольной Qdrant-коллекции.

GraphLens не владеет Qdrant - только читает точки (id + payload) из любой
указанной коллекции. Текст чанка извлекается из настраиваемого поля payload
или из типовых вариантов (text, content, chunk, page_content...).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Iterator

from qdrant_client import QdrantClient

from .config import settings

log = logging.getLogger("graphlens.qdrant")

# Типовые имена полей с текстом чанка в payload
_TEXT_CANDIDATES = ("text", "content", "chunk", "page_content", "chunk_text", "body")


@dataclass
class Chunk:
    id: Any                      # id точки в Qdrant
    text: str
    payload: dict = field(default_factory=dict)


class QdrantSource:
    def __init__(self) -> None:
        self.client = QdrantClient(
            host=settings.qdrant_host,
            port=settings.qdrant_port,
            api_key=settings.qdrant_api_key or None,
        )

    def list_collections(self) -> list[str]:
        return [c.name for c in self.client.get_collections().collections]

    def collection_info(self, collection: str) -> dict:
        info = self.client.get_collection(collection)
        return {
            "name": collection,
            "points": info.points_count,
            "vectors": info.config.params.vectors.size
            if hasattr(info.config.params.vectors, "size")
            else None,
        }

    def _detect_text_field(self, collection: str) -> str:
        """Определяет поле с текстом по первой точке коллекции."""
        if settings.qdrant_text_field:
            return settings.qdrant_text_field
        points, _ = self.client.scroll(collection, limit=1, with_payload=True)
        if not points:
            raise ValueError(f"Коллекция '{collection}' пуста")
        payload = points[0].payload or {}
        for name in _TEXT_CANDIDATES:
            if isinstance(payload.get(name), str) and payload[name].strip():
                log.info("поле текста определено: '%s'", name)
                return name
        raise ValueError(
            f"Не найдено текстовое поле в payload. Есть поля: {list(payload.keys())}. "
            f"Задайте QDRANT_TEXT_FIELD в .env"
        )

    def iter_chunks(self, collection: str, batch: int = 128) -> Iterator[Chunk]:
        """Итерирует все чанки коллекции (scroll)."""
        text_field = self._detect_text_field(collection)
        offset = None
        while True:
            points, offset = self.client.scroll(
                collection, limit=batch, offset=offset, with_payload=True, with_vectors=False
            )
            if not points:
                break
            for p in points:
                text = (p.payload or {}).get(text_field) or ""
                if text.strip():
                    yield Chunk(id=p.id, text=text, payload=p.payload or {})
            if offset is None:
                break
