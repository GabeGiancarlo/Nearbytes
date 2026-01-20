# NearBytes API Reference

## Overview

The NearBytes API is a framework-agnostic backend layer that can be used from:
- Electron IPC
- Web workers
- Node.js scripts
- Browser applications (with appropriate storage backend)
- Any other JavaScript/TypeScript context

## Design Principles

1. **Framework-Agnostic**: No dependencies on CLI, Electron, or any UI framework
2. **No Side Effects**: No console.log, no process.exit, no global state
3. **Structured Returns**: All methods return structured data objects
4. **Error Handling**: Throws errors (doesn't exit process)
5. **Serializable**: Return values can be serialized for IPC

## Installation

```typescript
import { NearBytesAPI } from 'nearbytes-crypto/api';
import { createCryptoOperations } from 'nearbytes-crypto/crypto';
import { FilesystemStorageBackend } from 'nearbytes-crypto/storage/filesystem';
```

## Initialization

```typescript
import { NearBytesAPI } from './api/index.js';
import { createCryptoOperations } from '../crypto/index.js';
import { FilesystemStorageBackend } from '../storage/filesystem.js';

// Initialize dependencies
const crypto = createCryptoOperations();
const storage = new FilesystemStorageBackend('./data');

// Create API instance
const api = new NearBytesAPI(crypto, storage);
```

## API Methods

### `openVolume(secret: Secret): Promise<OpenVolumeResult>`

Opens a volume from a secret and materializes the file system state.

**Parameters**:
- `secret`: Volume secret (string)

**Returns**:
```typescript
interface OpenVolumeResult {
  readonly volume: Volume;
  readonly fileSystemState: FileSystemState;
  readonly publicKeyHex: string;
  readonly fileCount: number;
}
```

**Throws**: Error if volume cannot be opened or event log verification fails

**Example**:
```typescript
const result = await api.openVolume('mychannel:password');
console.log(`Volume has ${result.fileCount} files`);
console.log(`Public key: ${result.publicKeyHex}`);
```

### `listFiles(secret: Secret): Promise<FileMetadata[]>`

Lists all files in a volume.

**Parameters**:
- `secret`: Volume secret (string)

**Returns**: Array of file metadata, sorted by name

**Throws**: Error if volume cannot be opened

**Example**:
```typescript
const files = await api.listFiles('mychannel:password');
for (const file of files) {
  console.log(`${file.name} - ${file.contentAddress}`);
}
```

### `addFile(secret: Secret, fileName: string, data: Uint8Array | ArrayBuffer): Promise<AddFileResult>`

Adds a file to a volume.

**Parameters**:
- `secret`: Volume secret (string)
- `fileName`: Name of the file
- `data`: File data (Uint8Array or ArrayBuffer)

**Returns**:
```typescript
interface AddFileResult {
  readonly fileName: string;
  readonly eventHash: Hash;
  readonly dataHash: Hash;
  readonly size: number;
}
```

**Throws**: Error if file cannot be added

**Example**:
```typescript
const fileData = new Uint8Array([...]); // Your file data
const result = await api.addFile('mychannel:password', 'photo.jpg', fileData);
console.log(`File added: ${result.fileName} (${result.size} bytes)`);
```

### `removeFile(secret: Secret, fileName: string): Promise<RemoveFileResult>`

Removes a file from a volume.

**Parameters**:
- `secret`: Volume secret (string)
- `fileName`: Name of the file to remove

**Returns**:
```typescript
interface RemoveFileResult {
  readonly fileName: string;
  readonly eventHash: Hash;
}
```

**Throws**: Error if file cannot be removed

**Example**:
```typescript
const result = await api.removeFile('mychannel:password', 'photo.jpg');
console.log(`File removed: ${result.fileName}`);
```

### `getFile(secret: Secret, fileName: string): Promise<GetFileResult>`

Retrieves a file from a volume by name.

**Parameters**:
- `secret`: Volume secret (string)
- `fileName`: Name of the file to retrieve

**Returns**:
```typescript
interface GetFileResult {
  readonly fileName: string;
  readonly data: Uint8Array;
  readonly size: number;
  readonly contentAddress: Hash;
  readonly eventHash: Hash;
}
```

**Throws**: Error if file doesn't exist or cannot be retrieved

**Example**:
```typescript
const result = await api.getFile('mychannel:password', 'photo.jpg');
// Use result.data (Uint8Array) as needed
console.log(`Retrieved ${result.fileName} (${result.size} bytes)`);
```

## Electron IPC Integration

The API can be easily integrated with Electron IPC:

**Main Process** (main.js):
```typescript
import { NearBytesAPI } from 'nearbytes-crypto/api';
import { createCryptoOperations } from 'nearbytes-crypto/crypto';
import { FilesystemStorageBackend } from 'nearbytes-crypto/storage/filesystem';

const crypto = createCryptoOperations();
const storage = new FilesystemStorageBackend('./data');
const api = new NearBytesAPI(crypto, storage);

ipcMain.handle('nearbytes:openVolume', async (event, secret) => {
  return await api.openVolume(secret);
});

ipcMain.handle('nearbytes:listFiles', async (event, secret) => {
  return await api.listFiles(secret);
});

ipcMain.handle('nearbytes:addFile', async (event, secret, fileName, data) => {
  return await api.addFile(secret, fileName, data);
});

ipcMain.handle('nearbytes:removeFile', async (event, secret, fileName) => {
  return await api.removeFile(secret, fileName);
});

ipcMain.handle('nearbytes:getFile', async (event, secret, fileName) => {
  return await api.getFile(secret, fileName);
});
```

**Renderer Process** (renderer.js):
```typescript
// Open volume
const volume = await ipcRenderer.invoke('nearbytes:openVolume', 'mychannel:password');

// List files
const files = await ipcRenderer.invoke('nearbytes:listFiles', 'mychannel:password');

// Add file
const fileData = await readFileAsArrayBuffer('photo.jpg');
const result = await ipcRenderer.invoke('nearbytes:addFile', 'mychannel:password', 'photo.jpg', fileData);

// Get file
const file = await ipcRenderer.invoke('nearbytes:getFile', 'mychannel:password', 'photo.jpg');
// file.data is Uint8Array
```

## Error Handling

All methods throw errors that can be caught and handled:

```typescript
try {
  const result = await api.addFile(secret, fileName, data);
  // Success
} catch (error) {
  if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  }
}
```

**Common Errors**:
- `Error: File name cannot be empty` - Invalid file name
- `Error: File "photo.jpg" does not exist in volume` - File not found
- `Error: Event signature verification failed` - Corrupted event log
- `StorageError: File not found` - Storage operation failed

## Browser Compatibility

The API uses Web Crypto API for all cryptographic operations, making it browser-compatible. However, you'll need a browser-compatible storage backend:

```typescript
// Example: IndexedDB storage backend (not implemented yet)
class IndexedDBStorageBackend implements StorageBackend {
  // ... implementation
}

const storage = new IndexedDBStorageBackend();
const api = new NearBytesAPI(crypto, storage);
```

## Type Safety

All types are exported and can be used for type safety:

```typescript
import type {
  OpenVolumeResult,
  AddFileResult,
  RemoveFileResult,
  GetFileResult,
} from 'nearbytes-crypto/api';
```

## Summary

✅ **Framework-Agnostic**: No CLI, Electron, or UI dependencies  
✅ **Serializable**: All return values can be serialized for IPC  
✅ **Error Handling**: Throws errors (doesn't exit)  
✅ **Type Safe**: Full TypeScript support  
✅ **Browser Compatible**: Uses Web Crypto API only
