# Electron Desktop MVP — Plan & Implementation Blueprint

**Target repo:** [GabeGiancarlo/Nearbytes](https://github.com/GabeGiancarlo/Nearbytes)  
**Purpose:** Clear, testable path to an Electron desktop MVP integrated with the existing web/server stack.

---

## 1) Executive Summary (2–6 bullets)

- **What Electron is:** Electron is a framework for building desktop apps with web technologies. It runs a Chromium renderer (your UI) and a Node.js main process (system access, no DOM). The two communicate via IPC; the renderer is sandboxed by default.
- **Integration approach:** **A) Electron loads the existing web UI (local dev server or bundled static build) and runs the API/server as a local Node process inside Electron.** The Express server is spawned as a `child_process`; storage is set to Electron’s `userData` (or optional MEGA path); in production the same server also serves the built Svelte app so the window loads one origin and CORS is avoided.
- **MVP scope by end of phase:** (1) One desktop app that launches the existing Nearbytes API server (storage in `userData` or configurable path), (2) opens a window showing the existing Svelte UI talking to that server, (3) dev workflow with hot reload, (4) packaged build (macOS first) with installable app, (5) a minimal E2E test runnable by professor/TA.

---

## 2) Repo + Whitepaper Findings

### Key repo facts (Nearbytes GitHub)

| Item | Value |
|------|--------|
| **Tech stack** | Root: TypeScript (ESM), Node 18+, npm. UI: Svelte 5, Vite 6. Backend: Express, multer, cors, zod. |
| **Entry points** | `dist/index.js` (lib), `dist/cli/index.js` (CLI), `dist/server/index.js` (API server). UI: `ui/` with `npm run dev` (Vite). |
| **Start commands** | `npm run dev` = concurrently `dev:server` + `dev:ui`. `npm run server` = `node dist/server/index.js`. `npm run mega` = `scripts/run-mega-dev.sh` (sets MEGA storage then `npm run dev`). |
| **Ports** | Server: **3000** (configurable via `PORT`). UI dev: **5173** (Vite). |
| **Env vars** | `PORT` (default 3000), `NEARBYTES_STORAGE_DIR` (default `./nearbytes-storage`), `NEARBYTES_SERVER_TOKEN_KEY` (optional, 32-byte hex/base64), `NEARBYTES_CORS_ORIGIN` (default `http://localhost:5173`), `NEARBYTES_MAX_UPLOAD_MB` (default 50). |
| **Where UI lives** | `ui/` — Svelte 5 app; `ui/src/lib/api.ts` uses `API_BASE = ''` (Vite proxy to 3000). |
| **Where API/server lives** | `src/server/index.ts` → `dist/server/index.js`; reads env, creates Express app via `createApp()`, listens on `PORT`. |
| **Where storage is handled** | `src/storage/filesystem.ts`; root path comes from `NEARBYTES_STORAGE_DIR` in `src/server/index.ts` (resolved with `path.resolve()`). Layout: `storageDir/channels/<hex>/`, `storageDir/blocks/`. |
| **Desktop/Electron docs** | None in repo; no existing Electron or desktop deployment docs. |

### Whitepaper (from `nearbytes-personal-prep/notes.md`)

- **Storage model:** “Storage first, transmission agnostic.” Basic backend = folders + files; no dependency on a specific transport (P2P, Telegram, USB, or local disk).
- **Security model:** Secret-derived keys (e.g. `channel:password`); keys never stored; asymmetric for channel ID and signatures; symmetric for data. Friend-to-friend: encrypted data can be held by others without them having decryption keys.
- **Relevance for desktop:** (1) Desktop app is another “storage backend” host (local disk or MEGA sync dir). (2) Secrets stay local; renderer must never get raw secrets via IPC—only tokens or session-scoped handles if needed. (3) Threat model: protect secret and keys; desktop MVP should use OS app-data dir and optional MEGA path, not expose paths/secrets to renderer.

### Ambiguous / risky

- **No whitepaper in Nearbytes repo:** Whitepaper lives in `nearbytes-personal-prep/notes.md`. For desktop, assume: same crypto and storage semantics; secrets only in main process or server; no new threat-model doc for MVP.
- **UI API base:** `ui/src/lib/api.ts` uses `API_BASE = ''` (proxy). For Electron prod we must point the UI at the local server URL (e.g. `http://127.0.0.1:3000`) when not using the Vite proxy—either build-time env (`VITE_API_URL`) or preload-injected base URL.
- **CORS:** Default `NEARBYTES_CORS_ORIGIN` is `http://localhost:5173`. For Electron we need to allow the window origin (e.g. `file://` if we ever load from file, or the same host as the server if we serve UI from Express). Recommended: serve built UI from Express in prod so window is `http://localhost:3000` and same-origin.
- **MEGA path:** Professor flow uses `$HOME/MEGA/NearbytesStorage`. Desktop MVP can default to `userData` and document an override (env or simple config) to point at MEGA folder.

