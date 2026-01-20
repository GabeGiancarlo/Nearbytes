# Phase 0: Repository Audit Summary

**Date**: 2024-12-19  
**Purpose**: Structural audit before protocol formalization

## Executive Summary

The NearBytes codebase implements a cryptographic storage protocol with:
- ✅ Cryptographic primitives (hash, symmetric, asymmetric)
- ✅ Storage abstraction layer
- ✅ Basic CLI commands
- ⚠️ **Missing**: Explicit domain model for "Volume" concept
- ⚠️ **Missing**: File naming/metadata in events
- ⚠️ **Missing**: DELETE_FILE event type
- ⚠️ **Missing**: Event log replay/materialization
- ⚠️ **Missing**: Volume derivation from secret (currently "channel" concept)

---

## 1. Core Domain Abstractions

### Current State

**Channel** (`src/domain/channel.ts`)
- Represents a storage channel identified by a public key
- Path derived from public key via `ChannelPathMapper`
- **Issue**: Conceptually similar to "Volume" but not explicitly named as such

**Event** (`src/domain/event.ts`)
- Represents a signed event in a channel
- Contains: hash, signedEvent, publicKey
- **Issue**: Events only reference data hashes, no file names or metadata
- **Issue**: Only one implicit event type (CREATE_FILE), no DELETE_FILE

**EventPayload** (`src/types/events.ts`)
- Structure: `{ hash: Hash, encryptedKey: EncryptedData }`
- **Issue**: No event type discriminator
- **Issue**: No file name or metadata fields

### Missing Abstractions

1. **Volume**: Should be the primary abstraction (not "Channel")
   - Deterministically derived from secret
   - Contains event log
   - Materializes file system state

2. **EventLog**: Ordered sequence of events
   - Currently events are stored individually
   - No explicit ordering or replay mechanism

3. **FileMetadata**: Name, size, timestamp (if needed)
   - Currently only data hash is stored
   - No way to list files by name

4. **EventType**: CREATE_FILE, DELETE_FILE
   - Currently implicit (all events are CREATE_FILE)

---

## 2. Cryptography Implementation

### Location: `src/crypto/`

**Hash** (`src/crypto/hash.ts`)
- SHA-256 via Web Crypto API
- ✅ Correctly implemented

**Symmetric** (`src/crypto/symmetric.ts`)
- AES-256-GCM encryption/decryption
- ✅ Correctly implemented

**Asymmetric** (`src/crypto/asymmetric.ts`)
- ECDSA P-256 key derivation from secret (PBKDF2)
- ECDSA P-256 signing/verification
- HKDF for symmetric key derivation from private key
- ✅ Deterministic key derivation from secret
- ✅ Correctly implemented

**Interface** (`src/crypto/index.ts`)
- ✅ Clean abstraction via `CryptoOperations` interface

### Key Derivation Flow

```
Secret (string) 
  → PBKDF2(secret, PRIVATE_KEY_SALT, 100k iterations)
  → Private key scalar (mod curve order)
  → ECDSA P-256 key pair
  → Public key (65 bytes: 0x04 + x + y)
```

**Verification**: ✅ Changing one character in secret fully changes the key pair (PBKDF2 is deterministic but sensitive to input changes).

---

## 3. Storage Abstraction

### Location: `src/storage/`

**StorageBackend Interface** (`src/types/storage.ts`)
- ✅ Clean interface: `writeFile`, `readFile`, `listFiles`, `createDirectory`, `exists`
- ✅ No backend-specific logic in domain layer

**FilesystemBackend** (`src/storage/filesystem.ts`)
- ✅ Implements `StorageBackend`
- ✅ Atomic writes (temp file + rename)
- ⚠️ **Issue**: No explicit handling of concurrent writes
- ⚠️ **Issue**: No crash recovery documentation

**ChannelStorage** (`src/storage/channel.ts`)
- Wraps `StorageBackend` with channel-specific operations
- ✅ Stores events in `channels/[public-key-hex]/[event-hash].bin`
- ✅ Stores encrypted data in `blocks/[data-hash].bin`
- ✅ Deduplication support (`hasEncryptedData`, `storeEncryptedData` with `skipIfExists`)

### Storage Structure

```
data/
├── channels/
│   └── [public-key-hex]/
│       └── [event-hash].bin    # Signed events (JSON serialized)
└── blocks/
    └── [data-hash].bin         # Encrypted data blocks
```

