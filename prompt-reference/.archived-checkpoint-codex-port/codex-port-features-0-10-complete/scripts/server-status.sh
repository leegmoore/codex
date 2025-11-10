#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/tmp/server.pid"
if [[ ! -f "$PID_FILE" ]]; then
  echo "Server not running."
  exit 1
fi
PID="$(cat "$PID_FILE")"
if kill -0 "$PID" >/dev/null 2>&1; then
  echo "Server running (PID $PID)."
  exit 0
else
  echo "Server PID file exists but process not running."
  exit 1
fi
