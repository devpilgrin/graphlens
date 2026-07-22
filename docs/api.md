# GraphLens API Reference

Base URL: `http://localhost:8200`

## Инфраструктура

### GET /api/health
Проверка живости. → `{"status": "ok", "service": "graphlens"}`

### GET /api/qdrant/collections
Список коллекций Qdrant с числом точек.

### GET /api/qdrant/collections/{name}/probe
Проверка наличия текста в метаданных коллекции:
```json
{"collection": "...", "points": 123, "has_text": true, "text_field": "text", "fields": ["text", "source"]}
```
`has_text=false` - построение графа невозможно, UI показывает предупреждение.

## Извлечение

### POST /api/extract
`{"collection": "name", "limit": null, "batch_size": 5}` → фоновое извлечение.
Ошибки: 409 (уже идёт), 422 (нет текста в метаданных).

### GET /api/extract/status
`{running, processed, total, nodes, edges, errors, started_at, finished_at}`

### POST /api/extract/cancel

## Поиск

### POST /api/search
`{"collection": "name", "question": "...", "top_k": 10}` →
```json
{
  "question": "...", "collection": "...", "warning": null,
  "entities": [{"name", "type", "description", "score"}],
  "subgraph": {"nodes": [...], "edges": [...]},
  "results": [{"qdrant_id", "score", "vector_score", "via_graph", "text", "payload"}]
}
```
`warning` непустой - в метаданных нет текста, смотрите `payload` результатов.

## Граф

### GET /api/graph?collection=&limit=500
Узлы и связи для визуализации.

### GET /api/graph/stats
`{entities, relations, chunks, types}`

### GET /api/graph/neighborhood?names=A,B&depth=2
Подграф вокруг сущностей.

### DELETE /api/graph?collection=
Очистка графа (по коллекции или целиком).
