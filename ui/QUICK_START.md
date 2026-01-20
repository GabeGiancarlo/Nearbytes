# NearBytes UI - Quick Start

## Prerequisites

1. Backend server must be running on port 4321
2. Node.js 18+ installed

## Setup

```bash
# Navigate to UI directory
cd ui

# Install dependencies
npm install

# Start development server
npm run dev
```

The UI will be available at: **http://localhost:5173**

## Usage

1. **Enter Address**: Paste your volume secret in the top input field
2. **Files Appear**: Files will automatically appear below (reactive)
3. **Add Files**: Drag and drop files into the file area
4. **Delete Files**: Click the × button or press Delete key when file is focused

## Features

- ✅ Reactive file list (updates automatically)
- ✅ Drag-and-drop file upload
- ✅ Keyboard delete (Delete key)
- ✅ Optional second secret input (masked)
- ✅ Event log (dev mode only)

## API Integration

The UI connects to the Express server running on port 4321:
- `/api/volume/open` - Open volume
- `/api/files/list` - List files
- `/api/files/add` - Add file
- `/api/files/remove` - Remove file

## Electron Integration (Future)

The `apiCall` function in `App.svelte` can be replaced with Electron IPC:

```typescript
// Replace fetch with:
const response = await ipcRenderer.invoke('nearbytes:api', endpoint, data);
```
