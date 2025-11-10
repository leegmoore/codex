#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/tmp/server.pid"
LOG_DIR="$ROOT/logs"
OUT_LOG="$LOG_DIR/server.out.log"
ERR_LOG="$LOG_DIR/server.err.log"

mkdir -p "$LOG_DIR" "$ROOT/tmp"

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" >/dev/null 2>&1; then
    echo "Server already running with PID $PID" >&2
    exit 0
  else
    echo "Removing stale PID file" >&2
    rm -f "$PID_FILE"
  fi
fi

# Run from project root so relative paths resolve
(
  cd "$ROOT"
  CODEX_SERVER_SCRIPT=1 HOST=${HOST:-127.0.0.1} PORT=${PORT:-4010} nohup npx bun run src/server.ts >>"$OUT_LOG" 2>>"$ERR_LOG" &
  echo $! > "$PID_FILE"
)
PID="$(cat "$PID_FILE")"

sleep 0.5
if kill -0 "$PID" >/dev/null 2>&1; then
  echo "Server started (PID $PID). Logs: $OUT_LOG"
else
  echo "Server failed to start, see logs." >&2
  rm -f "$PID_FILE"
  exit 1
fi
