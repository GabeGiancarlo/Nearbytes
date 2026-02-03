# NearBytes Project Overview

## Introduction

**NearBytes v1.0** is a cryptographic protocol for storing and sharing immutable data collections with end-to-end encryption. It provides a secure, content-addressed storage system that ensures data integrity, confidentiality, and authenticity.

## Core Features

1. **Content-addressed storage**: Data is identified by SHA-256 hash
2. **End-to-end encryption**: AES-256-GCM for data, ECDSA P-256 for signatures
3. **Immutable event logs**: Signed events that cannot be modified
4. **Channel-based organization**: Each channel identified by a public key
5. **Deterministic key derivation**: Channels can be recreated from secrets

## Architecture

NearBytes follows a **layered architecture** with clear separation of concerns:

```
┌─────────────────────────────────────┐
│         CLI Layer                   │
│  (Commands, Output, Validation)    │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│       Domain Layer                   │
│  (Channel, Event, Operations)       │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│      Storage Layer                   │
│  (Backend, Channel, Serialization)  │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│      Crypto Layer                    │
│  (Hash, Symmetric, Asymmetric)      │
└─────────────────────────────────────┘
```

### Layer Descriptions

- **CLI Layer**: Command-line interface (`setup`, `store`, `retrieve`, `list`)
- **Domain Layer**: High-level protocol operations (channels, events)
- **Storage Layer**: Abstract storage backend with filesystem implementation
- **Crypto Layer**: Cryptographic primitives (hash, symmetric, asymmetric)

## Technology Stack

- **Language**: TypeScript
- **Runtime**: Node.js 18+ (uses Web Crypto API)
- **CLI Framework**: Commander.js
- **Testing**: Vitest
- **Crypto**: Web Crypto API only (no external crypto libraries)

## Security Features

- **AES-256-GCM encryption** for data confidentiality
- **ECDSA P-256 signatures** for authentication
- **PBKDF2 key derivation** with 100,000 iterations
- **Deterministic key derivation** from secrets
- **Content addressing** via SHA-256 hashing

## Key Management

**Private keys are never stored.** They are deterministically derived from your secret each time they're needed using PBKDF2. This design provides several security benefits:

- **No persistent private keys**: Private keys never exist on disk, only temporarily in memory during operations
- **Secret-based recovery**: As long as you have your secret, you can always regenerate the private key
- **Simplified security model**: You only need to protect your secret, not manage separate key files

The public key is derived from the secret and used to identify channels, but the private key is only computed on-demand for signing and decryption operations.

## Data Storage

Data is stored locally in the `./data` directory (default location) with the following structure:

```
data/
├── [channel-public-key-hex]/          # Channel directory (named by public key)
│   └── [event-hash].bin               # Signed events (metadata)
└── data/
    └── [data-hash].bin                # Encrypted data blocks
```

**Storage Components:**

1. **Event Files** (`[channel-public-key]/[event-hash].bin`):
   - Contains signed event metadata (data hash, encrypted key, signature)
   - Stored per-channel in directories named after the channel's public key
   - Used to track what data belongs to which channel

2. **Encrypted Data Blocks** (`data/[data-hash].bin`):
   - Contains the actual encrypted file data (AES-256-GCM encrypted)
   - Content-addressed by SHA-256 hash for deduplication
   - Shared across channels if the same data is stored multiple times

**Custom Storage Location:**

You can specify a custom data directory using the `--data-dir` option:

```bash
nearbytes setup --secret "mychannel:mypassword" --data-dir /path/to/custom/location
```

All stored files are encrypted binary files (`.bin`). Without your secret, the data cannot be decrypted or accessed.

## CLI Commands

- `nearbytes setup` — Initialize a new channel
- `nearbytes store` — Store encrypted data
- `nearbytes retrieve` — Retrieve and decrypt data
- `nearbytes list` — List all events in a channel

## Project Structure

```
src/
├── crypto/          # Cryptographic operations
├── storage/         # Storage backend implementations
├── domain/          # Business logic (channels, events, operations)
├── cli/             # Command-line interface
└── types/           # Type definitions

docs/
├── architecture.md  # Detailed architecture documentation
├── api.md          # API reference
├── crypto.md       # Cryptographic details
└── usage.md        # Usage guide
```

## Design Principles

- **Branded Types**: Prevent type confusion at compile-time
- **Interface-based**: All layers use interfaces for testability
- **Error Handling**: Custom error types with proper chaining
- **Immutability**: Use `readonly` and immutable data structures
- **Web Crypto Only**: No external crypto libraries for security

## Use Cases

- Secure file backup and storage
- Encrypted data sharing between parties
- Immutable audit logs
- Content-addressed data archives

## Related Documentation

- [Architecture](architecture.md) - Detailed system architecture
- [API Reference](api.md) - Complete API documentation
- [Cryptographic Details](crypto.md) - Security and crypto implementation
- [Usage Guide](usage.md) - How to use NearBytes CLI


