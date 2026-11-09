#!/usr/bin/env bash
set -euo pipefail
set -m
mkdir -p .review/selfcheck
pnpm --config.verify-deps-before-run=false --filter @ap/platform-web exec vite --host 127.0.0.1 --port 4198 --strictPort > .review/selfcheck/vite.log 2>&1 &
server_pid=$!
stop_server() {
  kill -TERM -- "-$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap stop_server EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
ready=0
for attempt in {1..60}; do
  if curl --silent --fail http://127.0.0.1:4198/ >/dev/null; then ready=1; break; fi
  if ! kill -0 "$server_pid" 2>/dev/null; then cat .review/selfcheck/vite.log; exit 1; fi
  sleep 1
done
if [ "$ready" != 1 ]; then cat .review/selfcheck/vite.log; exit 1; fi
cd apps/platform-e2e
{ printf 'globalThis.w1189qKeepSpace = %s;\n' "${W1189Q_KEEP_SPACE:-false}"; cat w1189q-selfcheck.mjs; } | ego-browser nodejs
