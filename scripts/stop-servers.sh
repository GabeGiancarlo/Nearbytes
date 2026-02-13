#!/usr/bin/env bash
# Stops processes on ports 3000 and 5173 (backend and UI).
# Usage: from repo root: bash scripts/stop-servers.sh
set -euo pipefail

echo "Stopping Nearbytes servers (ports 3000 and 5173)..."

PIDS=$(lsof -ti :3000,:5173 2>/dev/null || true)
if [ -z "$PIDS" ]; then
  echo "No processes found on ports 3000 or 5173."
  exit 0
fi

echo "$PIDS" | xargs kill 2>/dev/null || true
echo "Done."
