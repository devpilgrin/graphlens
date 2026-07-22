# GraphLens

Графовый поиск как надстройка над любой Qdrant БД.

GraphLens подключается к существующей Qdrant-коллекции (ваш RAG), извлекает из чанков сущности и связи через LLM, строит граф знаний в Neo4j и даёт гибридный поиск: векторный контур + обход графа. С отдельной страницей визуализации графа.

## Архитектура

```
Qdrant (любая БД) ──чтение чанков──► GraphLens ──bolt──► Neo4j
                                        │
   LLM (OpenAI-совместимый endpoint) ◄──┤ извлечение сущностей/связей
                                        │
   React UI ◄── FastAPI :8200 ──────────┘ поиск: вектор + граф
```

- **Независимость**: GraphLens не владеет Qdrant, только читает точки (id + payload)
- **Связка**: узлы графа хранят `qid` чанков Qdrant - обход графа возвращает исходные тексты
- **Предсказуемый граф**: фиксированные типы сущностей (12) и отношений (16), LLM выбирает из списка

## Стек

Backend: Python 3.12+, FastAPI, qdrant-client, neo4j, OpenAI SDK
Frontend: React + Vite + TypeScript (страница графа)

## Быстрый старт

```bash
# 1. Neo4j (docker)
docker run -d --name neo4j-graphrag -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/<пароль> neo4j:5-community

# 2. Backend
cd backend
uv venv && source .venv/bin/activate
uv pip install -r requirements.txt
cp .env.example .env   # заполнить Neo4j/LLM
uvicorn app.main:app --port 8200

# 3. Извлечение графа из коллекции
curl -X POST localhost:8200/api/extract -H 'Content-Type: application/json' \
  -d '{"collection": "my_rag_collection"}'

# 4. Поиск
curl -X POST localhost:8200/api/search -H 'Content-Type: application/json' \
  -d '{"collection": "my_rag_collection", "question": "выручка за 2025"}'
```

## API

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/health` | проверка |
| GET | `/api/qdrant/collections` | список коллекций Qdrant |
| POST | `/api/extract` | старт извлечения графа (фон) |
| GET | `/api/extract/status` | прогресс извлечения |
| POST | `/api/extract/cancel` | отмена |
| POST | `/api/search` | гибридный поиск |
| GET | `/api/graph` | граф для визуализации |
| GET | `/api/graph/stats` | счётчики узлов/связей |
| DELETE | `/api/graph` | очистка графа |

## Лицензия

MIT
