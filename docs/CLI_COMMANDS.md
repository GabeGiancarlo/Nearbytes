# CLI Commands Documentation

## Overview

The NearBytes CLI is the canonical interface and reference implementation. All commands are designed to be:
- **Idempotent**: Can be run multiple times safely
- **Fail loudly**: Never silent failures, always exit with non-zero code on error
- **Never corrupt state**: Operations are atomic and safe

## Volume Commands

### `nearbytes volume open <secret>`

Opens a volume from a secret and displays volume information.

**Usage**:
```bash
nearbytes volume open -s <secret> [-d <data-dir>]
```

**Options**:
- `-s, --secret <secret>` (required): Volume secret
- `-d, --data-dir <path>`: Data directory path (default: `./data`)

**Behavior**:
- Derives keys from secret (deterministic)
- Creates volume directory if it doesn't exist (idempotent)
- Materializes file system state
- Displays volume information and file list

**Idempotency**: ✅ Can be run multiple times safely. Same secret always produces same volume.

**Error Handling**: Fails loudly with clear error message if:
- Secret is invalid
- Storage operations fail
- Event log verification fails

**Example**:
```bash
$ nearbytes volume open -s "mychannel:password"
✓ Volume opened successfully
Public Key: 04a5d291e182ac769ae7ccff1b5e4938ec7a97f74eae6441ebb319c928b47a8c797bbf27ff59007fc4eede22bd8f04675b5bf251fdd11aa0f76b13f48672312693
Volume Path: channels/04a5d291e182ac769ae7ccff1b5e4938ec7a97f74eae6441ebb319c928b47a8c797bbf27ff59007fc4eede22bd8f04675b5bf251fdd11aa0f76b13f48672312693
Files: 2

Files in volume:
  - photo.jpg (070beaa33b59f5a9...)
  - document.pdf (0196c7d6ed552f0c...)
```

## File Commands

### `nearbytes file add <path>`

Adds a file to a volume.

**Usage**:
```bash
nearbytes file add -p <path> -s <secret> [-n <name>] [-d <data-dir>]
```

**Options**:
- `-p, --path <path>` (required): Path to file to add
- `-s, --secret <secret>` (required): Volume secret
- `-n, --name <name>`: File name in volume (defaults to basename of path)
- `-d, --data-dir <path>`: Data directory path (default: `./data`)

**Behavior**:
- Validates file path exists and is readable
- Opens volume (creates if needed)
- Encrypts file data
- Creates CREATE_FILE event
- Stores encrypted data block

**Idempotency**: ⚠️ Not fully idempotent. Adding the same file multiple times creates multiple events (last write wins when materializing).

**Error Handling**: Fails loudly if:
- File path doesn't exist
- File cannot be read
- Secret is invalid
- Storage operations fail

**Example**:
```bash
$ nearbytes file add -p ./photo.jpg -s "mychannel:password"
✓ File added successfully
File Name: photo.jpg
Event Hash: 070beaa33b59f5a9db354b58891622b911f0ff7f5f95e5e9ae1e86fb2dd440dc
Data Hash: 0196c7d6ed552f0ccd19b41fbae8545f417f2e393ca1506a226132b7bb82d044
Size: 245760 bytes
```

### `nearbytes file remove <name>`

Removes a file from a volume.

**Usage**:
```bash
nearbytes file remove -n <name> -s <secret> [-f] [-d <data-dir>]
```

