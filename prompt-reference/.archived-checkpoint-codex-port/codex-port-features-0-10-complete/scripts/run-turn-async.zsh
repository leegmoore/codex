#!/usr/bin/env zsh
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 '<message>'" >&2
  exit 1
fi

MESSAGE="$1"
ROOT=${0:a:h:h}
cd "$ROOT"

SESSION=$(curl -sS -X POST -H 'Content-Type: application/json' --data '{"instructions":""}' http://127.0.0.1:4010/api/sessions | jq -r .sessionId)
if [[ -z $SESSION ]]; then
  echo "Failed to create session" >&2
  exit 1
fi
echo "session=$SESSION"

printf '{ "sessionId": "%s", "message": "%s" }\n' "$SESSION" "$MESSAGE" \
  | curl -sS -N -X POST \
      -H 'Content-Type: application/json' \
      -H 'Accept: text/event-stream' \
      --data-binary @- http://127.0.0.1:4010/api/turns \
  | awk '/^data: /{ $0 = substr($0,7); if ($0 != "[DONE]") print }' \
  > tmp/session-$SESSION-turn1.sse &

disown %+
echo "streaming to tmp/session-$SESSION-turn1.sse"
