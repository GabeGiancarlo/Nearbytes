#!/usr/bin/env bash
set -euo pipefail

# Explicitly set storage directory to MEGA sync folder (redundant with app default but kept for explicit override)
export NEARBYTES_STORAGE_DIR="${NEARBYTES_STORAGE_DIR:-$HOME/MEGA/NearbytesStorage/NearbytesStorage}"

# Ensure directory exists
mkdir -p "$NEARBYTES_STORAGE_DIR"

# Log the storage directory being used
echo "Using storage dir: $NEARBYTES_STORAGE_DIR"

# Run the server
npm run server
