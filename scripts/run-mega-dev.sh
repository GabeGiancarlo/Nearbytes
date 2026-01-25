#!/usr/bin/env bash
set -euo pipefail

# Set storage directory to MEGA sync folder
export NEARBYTES_STORAGE_DIR="${NEARBYTES_STORAGE_DIR:-$HOME/MEGA/NearbytesStorage}"

# Log the storage directory being used
echo "Using MEGA storage dir: $NEARBYTES_STORAGE_DIR"

# Run both server and UI
npm run dev
