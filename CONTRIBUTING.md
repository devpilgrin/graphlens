# Contributing to GraphLens

Спасибо за интерес к проекту!

## Процесс

1. Fork и ветка от `main`: `feat/...` или `fix/...`
2. Коммиты на русском или английском, осмысленные сообщения
3. PR с описанием: что изменено и зачем
4. Backend: убедитесь, что `pytest` проходит
5. Frontend: `npm run build` без ошибок

## Стиль

- Backend: Python 3.12+, type hints, docstrings на русском
- Frontend: TypeScript, функциональные компоненты, Tailwind v4
- Комментарии и документация - на русском, идентификаторы - на английском

## Запуск для разработки

```bash
# backend
cd backend && uv venv && uv pip install -r requirements.txt
uvicorn app.main:app --reload --port 8200

# frontend
cd frontend && npm install && npm run dev
```