---

## 3) Electron Architecture for Nearbytes (MVP)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ELECTRON MAIN PROCESS                                                       │
│  - app.whenReady(): resolve storage dir (userData or env/config)            │
│  - spawn Node server: node dist/server/index.js                             │
│    env: NEARBYTES_STORAGE_DIR, PORT (fixed, e.g. 3000),                     │
│         NEARBYTES_CORS_ORIGIN = http://127.0.0.1:3000 (or *) for prod        │
│  - wait for server ready (poll http://127.0.0.1:PORT/health or TCP connect)  │
│  - create BrowserWindow: loadURL(dev ? http://localhost:5173 :               │
│                          http://127.0.0.1:PORT)                              │
│  - on app.quit: kill server process (SIGTERM)                                │
│  - IPC: only minimal channels (e.g. getApiBaseUrl, getStoragePath for       │
│    display-only; never send secrets over IPC)                               │
└─────────────────────────────────────────────────────────────────────────────┘
         │                                    │
         │ spawn                               │ load
         ▼                                    ▼
┌──────────────────────┐            ┌─────────────────────────────────────────┐
│  Node server process │            │  RENDERER (Chromium)                    │
│  (child_process)     │◄── HTTP ──►│  - Existing Svelte 5 UI                 │
│  node dist/server/   │            │  - api.ts: API_BASE = '' (dev proxy) or │
│  index.js            │            │    window.__NEARBYTES_API__ (injected   │
│  - Express API       │            │    by preload in prod)                  │
│  - In prod: also     │            │  - No Node, no filesystem; all data     │
│    serve static      │            │    via fetch() to localhost API         │
│    ui/dist           │            │  - Secrets only in memory / session     │
└──────────────────────┘            └─────────────────────────────────────────┘
         │
         │ reads/writes
         ▼
┌──────────────────────┐
│  FILESYSTEM           │
│  NEARBYTES_STORAGE_DIR│
│  - macOS: app.getPath('userData') + '/nearbytes-storage' (default)         │
│  - Or override via env / config for MEGA path                              │
└──────────────────────┘
```

- **Main process:** Start server subprocess with env; wait until ready; create window; on quit kill server. Expose only safe IPC (e.g. API base URL, storage path for display). No secrets in IPC.
- **Renderer:** Unchanged Svelte UI; in prod use preload-exposed `window.__NEARBYTES_API__` (or similar) for API base so requests go to the same origin when UI is served from Express.
- **Server:** Runs as child process; in prod the same Express app serves `ui/dist` (static + SPA fallback) so the window can load `http://127.0.0.1:3000` and stay same-origin.
- **Secrets:** Never sent to renderer over IPC. Server accepts secret in headers/body as today; tokens (if used) are returned by API and stored in sessionStorage in the page as today.
- **Updates / logging / crash reporting:** MVP = no auto-updates; console/log to disk optional; no crash reporting. Document as “future” in checklist.

---

## 4) Step-by-Step Implementation Plan (Ordered, No Gaps)

1. **Clone/link Nearbytes repo** (if not already): ensure `npm install`, `npm run build`, `cd ui && npm install` work.
2. **Add Electron deps (root):**  
   `npm install -D electron electron-builder concurrently wait-on`  
   (wait-on to wait for server health before opening window.)
3. **Add Electron entry (root):**  
   Create `electron/main.ts` (or `main.js`). Implement: resolve storage dir (userData + `/nearbytes-storage` or env `NEARBYTES_STORAGE_DIR`), fixed `PORT` (e.g. 3000), spawn `node dist/server/index.js` with `env: { NEARBYTES_STORAGE_DIR, PORT, NODE_ENV }`, wait for `http://127.0.0.1:PORT/health` with wait-on or simple polling, create `BrowserWindow` with `webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }`, load URL (see step 5), on `app.quit` kill server process.
4. **Add preload (root):**  
   Create `electron/preload.ts` (compile to `preload.js` or use ts-node/esbuild). Expose to renderer only what’s needed, e.g. `contextBridge.exposeInMainWorld('electronAPI', { getApiBaseUrl: () => 'http://127.0.0.1:3000' })`. No secrets, no fs.
5. **Dev vs prod URL:**  
   - Dev: main process does **not** start Vite; user runs `npm run dev:ui` in another terminal (or we add a script that runs server + Vite). Window loads `http://localhost:5173` (Vite proxy to 3000). So in dev, Electron only starts the server; load `http://localhost:5173` when `process.env.NODE_ENV !== 'production'` (or `process.defaultApp` / `electron-is-dev`).  
   - Prod: server will serve UI (step 7); window loads `http://127.0.0.1:3000`. Preload sets `getApiBaseUrl()` to `http://127.0.0.1:3000`.
6. **UI API base in renderer:**  
   In `ui/src/lib/api.ts`: use `const API_BASE = typeof window !== 'undefined' && (window as any).electronAPI?.getApiBaseUrl?.() ?? ''`. So in browser dev it stays `''` (Vite proxy); in Electron prod it uses the injected base.
7. **Server serves built UI in prod:**  
   In `src/server/app.ts` (or wherever the Express app is created), add conditional static serving: if `process.env.SERVE_UI === '1'` (or `process.env.NODE_ENV === 'production'` and path exists), use `express.static(path.join(__dirname, process.env.UI_DIST_PATH || '../../ui/dist'))` and a catch-all `*` → `index.html` for SPA. Ensure API routes are mounted before the static/catch-all. When running from Electron packaged app, main process should set `UI_DIST_PATH` to the resolved path to the built UI (e.g. inside app.asar or resources). Build step will run `npm run build` (server) and `cd ui && npm run build` (UI).
8. **Electron build config (root):**  
   In `package.json`: `"main": "electron/main.js"` (or compiled main). If main is TypeScript, add a build step that compiles `electron/main.ts` and `electron/preload.ts` (e.g. tsc or esbuild) to a folder like `electron-out/` and set `"main": "electron-out/main.js"`. Ensure `files` or `build.directories` include `dist/`, `ui/dist/`, and the electron output.
9. **Scripts (root package.json):**  
   - `"electron": "electron ."` (or `electron electron-out/` if main is compiled).  
   - `"electron:dev": "NODE_ENV=development electron ."` (or use `electron-is-dev` inside main to detect dev).  
   - `"build:electron": "npm run build && npm run build:ui && (tsc -p tsconfig.electron.json or similar)"` so server + UI + Electron main/preload are built.  
   - `"pack": "npm run build:electron && electron-builder --dir"`, `"dist": "electron-builder"` (or use forge if chosen).
10. **Storage dir config:**  
    In `electron/main.ts`: `const storageDir = process.env.NEARBYTES_STORAGE_DIR || path.join(app.getPath('userData'), 'nearbytes-storage')`. Pass to server env. Optionally create dir if missing (`fs.mkdirSync(storageDir, { recursive: true })`).
11. **Port in use:**  
    Main process should pick a fixed port (e.g. 3000) or a random free port; if 3000 is in use, either fail fast with a clear message or try next port and pass to preload. MVP: use fixed 3000 and on spawn error (or health check failure) show a dialog “Port 3000 is in use. Close other instances or set PORT.”
12. **Dev workflow (hot reload):**  
    Run `npm run dev:server` (or start server via Electron) and `npm run dev:ui` separately; Electron window loads `http://localhost:5173`. Restart Electron when main/preload change; Svelte hot reload works via Vite.
13. **Prod build workflow:**  
    `npm run build` (server), `cd ui && npm run build` (UI), build Electron main/preload, then `electron-builder` (or forge). Include in the packaged app: `dist/`, `ui/dist/`, and the Electron entry so the server subprocess can run `node dist/server/index.js` and serve `ui/dist`.
14. **Assumption:** Server and UI are built from the same repo root; paths in main (e.g. `path.join(__dirname, '../dist/server/index.js')`) are set for packaged layout (e.g. `app.asar` or unpacked `dist`). electron-builder `extraResources` or `asarUnpack` may be needed so `dist/` is available to the child process; typically `dist` is unpacked so `node dist/server/index.js` works from the app directory.

---

## 5) Code Scaffolding (Real Code)

**Assumptions:** Repo uses TypeScript and ESM. Electron main/preload are compiled to CommonJS or ESM that Electron can run (Electron supports both; use the same module system as the rest of the app or set `"type": "module"` and use .mjs / proper extensions). Below uses `.ts` with a separate compile step for Electron.

### electron/main.ts (secure defaults)

```ts
import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';

const PORT = process.env.PORT || '3000';
const isDev = process.env.NODE_ENV !== 'production';

function getStorageDir(): string {
  const env = process.env.NEARBYTES_STORAGE_DIR;
  if (env) return path.resolve(env);
  return path.join(app.getPath('userData'), 'nearbytes-storage');
}

function ensureDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.error('Failed to create storage dir:', e);
  }
}

let serverProcess: ChildProcess | null = null;

function startServer(): Promise<void> {
  const storageDir = getStorageDir();
  ensureDir(storageDir);

  const serverPath = path.join(__dirname, '../dist/server/index.js');
  return new Promise((resolve, reject) => {
    serverProcess = spawn(
      process.execPath,
      [serverPath],
      {
        env: {
          ...process.env,
          NEARBYTES_STORAGE_DIR: storageDir,
          PORT,
          NEARBYTES_CORS_ORIGIN: isDev ? 'http://localhost:5173' : `http://127.0.0.1:${PORT}`,
          SERVE_UI: isDev ? '' : '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    const onErr = (err: Error) => {
      serverProcess = null;
      reject(err);
    };
    serverProcess.on('error', onErr);
    serverProcess.stderr?.on('data', (d) => process.stderr.write(d));

    const check = () => {
      fetch(`http://127.0.0.1:${PORT}/health`)
        .then((r) => (r.ok ? resolve() : check()))
        .catch(() => setTimeout(check, 100));
    };
    setTimeout(check, 200);
  });
}

