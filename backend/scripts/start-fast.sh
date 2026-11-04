#!/usr/bin/env bash
# Lightning-fast local start — skips reload, uses uvloop when available.
set -euo pipefail
cd "$(dirname "$0")/.."
export APP_ENV="${APP_ENV:-development}"
exec python -m uvicorn app.main:app \
  --host "${APP_HOST:-0.0.0.0}" \
  --port "${APP_PORT:-8000}" \
  --loop asyncio \
  --http httptools \
  --no-access-log \
  --timeout-keep-alive 5 \
  --log-level warning
