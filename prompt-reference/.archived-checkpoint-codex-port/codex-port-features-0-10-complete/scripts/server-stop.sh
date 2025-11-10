#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/tmp/server.pid"
if [[ ! -f "$PID_FILE" ]]; then
  echo "Server not running (no PID file)."
  exit 0
fi
PID="$(cat "$PID_FILE")"
if ! kill -0 "$PID" >/dev/null 2>&1; then
  echo "Server not running (stale PID file)."
  rm -f "$PID_FILE"
  exit 0
fi
kill "$PID"
for _ in {1..10}; do
  if kill -0 "$PID" >/dev/null 2>&1; then
    sleep 0.2
  else
    break
  fi
done
if kill -0 "$PID" >/dev/null 2>&1; then
  echo "Server did not stop gracefully; sending SIGKILL" >&2
  kill -9 "$PID" >/dev/null 2>&1 || true
fi
rm -f "$PID_FILE"
echo "Server stopped."
