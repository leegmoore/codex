#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT/logs"
OUT_LOG="$LOG_DIR/server.out.log"
ERR_LOG="$LOG_DIR/server.err.log"
mkdir -p "$LOG_DIR"
touch "$OUT_LOG" "$ERR_LOG"
if [[ "${1:-}" == "--follow" ]]; then
  shift
  tail -f "$OUT_LOG" "$ERR_LOG"
else
  echo "== stdout =="
  tail -n 100 "$OUT_LOG" || true
  echo "\n== stderr =="
  tail -n 100 "$ERR_LOG" || true
fi
