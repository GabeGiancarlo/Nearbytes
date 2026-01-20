# Storage Backend Documentation

## Overview

The StorageBackend interface provides a clean abstraction for file operations, allowing NearBytes to work with any storage system (local filesystem, Dropbox, Git, etc.) without knowing the implementation details.

## Interface

```typescript
interface StorageBackend {
  writeFile(path: string, data: Uint8Array): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  listFiles(directory: string): Promise<string[]>;
  createDirectory(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  deleteFile(path: string): Promise<void>;
}
```

## Filesystem Backend Implementation

### Deterministic Directory Structure

The filesystem backend uses a predictable, deterministic structure:

```
<basePath>/
├── channels/
│   └── [public-key-hex]/
│       └── [event-hash].bin    # Signed events
└── blocks/
    └── [data-hash].bin          # Encrypted data blocks
```

**Properties**:
- Paths are derived deterministically from content (hashes) or keys (public keys)
- Same content always maps to the same path
- No random or time-based components in paths

### Atomic Writes

**Implementation**: All writes use a two-phase commit pattern:

1. Write to temporary file: `<path>.tmp`
2. Atomic rename: `rename(tempPath, finalPath)`

**Why This Works**:
- On POSIX systems, `rename()` is atomic within the same filesystem
- If the process crashes between steps 1 and 2, only the temp file exists (harmless)
- If the process crashes during step 1, the temp file may be incomplete (handled by crash recovery)

**Code**:
```typescript
const tempPath = `${fullPath}.tmp`;
await fs.writeFile(tempPath, data);
await fs.rename(tempPath, fullPath);
```

### Crash Recovery Behavior

#### Scenario 1: Crash During Write

**What Happens**:
- Temp file (`<path>.tmp`) may exist with partial or complete data
- Final file may or may not exist

**Recovery**:
- On next write to the same path, the temp file is overwritten
- If temp file exists from a previous crash, it's replaced (no corruption)
- **Note**: NearBytes doesn't currently clean up orphaned temp files automatically

**Future Improvement**: Add a cleanup routine that removes temp files older than a threshold.

#### Scenario 2: Crash After Write, Before Rename

**What Happens**:
- Temp file exists with complete data
- Final file doesn't exist

**Recovery**:
- Next read will fail (file not found) - this is expected
- Next write will overwrite the temp file and complete successfully
- **Note**: The previous write is lost, but this is acceptable for NearBytes (events are idempotent)

#### Scenario 3: Crash During Rename

**What Happens**:
- Either the rename succeeds (file exists) or fails (file doesn't exist)
- No partial state possible (rename is atomic)

**Recovery**:
- If rename succeeded: file is available
- If rename failed: same as Scenario 2

### Partial Write Handling

**Current Behavior**:
- If a write is interrupted, the temp file may contain partial data
- On the next write, the temp file is overwritten completely
- No attempt is made to resume or verify partial writes

**Why This Is Acceptable**:
- NearBytes events are idempotent (can be replayed)
- If a write fails, the event can be recreated and written again
- Content-addressed storage means duplicate writes are safe

**Future Improvement**: Add checksum verification after write to detect corruption.

### Concurrent Write Handling

#### Two Terminals Operating on Same Volume

**Scenario**: Two processes write to the same file path concurrently.

**What Happens**:
1. Process A writes to `<path>.tmp` (A)
2. Process B writes to `<path>.tmp` (B) - overwrites A's temp file
3. Process A renames `<path>.tmp` → `<path>` (B's data)
4. Process B renames `<path>.tmp` → `<path>` (fails or overwrites)

**Result**:
- Last write wins (non-deterministic)
- One process's write may be lost
- **This is a race condition**

#### Mitigation Strategies

**Current State**: No locking mechanism exists.

**Options for Future**:

1. **File Locking** (recommended for MVP):
   - Use `flock()` or `fcntl()` to acquire exclusive locks
   - Lock the temp file during write
   - Release lock after rename
   - **Pros**: Simple, works on POSIX systems
   - **Cons**: Doesn't work on network filesystems (NFS, Dropbox)

2. **Optimistic Locking**:
   - Read file before write, check modification time
   - If file changed, retry
   - **Pros**: Works on network filesystems
   - **Cons**: More complex, may need multiple retries

3. **Append-Only Semantics**:
   - Never overwrite existing files
   - Use unique filenames (timestamp + random)
   - Clean up old files periodically
   - **Pros**: No conflicts, works everywhere
   - **Cons**: More complex cleanup logic

**Recommendation for MVP**: Document the limitation and recommend single-writer scenarios. Add file locking in a future version.

#### Event Log Concurrency

**Current Behavior**: Events are stored as individual files with deterministic names (event hash).

**Concurrency Implications**:
- Two processes creating the same event (same hash) will write to the same file
- Last write wins (but events are deterministic, so same event = same content)
- **This is actually safe**: If two processes create the same event, they write the same data

**Data Block Concurrency**:
- Data blocks are content-addressed (hash-based paths)
- Same data = same path = same file
- Concurrent writes of the same data are safe (idempotent)

### Safe Deletes

**Implementation**: `deleteFile()` is idempotent:
- If file doesn't exist, returns successfully (no error)
- Only deletes files, never directories
- Throws error only on actual filesystem errors (permissions, etc.)

**Code**:
```typescript
async deleteFile(path: string): Promise<void> {
  try {
    await fs.unlink(fullPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return; // Idempotent: file doesn't exist is OK
    }
    throw error;
  }
}
```

**Note**: NearBytes doesn't currently delete data blocks (content-addressed storage). Deletes only affect the event log (DELETE_FILE events remove files from the materialized view, but don't delete the encrypted data blocks).

## Backend Swapping

The StorageBackend interface allows swapping implementations without code changes:

**Example**: Switch from filesystem to Dropbox:

```typescript
// Current
const storage = new FilesystemStorageBackend('./data');

// Future: Dropbox backend
const storage = new DropboxStorageBackend({
  accessToken: '...',
  basePath: '/NearBytes'
});

// Same interface, no code changes needed
```

**Requirements for New Backends**:
1. Implement all StorageBackend methods
2. Maintain atomic write semantics (if possible)
3. Handle concurrent writes appropriately
4. Document crash recovery behavior

## Testing Considerations

When testing storage backends:

1. **Atomic Writes**: Verify temp file + rename pattern works
2. **Crash Recovery**: Simulate crashes during writes
3. **Concurrent Writes**: Test two processes writing simultaneously
4. **Idempotency**: Verify deleteFile is idempotent
5. **Path Handling**: Verify paths are handled correctly (relative, absolute, special characters)

## Summary

**Current State**:
- ✅ Atomic writes (temp file + rename)
- ✅ Deterministic directory structure
- ✅ Safe deletes (idempotent)
- ⚠️ No concurrent write protection (documented limitation)
- ⚠️ No automatic temp file cleanup

**For MVP**: Current implementation is sufficient for single-writer scenarios. Concurrent write protection can be added in a future version.
