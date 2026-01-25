# NearBytes v1.0

A cryptographic protocol for storing and sharing immutable data collections with end-to-end encryption.

## Overview

NearBytes is a content-addressed storage system that provides:

- **Content-addressed storage**: Data identified by SHA-256 hash
- **End-to-end encryption**: AES-256-GCM for data, ECDSA P-256 for signatures
- **Immutable event logs**: Signed events that cannot be modified
- **Channel-based organization**: Each channel identified by a public key
- **Deterministic key derivation**: Channels recreated from secrets

## Professor Quick Start (MEGA Storage)

**Prerequisites:**
- Node.js 18+ and npm
- MEGA desktop app installed and running
- MEGA shared folder synced locally at `$HOME/MEGA/NearbytesStorage`

**Steps:**

1. **Clone and install:**
   ```bash
   git clone <repo-url>
   cd Nearbytes
   npm install
   cd ui && npm install && cd ..
   ```

2. **Set storage directory:**
   ```bash
   export NEARBYTES_STORAGE_DIR="$HOME/MEGA/NearbytesStorage"
   ```

3. **Start server and UI:**
   ```bash
   npm run dev
   ```

   This starts both:
   - Backend server on `http://localhost:3000`
   - UI dev server on `http://localhost:5173`

4. **Open browser:**
   - Navigate to `http://localhost:5173`
   - Type `LeedsUnited` in the secret field
   - Files should appear if the MEGA folder is synced

**Important:** The professor must have the MEGA shared folder synced locally at `$HOME/MEGA/NearbytesStorage`, otherwise the volume will be empty.

For verification steps, see [docs/professor-verify.md](docs/professor-verify.md).

## Installation

```bash
npm install
npm run build
```

## Quick Start

### 1. Setup a Channel

```bash
nearbytes setup --secret "mychannel:mypassword"
```

This creates a new channel and outputs the public key.

### 2. Store Data

```bash
nearbytes store --file ./photo.jpg --secret "mychannel:mypassword"
```

Outputs:
- Event hash: `abc123...`
- Data hash: `def456...`

### 3. List Events

```bash
nearbytes list --secret "mychannel:mypassword"
```

Lists all events in the channel.

### 4. Retrieve Data

```bash
nearbytes retrieve --event abc123... --secret "mychannel:mypassword" --output ./retrieved-photo.jpg
```

Retrieves and decrypts the data.

## Encrypted File Layer (Phase 1)

NearBytes includes a file-aware event layer that derives file state solely by replaying
the append-only event log for a secret-derived channel. There is no mutable index; the
current file list is reconstructed deterministically from events.

Example usage:

```ts
import { addFile, listFiles, getFile } from './src/domain/fileService.js';
import { readFileSync } from 'fs';

const secret = 'mychannel:mypassword';
await addFile(secret, 'photo.jpg', readFileSync('photo.jpg'), 'image/jpeg');
const files = await listFiles(secret);
const data = await getFile(secret, files[0].blobHash);
```

## Phase 2: Local File Server API

Nearbytes includes a stateless local API server that exposes the Phase 1 file
service over HTTP. Every request supplies either a secret header or a stateless
Bearer token derived from the secret.

### Run the server

```bash
npm install
npm run build
NEARBYTES_STORAGE_DIR=./nearbytes-storage npm run server
```

Optional auth token key (32 bytes, hex or base64/base64url):

```bash
NEARBYTES_SERVER_TOKEN_KEY="<32-byte-key>" npm run server
```

### Try the API (secret header mode)

```bash
curl -X POST http://localhost:3000/open \
  -H "Content-Type: application/json" \
  -d '{"secret":"my volume"}'

curl http://localhost:3000/files \
  -H "x-nearbytes-secret: my volume"

curl -X POST http://localhost:3000/upload \
  -H "x-nearbytes-secret: my volume" \
  -F "file=@./photo.jpg"

curl -L http://localhost:3000/file/<hash> \
  -H "x-nearbytes-secret: my volume" \
  -o out.bin

curl -X DELETE http://localhost:3000/files/photo.jpg \
  -H "x-nearbytes-secret: my volume"
```

### Try the API (bearer token mode)

```bash
TOKEN=$(curl -s http://localhost:3000/open \
  -H "Content-Type: application/json" \
  -d '{"secret":"my volume"}' | jq -r '.token')

curl http://localhost:3000/files \
  -H "Authorization: Bearer ${TOKEN}"
```

More details: [docs/api-server.md](docs/api-server.md)

