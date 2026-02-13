#!/usr/bin/env bash
# Run once after clone. Installs dependencies and builds.
# Usage: from repo root: bash scripts/setup.sh
# To capture output to a file (if terminal closes): bash scripts/setup.sh 2>&1 | tee setup.log
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ ! -f "$REPO_ROOT/package.json" ]; then
  echo "Error: Run this script from the repo root (directory containing package.json)."
  echo "Current script location: $SCRIPT_DIR"
  exit 1
fi
cd "$REPO_ROOT"

# Log file so you can read output after terminal closes
SETUP_LOG="$REPO_ROOT/setup.log"
exec > >(tee "$SETUP_LOG") 2>&1
echo "Logging to $SETUP_LOG"

# Show error and exit code if script exits due to failure (set -e)
trap 'code=$?; if [ $code -ne 0 ]; then echo ""; echo "Setup failed (exit $code). See $SETUP_LOG for full output."; exit $code; fi' EXIT

echo "=== Nearbytes setup (run once) ==="
echo "Repo root: $REPO_ROOT"

echo ""
echo "Installing root dependencies..."
npm install

echo ""
echo "Installing UI dependencies..."
(cd ui && npm install)

echo ""
echo "Building..."
npm run build

trap - EXIT
echo ""
echo "=== Setup complete ==="
echo "Next: run servers with  bash scripts/run-servers.sh"
echo "Stop servers with       bash scripts/stop-servers.sh"
