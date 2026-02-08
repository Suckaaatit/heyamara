#!/usr/bin/env bash
set -euo pipefail

API_PORT="${API_PORT:-3000}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WATCH_DIR="$ROOT/watched"

echo "Watcher Daemon demo starting..."
echo "Root: $ROOT"

if curl -fsS "http://localhost:11434/api/tags" >/dev/null 2>&1; then
  OLLAMA_AVAILABLE=1
else
  OLLAMA_AVAILABLE=0
  echo "Ollama not detected on http://localhost:11434. Rule evaluation will be paused."
fi

node "$ROOT/dist/index.js" >/dev/null 2>&1 &
DAEMON_PID=$!

cleanup() {
  if kill -0 "$DAEMON_PID" >/dev/null 2>&1; then
    kill "$DAEMON_PID" >/dev/null 2>&1 || true
    wait "$DAEMON_PID" >/dev/null 2>&1 || true
    echo "Daemon stopped."
  fi
}
trap cleanup EXIT

HEALTH_URL="http://localhost:${API_PORT}/health"
DEADLINE=$((SECONDS + 20))
HEALTHY=0
while [ $SECONDS -lt $DEADLINE ]; do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 1
done

if [ "$HEALTHY" -eq 1 ]; then
  echo "API is healthy."
else
  echo "API did not become healthy in time. Check logs and port $API_PORT."
fi

curl -fsS -X POST "http://localhost:${API_PORT}/rules" \
  -H "Content-Type: application/json" \
  -d '{"name":"Demo: TS Changes","description":"Alert on .ts changes","condition":"Alert when TypeScript files change"}' >/dev/null || true
echo "Rule created (or already exists)."

mkdir -p "$WATCH_DIR"
echo "// demo change $(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "$WATCH_DIR/demo.ts"
echo "Wrote demo file: $WATCH_DIR/demo.ts"

sleep 3

echo "Report:"
curl -fsS "http://localhost:${API_PORT}/report" || true
echo

if [ "$OLLAMA_AVAILABLE" -eq 0 ]; then
  echo "Tip: start Ollama and run a model (e.g. 'ollama run llama2') to see rule matches."
fi

echo "Demo complete."
