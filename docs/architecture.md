# Архитектура GraphLens

## Потоки данных

### Извлечение графа
```
Qdrant.scroll -> батч чанков -> LLM (JSON: nodes/edges) -> Neo4j MERGE
```

1. `QdrantSource.iter_chunks` - scroll всех точек коллекции, текст из payload
2. `Extractor.extract_batch` - до N чанков в одном LLM-запросе, строгий JSON,
   фиксированные типы сущностей (12) и отношений (16)
3. `GraphStore.upsert_extraction` - MERGE узлов по (name, type),
   связь Entity-[:УПОМИНАЕТСЯ_В]->Chunk(qid), REL-ребро с relation

### Поиск
```
вопрос -> fulltext Neo4j (сущности) -> обход графа -> chunk_ids
       -> embedding -> vector search Qdrant
       -> merge: graph_boost к score чанков, найденных графом
```

## Модель данных Neo4j

- `(:Entity {name, type, description, collections})` - UNIQUE(name, type)
- `(:Chunk {qid, collection})` - ссылка на точку Qdrant
- `(:Entity)-[:УПОМИНАЕТСЯ_В]->(:Chunk)`
- `(:Entity)-[:REL {relation, description, collections}]->(:Entity)`

Тип связи - в свойстве (без APOC и динамических типов отношений).

## Почему фиксированные списки типов

LLM ВЫБИРАЕТ отношение из списка, а не придумывает новые: это исключает
дубликаты вида «имеет_значение»/«имеет_значения» и делает граф предсказуемым
для обхода и визуализации.