function stopServer(): void {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const url = isDev
    ? 'http://localhost:5173'
    : `http://127.0.0.1:${PORT}`;
  win.loadURL(url).catch((e) => {
    dialog.showErrorBox('Load failed', String(e));
  });
}

app.whenReady().then(() => {
  startServer()
    .then(createWindow)
    .catch((e) => {
      dialog.showErrorBox('Server failed', e.message || String(e));
      app.quit();
    });
});

app.on('window-all-closed', () => app.quit());
app.on('quit', stopServer);
```

### electron/preload.ts (IPC-safe API only)

```ts
import { contextBridge } from 'electron';

const PORT = process.env.PORT || '3000';
const apiBase = `http://127.0.0.1:${PORT}`;

contextBridge.exposeInMainWorld('electronAPI', {
  getApiBaseUrl: () => apiBase,
});
```

Preload must be built to a single file (e.g. `preload.js`) that Electron can load; ensure it doesn’t use `import` if the build output is CJS, or use a bundle step so it’s one file.

### Renderer usage (ui/src/lib/api.ts change)

```ts
// At top, replace or augment API_BASE:
function getApiBase(): string {
  if (typeof window === 'undefined') return '';
  const w = window as unknown as { electronAPI?: { getApiBaseUrl?: () => string } };
  return w.electronAPI?.getApiBaseUrl?.() ?? '';
}
const API_BASE = getApiBase();
```

Use `API_BASE` everywhere you currently use `API_BASE` (including `downloadFile`).

### Starting/stopping the server (already in main.ts above)

- **Start:** `spawn(process.execPath, [serverPath], { env: { NEARBYTES_STORAGE_DIR, PORT, ... } })`.  
- **Stdout/stderr:** `serverProcess.stderr?.on('data', (d) => process.stderr.write(d));` (and optionally stdout).  
- **Shutdown:** On `app.quit`, call `serverProcess.kill('SIGTERM')` (and optionally wait for exit with a short timeout then SIGKILL).

### Config snippet: storage directory to userData

Already in main: `getStorageDir()` returns `process.env.NEARBYTES_STORAGE_DIR ?? path.join(app.getPath('userData'), 'nearbytes-storage')`. So by default the desktop app uses OS app data (e.g. macOS `~/Library/Application Support/Nearbytes/nearbytes-storage`).

---

## 6) Functional Test Plan (MVP)

### Happy path (E2E)

1. **Launch:** Start app → window opens, UI loads (secret input visible).  
2. **Open volume:** Enter secret (e.g. `LeedsUnited`) → files list loads (or empty list).  
3. **Upload:** Drag-and-drop or select file → file appears in list.  
4. **Download:** Click download on a file → file downloads.  
5. **Delete:** Delete a file → it disappears from list.  
6. **Persistence:** Close app, reopen, open same secret → same files (storage in userData).

### Failure-mode tests

1. **Missing storage dir:** Simulate read-only userData or invalid path → app shows error or creates dir; no crash.  
2. **Wrong / empty secret:** Open volume with wrong secret → backend error shown in UI (no crash).  
3. **Port in use:** Start another process on 3000, then launch app → clear error (“Port 3000 in use” or similar) and exit or retry.  
4. **MEGA folder not mounted:** If user sets `NEARBYTES_STORAGE_DIR` to a non-existent MEGA path → server may log; UI shows empty or error; document that MEGA path must exist.

### How to run locally

- **Manual:** `npm run electron:dev` (and in another terminal `npm run dev:ui` if main loads 5173 in dev).  
- **E2E:** Use Playwright with Electron (see below).

### Automation (Playwright; Spectron is deprecated)

- **Spectron:** Deprecated; do not use.  
- **Playwright:** Use `playwright` with `_electron` to launch the app and drive the window.  
  - Install: `npm install -D @playwright/test` and ensure Playwright browsers are installed.  
  - In tests: `const { _electron: electron } = require('playwright'); const app = await electron.launch({ args: [path.join(__dirname, '../electron-out/main.js')] }); const window = await app.firstWindow();` then `window.fill('input[name=secret]', 'LeedsUnited'); window.click('button:has-text("Open")');` etc.  
- Add script: `"test:e2e": "playwright test tests/e2e"` (or similar).  
- One happy-path spec and one failure spec (e.g. port in use) is enough for MVP.

---

## 7) Security & Privacy Checklist (Desktop Specific)

- **Renderer no direct filesystem:** `nodeIntegration: false`, `sandbox: true`, no `require('fs')` in renderer; all storage via API.  
- **IPC validation:** Preload exposes only `getApiBaseUrl()` (and optionally non-sensitive display strings). No schema validation needed for MVP if payloads are fixed; if you add more channels later, validate with zod (or similar) in main.  
- **Secrets/tokens:** Secrets only in main env (for server) or in renderer memory/sessionStorage as returned by API; never expose raw secret via `contextBridge`.  
- **No remote code execution in renderer:** Do not load remote HTML/JS in the window; load only `localhost` or `127.0.0.1` (or file if you ever serve from file).  
- **Navigation:** Consider `webPreferences.webSecurity: true` and in main restrict `will-navigate` / `new-window` to same origin or block.  
- **CORS / local server:** In prod, UI and API are same origin (served from same Express). In dev, CORS is already `http://localhost:5173`.  
- **Auto-updates:** Not in MVP; state explicitly. When added, use signed updates and verify before apply.

