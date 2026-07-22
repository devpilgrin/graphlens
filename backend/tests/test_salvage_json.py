"""Тесты извлечения JSON из ответов LLM (extractor._salvage_json)."""

from app.extractor import _salvage_json


def test_clean_json():
    data = _salvage_json('{"nodes": [{"name": "A"}], "edges": []}')
    assert data["nodes"][0]["name"] == "A"


def test_markdown_wrapped():
    raw = 'Вот результат:\n```json\n{"nodes": [], "edges": [{"source": "A"}]}\n```'
    data = _salvage_json(raw)
    assert data["edges"][0]["source"] == "A"


def test_think_block_stripped():
    raw = '<think>рассуждения без JSON</think>{"nodes": [{"name": "X"}], "edges": []}'
    data = _salvage_json(raw)
    assert data["nodes"][0]["name"] == "X"


def test_largest_object_wins():
    raw = '{"a": 1} текст {"nodes": [{"name": "A"}, {"name": "B"}], "edges": []}'
    data = _salvage_json(raw)
    assert len(data["nodes"]) == 2


def test_truncated_json_closed():
    data = _salvage_json('{"nodes": [{"name": "A"}]')
    assert "nodes" in data


def test_garbage_returns_empty():
    assert _salvage_json("совсем не json") == {}
    assert _salvage_json("") == {}
