# Event Semantics

## Overview

NearBytes uses an append-only event log to represent changes to a volume's file system. Each event is cryptographically signed and cannot be modified after creation.

## Event Types

### CREATE_FILE

**Purpose**: Adds a file to the volume.

**Payload Structure**:
- `type`: `EventType.CREATE_FILE`
- `fileName`: The name of the file (UTF-8 string)
- `hash`: SHA-256 hash of the encrypted data block
- `encryptedKey`: Encrypted symmetric key used to decrypt the data block

**Semantics**:
- If a file with the same name already exists, the new event replaces it (last write wins)
- The file becomes available immediately after the event is stored
- The event references an encrypted data block by its content address (hash)

**Replay Behavior**:
- When replaying events, a CREATE_FILE event adds or updates the file in the materialized file system
- The file metadata includes: name, content address, and event hash

### DELETE_FILE

**Purpose**: Removes a file from the volume.

**Payload Structure**:
- `type`: `EventType.DELETE_FILE`
- `fileName`: The name of the file to delete (UTF-8 string)
- `hash`: Empty hash (all zeros) - not used for deletion
- `encryptedKey`: Empty - not used for deletion

**Semantics**:
- Removes the file from the materialized file system
- Does not delete the encrypted data block (content-addressed storage)
- If the file doesn't exist, the event is a no-op (idempotent)

**Replay Behavior**:
- When replaying events, a DELETE_FILE event removes the file from the materialized file system
- The file disappears from the file list after this event

## Event Ordering

Events are stored in an append-only log. The order of events determines the final state of the file system.

**Deterministic Replay**:
1. Load all events from storage
2. Sort events by event hash (deterministic ordering)
3. Replay events in order:
   - CREATE_FILE: Add/update file in map
   - DELETE_FILE: Remove file from map
4. Materialize final file system state

**Note**: Event hash is computed from the serialized payload, ensuring deterministic ordering across systems.

## Information Leakage

### What Leaks

1. **Event Log Structure**
   - Event hashes (content-addressed)
   - Event count
   - File names (in plaintext)
   - Event types (CREATE_FILE vs DELETE_FILE)

2. **Data Block Structure**
   - Data hashes (content-addressed)
   - Data block sizes
   - Number of unique data blocks

3. **Volume Structure**
   - Public keys (derived from secret deterministically)
   - Channel directory structure

### Why This Is Acceptable for MVP

1. **File Names in Plaintext**
   - **Justification**: File names are metadata, not content
   - **Mitigation**: Users can use opaque names if needed
   - **Future**: Could encrypt file names in a future version

2. **Event Types Visible**
   - **Justification**: Event types are necessary for replay
   - **Mitigation**: Event types don't reveal file content
   - **Future**: Could use opaque event encoding

3. **Public Keys Visible**
   - **Justification**: Public keys don't reveal secrets
   - **Mitigation**: Public keys are derived deterministically but cannot be reversed to get the secret
   - **Future**: No change needed

4. **Data Block Sizes**
   - **Justification**: Encrypted data blocks reveal size only
   - **Mitigation**: Size doesn't reveal content
   - **Future**: Could pad blocks to fixed sizes

### What Doesn't Leak

1. **File Content**: All file data is encrypted with AES-256-GCM
2. **Symmetric Keys**: Keys are encrypted with a key derived from the private key
3. **Secret**: The secret seed is never stored or transmitted
4. **Private Keys**: Private keys are never stored or transmitted

## Cryptographic Guarantees

1. **Event Integrity**: Each event is signed with ECDSA P-256
2. **Event Authenticity**: Events can only be created by someone with the secret (private key)
3. **Data Confidentiality**: File data is encrypted with AES-256-GCM
4. **Key Confidentiality**: Symmetric keys are encrypted with a key derived from the private key

## Replay Correctness

The entire file system can be reconstructed from:
1. The secret (to derive keys and verify signatures)
2. The event log (all events in the channel directory)
3. The encrypted data blocks (referenced by content address)

**Verification**: Given a secret and access to storage, the volume can be fully materialized by:
1. Deriving keys from secret
2. Loading all events from channel directory
3. Verifying all event signatures
4. Replaying events in deterministic order
5. Materializing file system state

This is **deterministic** and **reproducible** across systems.
