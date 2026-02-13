#!/usr/bin/env bash
# macOS only. Frees ports 3000/5173, sets MEGA storage, starts backend + UI.
# Usage: from repo root: bash scripts/run-servers.sh
# Stop with Ctrl+C or run: bash scripts/stop-servers.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

echo "=== Nearbytes run-servers (macOS) ==="

# Free ports 3000 and 5173 if in use
if command -v lsof >/dev/null 2>&1; then
  PIDS=$(lsof -ti :3000,:5173 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "Stopping processes on ports 3000 and 5173..."
    echo "$PIDS" | xargs kill 2>/dev/null || true
    sleep 2
    # Force kill if still in use
    PIDS=$(lsof -ti :3000,:5173 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
      echo "$PIDS" | xargs kill -9 2>/dev/null || true
      sleep 1
    fi
  fi
fi

export NEARBYTES_STORAGE_DIR="${NEARBYTES_STORAGE_DIR:-$HOME/MEGA/NearbytesStorage}"
echo "Using storage dir: $NEARBYTES_STORAGE_DIR"
echo ""
echo "Starting backend (http://localhost:3000) and UI (http://localhost:5173)..."
echo "Stop with Ctrl+C or run: bash scripts/stop-servers.sh"
echo ""

# Open UI in browser after servers have had time to start (macOS)
(sleep 5 && open http://localhost:5173 2>/dev/null) &

npm run dev
