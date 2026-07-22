#!/usr/bin/env bash
# Запуск GraphLens для разработки: backend :8200 + frontend :3300
set -e
cd "$(dirname "$0")/.."

(cd backend && .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8200) &
BACK_PID=$!
trap 'kill $BACK_PID 2>/dev/null' EXIT

(cd frontend && npm run dev)
