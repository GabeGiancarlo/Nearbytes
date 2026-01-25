#!/usr/bin/env bash
set -euo pipefail

# Set storage directory to MEGA sync folder
export NEARBYTES_STORAGE_DIR="${NEARBYTES_STORAGE_DIR:-$HOME/MEGA/NearbytesStorage}"

# Ensure directory exists
mkdir -p "$NEARBYTES_STORAGE_DIR"

# Log the storage directory being used
echo "Using storage dir: $NEARBYTES_STORAGE_DIR"

# Run the server
npm run server
