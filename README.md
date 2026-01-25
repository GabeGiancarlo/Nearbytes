# NearBytes v1.0

A cryptographic protocol for storing and sharing immutable data collections with end-to-end encryption.

## Overview

NearBytes is a content-addressed storage system that provides:

- **Content-addressed storage**: Data identified by SHA-256 hash
- **End-to-end encryption**: AES-256-GCM for data, ECDSA P-256 for signatures
- **Immutable event logs**: Signed events that cannot be modified
- **Channel-based organization**: Each channel identified by a public key
- **Deterministic key derivation**: Channels recreated from secrets

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

## License

MIT