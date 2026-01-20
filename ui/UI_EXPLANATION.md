# NearBytes UI - Explanation & Demo Guide

## What is NearBytes?

NearBytes is a **content-addressed, encrypted file sharing system** that uses:
- **Encrypted storage**: Files are encrypted before storage
- **Content addressing**: Files are identified by their hash (SHA-256)
- **Append-only event log**: All changes are recorded as signed events
- **Deterministic volumes**: A secret (password) deterministically creates a volume

## UI Overview

The NearBytes UI is a **single-screen, minimalist file browser** that lets you:
1. **Open a volume** by entering a secret/address
2. **View files** that automatically appear
3. **Add files** by dragging and dropping
4. **Delete files** with a button or keyboard

### Key Design Principles

- **Reactive**: Files appear/disappear automatically as you type
- **No buttons**: Everything happens automatically or via drag-and-drop
- **Minimal**: No folders, no previews, no metadata editing
- **Secure**: All operations use your secret to derive encryption keys

## How It Works

### 1. Volume System

A **volume** is a collection of files identified by a secret. The secret:
- Derives encryption keys (deterministically)
- Creates a unique storage namespace
- Materializes files by replaying an event log

**Important**: The same secret always opens the same volume. If you lose the secret, you lose access to the volume.

### 2. Address Input

The top input field accepts:
- **Primary secret**: The main volume identifier (required)
- **Additional secret**: Optional second secret (masked, password-style)

If both are provided, they're combined as `primary:additional`.

### 3. Reactive File Loading

When you type in the address field:
- Files **automatically load** (no button needed)
- The file list **updates in real-time**
- Empty input → blank file area
- Valid secret → files appear immediately

### 4. File Operations

**Adding Files**:
- Drag and drop files into the file area
- Files are encrypted and stored
- Content-addressed (duplicate files share storage)
- Event log records `create_file` events

**Deleting Files**:
- Click the × button on any file
- Or press `Delete` key when file is focused
- Event log records `delete_file` events
- Files are removed from the volume (but encrypted data may remain)

### 5. Event Log (Developer Mode)

In development mode, you can view the event log:
- Shows all `create_file` and `delete_file` events
- Displays event hashes and content addresses
- Useful for debugging and understanding the system

## Architecture

```
┌─────────────────────────────────────────┐
│         Browser (Svelte UI)             │
│  http://localhost:5173                 │
│  - Address input                        │
│  - File grid                            │
│  - Drag & drop                          │
└──────────────┬──────────────────────────┘
               │ HTTP (fetch API)
               │ /api/volume/open
               │ /api/files/add
               │ /api/files/remove
               ▼
┌─────────────────────────────────────────┐
│      Express Server (Backend)           │
│  http://localhost:4321                  │
│  - NearBytesAPI                         │
│  - Crypto operations                    │
│  - Storage backend                      │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      Filesystem Storage                 │
│  ./data/                                 │
│  - Encrypted files                      │
│  - Event logs                           │
└─────────────────────────────────────────┘
```

## Setting Up a Demo

### Prerequisites

1. **Node.js 18+** installed
2. **Backend built**: The main project must be compiled
3. **Ports available**: 4321 (backend) and 5173 (UI dev server)

### Step-by-Step Setup

#### 1. Build the Backend

```bash
# From project root
cd /Users/gabegiancarlo/Desktop/Projects/Nearbytes
npm install
npm run build
```

#### 2. Start the Backend Server

```bash
# From project root
PORT=4321 npm run server
```

You should see:
```
NearBytes UI server running at http://localhost:4321
Open http://localhost:4321 in your browser
```

#### 3. Start the UI Dev Server

In a **new terminal**:

```bash
# Navigate to UI directory
cd ui

# Install dependencies (if not already done)
npm install

# Start dev server
npm run dev
```

You should see:
```
VITE v6.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
```

#### 4. Open the UI

Open your browser to: **http://localhost:5173**

### Quick Test

1. **Enter a test secret**: Type any string in the address field (e.g., `demo123`)
2. **See empty volume**: You'll see "No files. Drop files here to add them."
3. **Add a file**: Drag a file from your computer into the file area
4. **File appears**: The file should appear in the grid
5. **Delete file**: Click the × button or press Delete key

## Demo Scenarios

### Scenario 1: Basic File Sharing

**Goal**: Demonstrate adding and viewing files

**Steps**:
1. Enter secret: `demo-volume-1`
2. Drag a photo/image into the file area
3. File appears in grid
4. Show that the file is encrypted and content-addressed
5. Delete the file using the × button

**Key Points**:
- Files are encrypted before storage
- Same file content = same storage (deduplication)
- Event log records all changes

