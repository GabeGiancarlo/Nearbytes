# Phase 3 Summary: Volume Derivation from Secret

## Overview

Phase 3 implements the core volume materialization functionality, making the "address" (secret) real and functional. A volume can now be opened from just a secret, and the file system can be materialized by replaying the event log.

## Step 3.1: Deterministic Key Derivation

### Verification

✅ **Deterministic**: Same secret always produces same keys
- Verified: PBKDF2 is deterministic
- Test: Same secret → same key pair → same public key → same storage path

✅ **Sensitive**: One character change fully changes the volume
- Verified: PBKDF2 has avalanche effect
- Test: Changing one character in secret → completely different keys

✅ **No Randomness**: After secret input, all derivation is deterministic
- Verified: All operations use deterministic algorithms
- PBKDF2 (deterministic)
- ECDSA key derivation (deterministic)
- Storage path derivation (deterministic)

### Documentation

Created `docs/KEY_DERIVATION.md` documenting:
- Derivation process (step-by-step)
- Deterministic properties
- Security properties
- Browser compatibility

### Key Derivation Flow

```
Secret (string)
  → PBKDF2(secret, salt, 100k iterations) → Private key seed
  → Reduce modulo curve order → Private key scalar
  → ECDSA P-256 key pair → Public key
  → Hex encode public key → Storage path: channels/[hex]
```

## Step 3.2: Volume Materialization

### Implementation

Created `src/domain/volume.ts` with the following functions:

1. **`openVolume(secret, crypto, storage, pathMapper)`**
   - Opens a volume from a secret
   - Derives keys deterministically
   - Creates storage directory if needed
   - Returns Volume object

2. **`loadEventLog(volume, channelStorage)`**
   - Loads all events from storage
   - Returns events sorted by event hash (deterministic ordering)

3. **`verifyEventLog(entries, volume, crypto)`**
   - Verifies all event signatures
   - Ensures all events are signed by volume's public key
   - Throws error if any signature is invalid

4. **`replayEvents(entries)`**
   - Pure function: deterministic replay
   - Processes CREATE_FILE and DELETE_FILE events
   - Builds final file system state (Map<fileName, FileMetadata>)

5. **`materializeVolume(volume, channelStorage, crypto)`**
   - Main function: loads, verifies, and replays events
   - Returns materialized file system state

6. **`getFile(fileSystemState, fileName)`**
   - Gets a file by name from materialized state

7. **`listFiles(fileSystemState)`**
   - Lists all files in materialized state (sorted by name)

### Properties

✅ **Pure and Deterministic**
- Same event log → same file system state
- No side effects (except loading from storage)
- Can run in browser (uses Web Crypto API only)

✅ **Replay Correctness**
- Entire file system can be reconstructed from:
  1. Secret (to derive keys and verify signatures)
  2. Event log (all events in channel directory)
  3. Encrypted data blocks (referenced by content address)

✅ **Event Ordering**
- Events sorted by event hash (deterministic)
- Same events always produce same order
- Works across different filesystems

### Self-Check Answers

**Q: Does changing one character in the secret fully change the volume?**
A: ✅ Yes. PBKDF2 has avalanche effect. One character change → completely different keys → different storage path.

**Q: Can this function run in a browser later?**
A: ✅ Yes. All operations use Web Crypto API:
- Key derivation: `crypto.subtle.deriveBits()` (PBKDF2)
- Signing/verification: `crypto.subtle.sign()` / `verify()` (ECDSA)
- Hashing: `crypto.subtle.digest()` (SHA-256)
- No Node.js-specific APIs used

**Q: Can the entire file system be reconstructed from only the event log and secret?**
A: ✅ Yes. The `materializeVolume()` function:
1. Loads all events from storage (using secret-derived public key)
2. Verifies all event signatures (using secret-derived keys)
3. Replays events in deterministic order
4. Materializes file system state

The file system state includes:
- File names
- Content addresses (hashes of encrypted data)
- Event hashes (for retrieving events)

To get actual file content, you still need:
- The encrypted data blocks (content-addressed storage)
- But the file list and metadata are fully reconstructible

## Code Changes

### New Files
- `src/domain/volume.ts` - Volume materialization functions
- `docs/KEY_DERIVATION.md` - Key derivation documentation

### Updated Files
- None (volume operations are new, don't break existing code)

## Testing Status

⚠️ **Not Yet Tested**: Volume materialization functions need tests
- Should test: deterministic replay
- Should test: event verification
- Should test: CREATE_FILE and DELETE_FILE replay
- Should test: file system state correctness

**Note**: Tests will be added in Phase 6.

## Next Steps

Phase 4 will:
1. Update CLI commands to use volume operations
2. Add `nearbytes volume open <secret>`
3. Add `nearbytes file add <path>`
4. Add `nearbytes file remove <name>`
5. Add `nearbytes file list`
6. Add `nearbytes file get <name>`

## Summary

✅ **Deterministic Key Derivation**: Verified and documented
✅ **Volume Materialization**: Implemented and ready
✅ **Event Log Replay**: Pure, deterministic function
✅ **Browser Compatibility**: All operations use Web Crypto API

**Status**: Phase 3 complete. Ready for Phase 4 (CLI commands).