**Options**:
- `-n, --name <name>` (required): File name to remove
- `-s, --secret <secret>` (required): Volume secret
- `-f, --force`: Force removal (no error if file doesn't exist)
- `-d, --data-dir <path>`: Data directory path (default: `./data`)

**Behavior**:
- Opens volume
- Materializes file system state
- Checks if file exists
- Creates DELETE_FILE event
- Encrypted data block remains in storage (content-addressed)

**Idempotency**: ✅ Fully idempotent. Removing a non-existent file is a no-op (creates DELETE_FILE event anyway, which is idempotent when replaying).

**Error Handling**: Fails loudly if:
- File name is empty
- Secret is invalid
- Storage operations fail
- File doesn't exist (unless `--force` is used)

**Example**:
```bash
$ nearbytes file remove -n photo.jpg -s "mychannel:password"
✓ File removed successfully
File Name: photo.jpg
Event Hash: 0196c7d6ed552f0ccd19b41fbae8545f417f2e393ca1506a226132b7bb82d044
```

### `nearbytes file list`

Lists all files in a volume.

**Usage**:
```bash
nearbytes file list -s <secret> [-f <format>] [-d <data-dir>]
```

**Aliases**: `file ls`

**Options**:
- `-s, --secret <secret>` (required): Volume secret
- `-f, --format <format>`: Output format (`table`, `json`, `plain`) (default: `table`)
- `-d, --data-dir <path>`: Data directory path (default: `./data`)

**Behavior**:
- Opens volume
- Materializes file system state
- Lists all files (sorted by name)

**Idempotency**: ✅ Fully idempotent. Read-only operation.

**Error Handling**: Fails loudly if:
- Secret is invalid
- Storage operations fail
- Event log verification fails

**Example**:
```bash
$ nearbytes file list -s "mychannel:password"
✓ Found 2 file(s) in volume:

File Name                               Content Address                                                    Event Hash
------------------------------------------------------------------------------------------------------------------------
document.pdf                            0196c7d6ed552f0ccd19b41fbae8545f417f2e393ca1506a226132b7bb82d044  070beaa33b59f5a9...
photo.jpg                                070beaa33b59f5a9db354b58891622b911f0ff7f5f95e5e9ae1e86fb2dd440dc  0196c7d6ed552f0c...
```

### `nearbytes file get <name>`

Retrieves a file from a volume by name.

**Usage**:
```bash
nearbytes file get -n <name> -s <secret> -o <output> [-d <data-dir>]
```

**Options**:
- `-n, --name <name>` (required): File name to retrieve
- `-s, --secret <secret>` (required): Volume secret
- `-o, --output <path>` (required): Output file path
- `-d, --data-dir <path>`: Data directory path (default: `./data`)

**Behavior**:
- Opens volume
- Materializes file system state
- Gets file metadata by name
- Retrieves and decrypts file data
- Writes to output file

**Idempotency**: ✅ Fully idempotent. Read-only operation (overwrites output file if it exists).

**Error Handling**: Fails loudly if:
- File name is empty
- Secret is invalid
- File doesn't exist in volume
- Output path cannot be written
- Storage operations fail
- Decryption fails

**Example**:
```bash
$ nearbytes file get -n photo.jpg -s "mychannel:password" -o ./retrieved-photo.jpg
✓ File retrieved successfully
File Name: photo.jpg
Output Path: ./retrieved-photo.jpg
Size: 245760 bytes
Content Address: 070beaa33b59f5a9db354b58891622b911f0ff7f5f95e5e9ae1e86fb2dd440dc
Event Hash: 0196c7d6ed552f0ccd19b41fbae8545f417f2e393ca1506a226132b7bb82d044
```

## Legacy Commands

These commands are maintained for backward compatibility but are superseded by the new volume/file commands:

- `nearbytes setup` - Superseded by `volume open` (which creates volume if needed)
- `nearbytes store` - Superseded by `file add`
- `nearbytes retrieve` - Superseded by `file get`
- `nearbytes list` - Superseded by `file list`

## Error Handling

All commands follow these principles:

1. **Fail Loudly**: Never silent failures
   - All errors are printed to stderr
   - Process exits with non-zero code (1)
   - Error messages are clear and actionable

2. **No Silent Failures**: Every error is reported
   - Validation errors show what was wrong
   - Storage errors show what operation failed
   - Cryptographic errors show what verification failed

3. **Clear Error Messages**: Errors are user-friendly
   - Validation errors: "Invalid secret: Secret must be at least 8 characters long"
   - Storage errors: "Storage Error: File not found: blocks/abc123.bin"
   - Generic errors: "Error: File 'photo.jpg' does not exist in volume"

4. **Stack Traces**: Shown in development mode
   - Stack traces are shown for unexpected errors
   - Hidden in production mode (NODE_ENV=production)
   - Helps with debugging

## Idempotency

Most commands are idempotent:

✅ **Fully Idempotent**:
- `volume open` - Can be run multiple times, same result
- `file remove` - Removing non-existent file is no-op
- `file list` - Read-only, always safe
- `file get` - Read-only, always safe

⚠️ **Partially Idempotent**:
- `file add` - Adding same file creates new event (last write wins)

## State Safety

All commands are designed to never corrupt state:

1. **Atomic Operations**: Writes use temp files + rename (atomic)
2. **Event Log**: Append-only, never modified
3. **Content-Addressed Storage**: Data blocks are never overwritten
4. **Signature Verification**: All events are verified before replay

## Two Terminals Operating on Same Volume

**Current Behavior**: No locking mechanism exists.

**What Happens**:
- Two terminals can write to the same volume concurrently
- Last write wins (race condition)
- One process's write may be lost

**Recommendation**: Use single-writer scenarios for MVP. File locking can be added in a future version.

**Safe Operations**:
- Multiple readers (list, get) are always safe
- Multiple writers may conflict (documented limitation)

## Summary

✅ **All Required Commands Implemented**:
- `nearbytes volume open <secret>` ✅
- `nearbytes file add <path>` ✅
- `nearbytes file remove <name>` ✅
- `nearbytes file list` ✅
- `nearbytes file get <name>` ✅

✅ **All Commands Are**:
- Idempotent (or documented as not)
- Fail loudly (never silent)
- Never corrupt state (atomic operations)
- Have clear error messages

✅ **CLI UX**:
- No silent failures
- Explicit error messages
- Clear success indicators
- Helpful output formatting
