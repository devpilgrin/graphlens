#!/usr/bin/env python3
"""Демо-корпус GraphLens: чанки markdown-документа -> Qdrant (текст в payload).

Использование:
    python scripts/seed_demo.py path/to/document.md [--collection lens_demo] [--chunks 12]
"""

import argparse
import re

from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams


def chunk_markdown(text: str, size: int = 1200) -> list[str]:
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks, buf = [], ""
    for p in paras:
        if len(buf) + len(p) > size and buf:
            chunks.append(buf)
            buf = p
        else:
            buf = (buf + "\n\n" + p).strip()
    if buf:
        chunks.append(buf)
    return chunks


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("document")
    ap.add_argument("--collection", default="lens_demo")
    ap.add_argument("--chunks", type=int, default=12)
    ap.add_argument("--qdrant", default="http://localhost:6333")
    ap.add_argument("--llm", default="http://localhost:1234/v1")
    ap.add_argument("--embed-model", default="text-embedding-qwen3-embedding-8b")
    args = ap.parse_args()

    text = open(args.document, encoding="utf-8").read()
    chunks = chunk_markdown(text)[: args.chunks]
    print(f"чанков: {len(chunks)}")

    llm = OpenAI(base_url=args.llm, api_key="lm-studio")
    qd = QdrantClient(url=args.qdrant)
    emb = llm.embeddings.create(model=args.embed_model, input=chunks)
    dim = len(emb.data[0].embedding)

    if qd.collection_exists(args.collection):
        qd.delete_collection(args.collection)
    qd.create_collection(args.collection, vectors_config=VectorParams(size=dim, distance=Distance.COSINE))
    qd.upsert(args.collection, [
        PointStruct(id=i, vector=d.embedding,
                    payload={"text": c, "source": args.document, "ord": i})
        for i, (c, d) in enumerate(zip(chunks, emb.data))
    ])
    print(f"загружено в '{args.collection}':", qd.get_collection(args.collection).points_count)


if __name__ == "__main__":
    main()
