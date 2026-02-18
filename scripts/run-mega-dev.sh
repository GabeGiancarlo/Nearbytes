#!/usr/bin/env bash
set -euo pipefail

# Explicitly set storage directory to MEGA sync folder (redundant with app default but kept for explicit override)
export NEARBYTES_STORAGE_DIR="${NEARBYTES_STORAGE_DIR:-$HOME/MEGA}"

# Log the storage directory being used
echo "Using MEGA storage dir: $NEARBYTES_STORAGE_DIR"

# Run both server and UI
npm run dev