### Scenario 2: Volume Persistence

**Goal**: Show that volumes persist across sessions

**Steps**:
1. Enter secret: `persistent-demo`
2. Add 2-3 files
3. Clear the address field (files disappear)
4. Re-enter the same secret: `persistent-demo`
5. Files reappear (same volume)

**Key Points**:
- Volumes are deterministic (same secret = same volume)
- Files persist in storage
- Event log is replayed to materialize files

### Scenario 3: Multiple Volumes

**Goal**: Demonstrate different volumes with different secrets

**Steps**:
1. Enter secret: `volume-a`
2. Add file: `file-a.txt`
3. Change secret to: `volume-b`
4. Add file: `file-b.txt`
5. Switch back to: `volume-a`
6. Only `file-a.txt` appears

**Key Points**:
- Each secret creates a unique volume
- Volumes are isolated
- Switching secrets instantly switches volumes

### Scenario 4: Content Addressing

**Goal**: Show deduplication (same content = same storage)

**Steps**:
1. Enter secret: `dedup-demo`
2. Create a text file: `test.txt` with content "Hello World"
3. Add it to the volume
4. Create another file: `copy.txt` with the same content "Hello World"
5. Add it to the volume
6. Show that both files share the same content address

**Key Points**:
- Files are identified by content hash
- Duplicate content = same storage
- Efficient storage for duplicate files

### Scenario 5: Event Log (Developer)

**Goal**: Show the append-only event log

**Steps**:
1. Open browser console (F12)
2. Enter secret: `event-demo`
3. Add a file
4. Expand "Event Log (Dev)" section
5. Show `create_file` event with event hash
6. Delete the file
7. Show `delete_file` event added to log

**Key Points**:
- All changes are recorded as events
- Events are signed and immutable
- Event log can be replayed to reconstruct state

## Troubleshooting

### UI Shows Blank Page

**Possible causes**:
- Backend server not running
- UI dev server not running
- Port conflicts

**Solutions**:
1. Check backend: `curl http://localhost:4321`
2. Check UI: `curl http://localhost:5173`
3. Restart both servers

### Files Don't Appear

**Possible causes**:
- Invalid secret format
- Storage directory permissions
- Backend error

**Solutions**:
1. Check browser console (F12) for errors
2. Check backend terminal for errors
3. Verify `./data` directory exists and is writable

### Drag and Drop Not Working

**Possible causes**:
- Browser security restrictions
- JavaScript errors

**Solutions**:
1. Check browser console for errors
2. Try a different browser
3. Ensure you're on `http://localhost:5173` (not file://)

### Port Already in Use

**Solutions**:
```bash
# Find process using port 4321
lsof -ti:4321

# Kill it
kill -9 $(lsof -ti:4321)

# Or use different port
PORT=8001 npm run server
```

## API Endpoints

The UI communicates with the backend via these endpoints:

- `POST /api/volume/open` - Open a volume
  - Body: `{ secret: string }`
  - Returns: `{ files: FileMetadata[], publicKeyHex: string, fileCount: number }`

- `POST /api/files/add` - Add a file
  - Body: `{ secret: string, fileName: string, data: string (base64) }`
  - Returns: `{ eventHash: string, dataHash: string }`

- `POST /api/files/remove` - Remove a file
  - Body: `{ secret: string, fileName: string }`
  - Returns: `{ eventHash: string }`

- `POST /api/files/get` - Get a file
  - Body: `{ secret: string, fileName: string }`
  - Returns: `{ fileName: string, data: string (base64), size: number }`

## Security Considerations

### For Demo Purposes

- **Local storage only**: Files stored in `./data` directory
- **No authentication**: Anyone with the secret can access the volume
- **No network encryption**: HTTP only (not HTTPS)
- **Development mode**: Event log visible

### Production Considerations

- Use HTTPS for network communication
- Add authentication/authorization
- Secure secret storage
- Hide event log in production
- Consider rate limiting

## Next Steps

After the demo, you might want to:

1. **Add file download**: Currently files can be added but not downloaded via UI
2. **Add file preview**: Show thumbnails for images
3. **Add sharing**: Generate shareable links (with separate read-only secrets)
4. **Electron app**: Package as desktop application
5. **Mobile app**: React Native or similar

## Summary

The NearBytes UI is a **minimalist, reactive file browser** that demonstrates:
- ✅ Encrypted, content-addressed file storage
- ✅ Deterministic volume creation from secrets
- ✅ Append-only event log
- ✅ Real-time file materialization
- ✅ Simple drag-and-drop interface

Perfect for demonstrating the core concepts of content-addressed storage and encrypted file sharing!
