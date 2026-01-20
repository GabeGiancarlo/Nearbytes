# NearBytes UI

Svelte 5 UI implementation based on Vincenzo Ciancia's specification.

## Features

- ✅ Centered address input (secret)
- ✅ Files appear immediately when address is entered
- ✅ Reactive: changing address updates files instantly
- ✅ Drag-and-drop to add files
- ✅ Delete files (keyboard Delete key or × button)
- ✅ Event log model (internal, dev toggle)

## Development

```bash
cd ui
npm install
npm run dev
```

Open http://localhost:5173

The UI proxies API calls to the backend server (http://localhost:4321).

## Build

```bash
npm run build
```

## Electron Integration

The API boundary is clearly separated in `App.svelte`. For Electron:
1. Replace `apiCall` function to use `ipcRenderer.invoke`
2. No other changes needed
