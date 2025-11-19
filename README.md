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

## License

MIT

