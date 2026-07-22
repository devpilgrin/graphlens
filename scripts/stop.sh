#!/usr/bin/env bash
# Остановка всех dev-процессов GraphLens
pkill -f "uvicorn app.main:app" 2>/dev/null && echo "backend остановлен"
pkill -f "vite" 2>/dev/null && echo "frontend остановлен"
exit 0