**Verification**: ✅ Storage backend is abstracted; could swap implementations.

**Issue**: Events are stored as individual files, not as an ordered log. No explicit event ordering mechanism.

---

## 4. CLI Logic

### Location: `src/cli/`

**Commands**:
- `setup`: Initialize channel (derives keys, creates directory)
- `store`: Store data (encrypts, creates event)
- `store-unique`: Store with deduplication
- `list`: List event hashes (not file names)
- `retrieve`: Retrieve data by event hash (not file name)

**Issues**:
1. ❌ No `volume open <secret>` command
2. ❌ No `file add <path>` command (current `store` doesn't preserve file names)
3. ❌ No `file remove <name>` command
4. ❌ No `file list` command (current `list` shows event hashes, not files)
5. ❌ No `file get <name>` command (current `retrieve` requires event hash)

**Current Flow**:
```
CLI → Domain Operations → ChannelStorage → StorageBackend
```

**Missing**: Volume materialization layer that:
- Opens volume from secret
- Replays event log
- Exposes file system view

---

## 5. Implicit Assumptions & Missing Invariants

### Assumptions (Not Enforced)

1. **Event Ordering**
   - Events are stored individually, no explicit ordering
   - **Assumption**: File system listing order is sufficient
   - **Issue**: File system order is not guaranteed to be deterministic across systems

2. **File Naming**
   - Events don't contain file names
   - **Assumption**: Users track event hashes manually
   - **Issue**: No way to retrieve file by name

3. **Deletion**
   - No DELETE_FILE event type
   - **Assumption**: Files are never deleted (append-only)
   - **Issue**: MVP requirements specify DELETE_FILE

4. **Volume Materialization**
   - No function to replay events and materialize file list
   - **Assumption**: Users manually track which event hash corresponds to which file
   - **Issue**: MVP requires reactive file appearance/disappearance

5. **Concurrent Writes**
   - No locking or conflict resolution
   - **Assumption**: Single writer or external coordination
   - **Issue**: Two terminals operating on same volume could corrupt state

6. **Event Log Completeness**
   - No verification that all events are present
   - **Assumption**: File system is authoritative
   - **Issue**: Partial sync scenarios not handled

### Missing Invariants

1. **Event Log Integrity**
   - Should verify all events are signed by same public key
   - Should verify event log is complete (no gaps)

2. **File System Consistency**
   - Should verify all referenced data blocks exist
   - Should verify no orphaned data blocks

3. **Deterministic Replay**
   - Should be able to reconstruct file system from event log + secret
   - Currently no replay function exists

---

## 6. Data Flow Analysis

### Current Flow: Store Data

```
1. CLI: readFile(path) → Uint8Array
2. Domain: storeData(data, secret, crypto, channelStorage)
   a. deriveKeys(secret) → KeyPair
   b. generateSymmetricKey() → SymmetricKey
   c. encryptSym(data, symmetricKey) → EncryptedData
   d. computeHash(encryptedData) → dataHash
   e. storeEncryptedData(dataHash, encryptedData)
   f. deriveSymKey(privateKey) → keyEncryptionKey
   g. encryptSym(symmetricKey, keyEncryptionKey) → encryptedKey
   h. create EventPayload { hash: dataHash, encryptedKey }
   i. serializeEventPayload(payload) → payloadBytes
   j. computeHash(payloadBytes) → eventHash
   k. signPR(payloadBytes, privateKey) → signature
   l. storeEvent(publicKey, { payload, signature })
3. Storage: writeFile(channels/[pubkey]/[eventHash].bin, serializedEvent)
4. Storage: writeFile(blocks/[dataHash].bin, encryptedData)
```

**✅ Flow is correct and complete**

### Current Flow: Retrieve Data

```
1. CLI: retrieveData(eventHash, secret, crypto, channelStorage)
2. Domain: retrieveData
   a. deriveKeys(secret) → KeyPair
   b. retrieveEvent(publicKey, eventHash) → SignedEvent
   c. serializeEventPayload(payload) → payloadBytes
   d. verifyPU(payloadBytes, signature, publicKey) → boolean
   e. deriveSymKey(privateKey) → keyEncryptionKey
   f. decryptSym(encryptedKey, keyEncryptionKey) → symmetricKey
   g. retrieveEncryptedData(dataHash) → EncryptedData
   h. decryptSym(encryptedData, symmetricKey) → plaintext
3. CLI: writeFile(outputPath, plaintext)
```

**✅ Flow is correct and complete**

### Missing Flow: Volume Materialization

```
1. User provides secret
2. Derive keys from secret → KeyPair
3. Load all events from channel directory
4. Replay events in order:
   - CREATE_FILE(name, dataHash) → add file to map
   - DELETE_FILE(name) → remove file from map
5. Materialize file list: Map<name, { dataHash, eventHash }>
```

**❌ This flow does not exist**

---

## 7. Information Leakage Analysis

### Current Leakage

1. **Event Log Structure**
   - Event hashes are visible (content-addressed)
   - Event count is visible
   - Event timestamps (if filesystem provides them) are visible
   - **Acceptable for MVP**: Event log is append-only, no plaintext data leaked

2. **Data Block Structure**
   - Data hashes are visible (content-addressed)
   - Data block sizes are visible
   - **Acceptable for MVP**: Encrypted data blocks reveal size only

3. **Channel Structure**
   - Public keys are visible (derived from secret deterministically)
   - Channel directory structure is visible
   - **Acceptable for MVP**: Public keys don't reveal secret

### Missing Documentation

- No explicit documentation of what information leaks
- No justification for why leakage is acceptable

---

## 8. Test Coverage

### Existing Tests (`src/test/`)

**Integration Tests** (`src/test/integration/workflow.test.ts`)
- ✅ Full workflow: setup → store → retrieve
- ✅ Multiple events
- ✅ Deduplication
- ✅ Directory structure verification

**Unit Tests** (`src/test/unit/crypto.test.ts`)
- ✅ Cryptographic operations

### Missing Tests

1. ❌ Deterministic replay from event log
2. ❌ Cross-process consistency (two terminals, same volume)
3. ❌ Deletion semantics (DELETE_FILE events)
4. ❌ Crash recovery (partial writes)
5. ❌ Concurrent write handling

---

## 9. Summary of Gaps

### Critical Gaps (Must Fix)

1. **No explicit Volume abstraction**
   - Current "Channel" concept is close but not formalized
   - Need `Volume` type that materializes from secret

2. **No file naming in events**
   - Events only contain data hash, no file name
   - Cannot retrieve file by name

3. **No DELETE_FILE event type**
   - MVP requires file deletion
   - Currently append-only

4. **No event log replay**
   - Cannot materialize file system from event log
   - No deterministic reconstruction

5. **No volume materialization**
   - Cannot "open" volume from secret and see files
   - No reactive file appearance/disappearance

### Important Gaps (Should Fix)

1. **No explicit event ordering**
   - Relies on filesystem order (not deterministic)

2. **No concurrent write handling**
   - Two terminals could corrupt state

3. **No crash recovery documentation**
   - Atomic writes exist but behavior not documented

### Nice-to-Have (Can Defer)

1. Event log integrity verification
2. Orphaned block detection
3. Partial sync handling

---

## 10. Next Steps

### Phase 1: Formalize Domain Model
- Define `Volume`, `EventLog`, `FileMetadata` types
- Add `EventType` enum (CREATE_FILE, DELETE_FILE)
- Refactor `Channel` → `Volume` (or make `Channel` a `Volume`)

### Phase 2: Storage Backend Abstraction
- ✅ Already abstracted (good)
- Document concurrent write behavior
- Document crash recovery

### Phase 3: Volume Derivation from Secret
- Implement `openVolume(secret)` function
- Implement event log replay
- Materialize file list

### Phase 4: CLI Commands
- `nearbytes volume open <secret>`
- `nearbytes file add <path>`
- `nearbytes file remove <name>`
- `nearbytes file list`
- `nearbytes file get <name>`

### Phase 5: UI-Ready Backend
- Extract CLI-agnostic API layer
- Prepare for Electron IPC

### Phase 6: Testing
- Deterministic replay tests
- Cross-process consistency tests
- Deletion semantics tests

---

## 11. Verification Checklist

- ✅ Can explain data flow from CLI → crypto → storage → retrieval
- ✅ Cryptography is correctly implemented
- ✅ Storage is abstracted
- ⚠️ Domain model needs formalization
- ⚠️ Event semantics need explicit definition
- ❌ Volume materialization does not exist
- ❌ File naming/metadata missing
- ❌ DELETE_FILE event type missing

**Status**: Ready to proceed to Phase 1, but significant gaps identified.