## Phase 3: Branded Svelte 5 UI

Nearbytes includes a modern web UI built with Svelte 5 that provides a beautiful, reactive interface for managing encrypted files.

### Run the UI

**Terminal 1 - Backend:**
```bash
npm run build
npm run server
```

**Terminal 2 - UI:**
```bash
cd ui
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### UI Features

- **Secret-based access**: Enter a secret to instantly materialize files
- **Drag & drop upload**: Drop files to add them to a volume
- **Download & delete**: Click files to download, delete button to remove
- **Offline support**: Cached file listings work offline
- **PWA**: Installable as a web app with service worker caching

The UI proxies API calls to the backend running on port 3000. See [ui/README.md](ui/README.md) for detailed setup instructions and [docs/ui.md](docs/ui.md) for architecture details.

More details: [docs/ui.md](docs/ui.md)

## Phase 4: MEGA-backed Storage (Desktop Sync Folder)

Nearbytes can use MEGA desktop sync folder as the storage backend. This enables automatic cloud sync of encrypted blobs and logs across multiple machines.

### Setup MEGA Storage

1. **Create MEGA sync folder:**
   ```bash
   mkdir -p "$HOME/MEGA/NearbytesStorage"
   ```

2. **Configure MEGA desktop app:**
   - Open MEGA desktop app
   - Add `$HOME/MEGA/NearbytesStorage` as a sync folder
   - Wait for initial sync to complete

3. **Run backend and UI together:**
   ```bash
   export NEARBYTES_STORAGE_DIR="$HOME/MEGA/NearbytesStorage"
   npm run dev
   ```

   This starts both the backend server (port 3000) and UI dev server (port 5173).
   The server will log: `Using storage dir: /Users/yourname/MEGA/NearbytesStorage`

   **Or run separately:**
   ```bash
   # Terminal 1 - Backend
   export NEARBYTES_STORAGE_DIR="$HOME/MEGA/NearbytesStorage"
   npm run build
   npm run server

   # Terminal 2 - UI
   cd ui
   npm run dev
   ```

### How It Works

- **Local encryption**: Nearbytes encrypts all files locally before writing to storage
- **MEGA stores ciphertext**: Only encrypted blobs and event logs are stored in MEGA
- **Secret controls access**: The secret is never stored in MEGA; it's only used locally to derive encryption keys
- **Cross-machine sync**: Share the MEGA folder across machines to enable shared storage

### Convenience Scripts

**Start server and UI together:**
```bash
export NEARBYTES_STORAGE_DIR="$HOME/MEGA/NearbytesStorage"
npm run dev
```

**Or use the provided script to start just the server with MEGA storage:**
```bash
./scripts/run-mega.sh
```

This script automatically sets `NEARBYTES_STORAGE_DIR` and ensures the directory exists.

### Important Warnings

⚠️ **Do not rename or move the MEGA folder** once you start storing volumes unless you also update the `NEARBYTES_STORAGE_DIR` environment variable accordingly.

⚠️ **Keep MEGA client running** for automatic sync. Files written by Nearbytes will sync to MEGA cloud automatically.

⚠️ **Never commit the MEGA folder** into git. Add it to `.gitignore` if it's in your repository.

### Verification

See [docs/verify-mega.md](docs/verify-mega.md) for step-by-step verification instructions.

More details: [docs/mega.md](docs/mega.md)

Logical storage layout (conceptual, not hard-coded paths):

```
/storage
  /blobs/<hash>
  /logs/<channel-id>.log
```

## Architecture

NearBytes follows a layered architecture:

1. **Crypto Layer**: Cryptographic primitives (hash, symmetric, asymmetric)
2. **Storage Layer**: Abstract storage backend with filesystem implementation
3. **Domain Layer**: High-level protocol operations
4. **CLI Layer**: Command-line interface

See [docs/architecture.md](docs/architecture.md) for details.

## Security

- All data is encrypted with AES-256-GCM
- Signatures use ECDSA P-256
- Keys derived using PBKDF2 with 100,000 iterations
- No external crypto libraries (Web Crypto API only)

See [docs/crypto.md](docs/crypto.md) for cryptographic details.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Test
npm test

# Lint
npm run lint

# Format
npm run format
```

## Documentation

- [Architecture](docs/architecture.md)
- [Cryptographic Details](docs/crypto.md)
- [API Reference](docs/api.md)
- [Usage Guide](docs/usage.md)
- [File System Model](docs/file-system.md)
- [MEGA Integration](docs/mega.md)

## License

MIT