# Nearbytes UI

Branded Svelte 5 UI for Nearbytes Phase 2 API. Features a dark vault theme, offline support with IndexedDB caching, and PWA capabilities.

## Features

- ✅ Beautiful dark theme with branded design
- ✅ Secret input that materializes files instantly
- ✅ Drag-and-drop file upload (multipart/form-data)
- ✅ File download and delete
- ✅ Offline support with IndexedDB caching
- ✅ PWA with service worker for app shell caching
- ✅ Optimistic UI: shows cached data immediately while refreshing

## Prerequisites

- Node.js 18+ and npm
- Backend server running (see root README.md)

## Development Setup

### 1. Install Dependencies

```bash
cd ui
npm install
```

### 2. Start Backend Server

From the repository root:

```bash
npm run build
npm run server
```

The backend runs on `http://localhost:3000` by default.

### 3. Start UI Development Server

```bash
cd ui
npm run dev
```

The UI runs on `http://localhost:5173` and proxies API calls to the backend.

## Proxy Configuration

The Vite dev server proxies the following routes to `http://localhost:3000`:

- `/open` → `POST /open`
- `/files` → `GET /files`
- `/upload` → `POST /upload`
- `/file/:hash` → `GET /file/:hash`
- `/health` → `GET /health`

No `/api` prefix is used - routes match the backend directly.

## Environment Variables

The UI uses the Vite proxy by default. To change the backend URL, modify `vite.config.js`.

## Build for Production

```bash
npm run build
```

Outputs to `dist/` directory. The build includes:
- Service worker for PWA functionality
- Optimized assets
- IndexedDB caching support

## PWA & Offline Behavior

The UI is configured as a Progressive Web App:

- **App Shell Caching**: HTML, CSS, and JS are cached by the service worker
- **API Caching**: File listings are cached with NetworkFirst strategy
- **IndexedDB**: File metadata is stored per volumeId for instant offline access

### Offline Usage

1. Load a volume while online (files are cached)
2. Go offline or stop the backend
3. UI shows cached file listing with "Offline (cached)" indicator
4. Downloads/uploads require backend connectivity

## Architecture

See [docs/ui.md](../docs/ui.md) for detailed architecture documentation.

## API Client

The UI uses a typed API client (`src/lib/api.ts`) that handles:

- Authentication (Bearer token or secret header)
- Error parsing from backend
- Multipart file uploads
- File downloads as Blob

## Caching

File listings are cached in IndexedDB per volumeId:

- Cache key: `volumeId`
- Cache value: `{ files[], cachedAt }`
- Cache age: 24 hours (stale but still shown offline)

See `src/lib/cache.ts` for implementation details.

## Verification

See [VERIFY.md](./VERIFY.md) for manual acceptance test steps.