---

## 8) Build + Distribution

- **Packager:** **electron-builder** — widely used, good macOS/Windows support, notarization and signing docs. Alternative: Electron Forge (simpler preset, less flexible). For MVP, electron-builder is enough.  
- **Target OS:** macOS first (e.g. `electron-builder --mac`), then Windows (`--win`).  
- **Signing/notarization:** macOS: sign with Developer ID; notarize with Apple (required for Gatekeeper). Windows: code signing cert for SmartScreen. Document as “required for distribution outside dev”; MVP can be unsigned for local/TA testing.  
- **Installers:** `electron-builder` produces `.dmg` (macOS) and `.exe`/MSI (Windows). Add to `package.json`: `"build": { "appId": "com.nearbytes.app", "mac": { "category": "public.app-category.utilities" }, "directories": { "output": "release" } }`. Run `npx electron-builder` or `npm run dist`.  
- **Versioning:** Keep `version` in root `package.json` in sync with app; use semver. electron-builder uses it for installer naming and app metadata.

---

## 9) Open Questions / Required Decisions

| Question | Recommendation |
|----------|----------------|
| Where to put Electron source (root vs separate package)? | **Root:** `electron/main.ts`, `electron/preload.ts` in repo root; keeps one repo and one `package.json`. |
| Dev: one command vs two? | **Two:** `npm run electron:dev` starts server + window (load 5173); user runs `npm run dev:ui` in another terminal for hot reload. Optional later: single script that spawns Vite as well. |
| MEGA path in desktop: default or optional? | **Default userData;** document env `NEARBYTES_STORAGE_DIR` (or a simple settings file later) for MEGA path. |
| TypeScript for main/preload: compile with project tsc or separate? | **Separate tsconfig** (e.g. `tsconfig.electron.json`) that emits to `electron-out/` so Electron doesn’t need to parse TS. |
| Serve UI from Express in dev too? | **No for MVP.** Only in prod (`SERVE_UI=1`) so dev keeps Vite proxy and hot reload. |

You can proceed with these defaults without blocking; adjust when you have constraints (e.g. single-command dev, MEGA-first default).

---

*Document generated for the Nearbytes Electron desktop MVP. Apply the steps in the linked [GabeGiancarlo/Nearbytes](https://github.com/GabeGiancarlo/Nearbytes) repo.*
