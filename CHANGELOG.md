# Changelog

Все значимые изменения GraphLens фиксируются здесь.
Формат: [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).

## [0.2.0] - 2026-07-23

### Добавлено
- Режим «только метаданные»: probe-эндпоинт, предупреждения в API (422) и UI (баннер)
- Чипы метаданных в карточках результатов поиска
- LICENSE (MIT), CONTRIBUTING, CHANGELOG
- docker-compose для Neo4j, скрипт seed_demo.py, dev.sh
- CI: GitHub Actions (backend tests + frontend build)
- Тесты _salvage_json
- Документация: api.md, architecture.md, demo.md

## [0.1.0] - 2026-07-22

### Добавлено
- Backend: Qdrant source, LLM-извлечение (12 типов сущностей, 16 отношений),
  Neo4j store, гибридный поиск (вектор + граф), FastAPI
- Frontend: канвас графа (react-force-graph-2d), панели поиска и извлечения,
  тёмная тема
