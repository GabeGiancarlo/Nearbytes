# Diagnosis Report: Professor Kurz sees zero images with secret “LeedsUnited”; Gabe sees images

## 1. Symptom

- **Professor Kurz:** Types shared secret “LeedsUnited”, UI shows zero images.
- **Gabe:** Same secret, UI shows images.
- **Interpretation:** Storage-root / sync / path-resolution defect until proven otherwise.

## 2. Most likely root cause (ranked)

### R1 (primary): Server using repo-local storage while MEGA is elsewhere

- **Mechanism:** Professor Kurz runs the server **without** `NEARBYTES_STORAGE_DIR` set (e.g. `npm run dev` or `npm run dev:server` directly). The server then uses the default `./nearbytes-storage`, which is resolved relative to the process cwd (repo root). That directory is **empty** or has no channel/block data on Professor Kurz’s machine. Gabe either sets `NEARBYTES_STORAGE_DIR` to his MEGA sync folder or uses `npm run mega`, which sets it to `$HOME/MEGA/NearbytesStorage`.
- **Evidence:** See “Evidence” below (single source: `src/server/index.ts` line 10: `process.env.NEARBYTES_STORAGE_DIR ?? './nearbytes-storage'`; no dotenv, so env must be set in the shell or by a script).

### R2 (secondary): MEGA not synced on Professor Kurz’s machine

- **Mechanism:** Professor Kurz *does* set `NEARBYTES_STORAGE_DIR` to his MEGA path, but the MEGA desktop app has not finished syncing (or the share was never accepted). So `channels/<channelId>/*.bin` and/or `blocks/*.bin` are missing locally.
- **Evidence:** Not a code bug; verify with `ls -la "$NEARBYTES_STORAGE_DIR/channels"` and `ls "$NEARBYTES_STORAGE_DIR/blocks" | wc -l` on Professor Kurz’s machine.

### R3 (mitigated): Conflicting defaults / default file service

- **Mechanism:** The domain layer had a `getDefaultFileService()` that used a hardcoded `./nearbytes-storage`. The **API server** does not use it (it injects a file service built with the env-derived path). So this did not cause the server to point at the wrong dir. It has been aligned so that the default file service also respects `process.env.NEARBYTES_STORAGE_DIR` when present, giving a single documented default for local dev.

## 3. Evidence

### Code references

| Location | Who uses it | How storageDir is resolved | Risk |
|--------|--------------|-----------------------------|------|
| `src/server/index.ts` | API server entry | `path.resolve(process.env.NEARBYTES_STORAGE_DIR ?? './nearbytes-storage')` | **Authoritative** for server |
| `scripts/run-mega-dev.sh` | `npm run mega` | Sets `NEARBYTES_STORAGE_DIR="${NEARBYTES_STORAGE_DIR:-$HOME/MEGA/NearbytesStorage}"` then runs `npm run dev` | Ensures MEGA path when using script |
| `src/domain/fileService.ts` | Standalone `listFiles`/`addFile`/etc. (CLI/tests) | `getDefaultFileService()` now uses `process.env.NEARBYTES_STORAGE_DIR ?? './nearbytes-storage'` | Was med; now aligned with env |
| CLI commands (`volume-open`, `store`, `setup`, etc.) | CLI | `options.dataDir \|\| './nearbytes-storage'` (CLI flag `-d`) | Low (explicit flag or default) |

- **Entrypoint map**
  - **API server:** `npm run server` → `node dist/server/index.js` (after `npm run build`). Dev: `npm run dev:server` → build then server. No dotenv; env from shell or `run-mega-dev.sh`.
  - **UI:** `npm run dev` (root) runs `npm run dev:server` + `npm --prefix ui run dev` (Vite). UI proxies `/open`, `/files`, etc. to `http://localhost:3000`.

### Runtime (Gabe machine – example)

With **no** `NEARBYTES_STORAGE_DIR`:

```
Using storage dir: /Users/<user>/Nearbytes/nearbytes-storage
[storage] resolved storageDir (absolute): /Users/<user>/Nearbytes/nearbytes-storage
[storage] storageDir exists: true
[storage] channels path: .../nearbytes-storage/channels
[storage] channels exists: true
[storage] channel directories count: 16
[storage] blocks path: .../nearbytes-storage/blocks
[storage] blocks exists: true
[storage] blocks *.bin count: 6
[storage] WARNING: Server is using repo-local storage. If you expect MEGA sync, set NEARBYTES_STORAGE_DIR to your MEGA sync folder (...)
```

With **MEGA** set (`export NEARBYTES_STORAGE_DIR="$HOME/MEGA/NearbytesStorage"`):

- Same log block but `storageDirAbs` points to `$HOME/MEGA/NearbytesStorage`; no repo-local warning if that path is used.

**Debug endpoint (example):**

```bash
curl -s http://localhost:3000/__debug/storage | jq .
# storageDirAbs, channelsDirAbs, blocksDirAbs, channelsCount, blocksCount, sampleChannels, megaHints
```

**Channel debug (volumeId = public key hex from POST /open):**

```bash
curl -s "http://localhost:3000/__debug/channel/<volumeId>" | jq .
# channelId, channelDirAbs, exists, eventFiles: [{ name, sizeBytes, mtimeISO }]
```

## 4. Exact fix steps for Gabe and Professor Kurz

### Gabe (already seeing images)

- Confirm server is using MEGA when intended:
  - Start with: `export NEARBYTES_STORAGE_DIR="$HOME/MEGA/NearbytesStorage"` then `npm run dev` (or use `npm run mega`).
  - Check startup log: `[storage] resolved storageDir (absolute):` should be the MEGA path.
  - Optional: `curl -s http://localhost:3000/__debug/storage | jq .storageDirAbs`

### Professor Kurz (zero images)

1. **Set storage to the same MEGA sync folder as Gabe (if using MEGA):**
   ```bash
   export NEARBYTES_STORAGE_DIR="$HOME/MEGA/NearbytesStorage"
   npm run dev
   ```
   On Windows (PowerShell):  
   `$env:NEARBYTES_STORAGE_DIR="$env:USERPROFILE\MEGA\NearbytesStorage"` then `npm run dev`.

2. **Confirm what the server is using:**
   - In the server startup log, find: `[storage] resolved storageDir (absolute): <path>`.
   - Or: `curl -s http://localhost:3000/__debug/storage | jq .storageDirAbs`

3. **Verify data exists on disk (replace with actual path from step 2):**
   ```bash
   STORAGE="$NEARBYTES_STORAGE_DIR"   # or the path from __debug/storage
   ls -la "$STORAGE/channels"
   ls "$STORAGE/blocks" | wc -l
   ```
   - If `channels` is empty or missing, or `blocks` has no `.bin` files, MEGA may not be synced: accept the share and wait for sync, then restart the server.

4. **Open “LeedsUnited” in the UI and note the volume ID.** Then:
   ```bash
   curl -s "http://localhost:3000/__debug/channel/<volumeId>" | jq .
   ```
   - If `exists` is true but `eventFiles` is empty, the channel has no events (sync not finished or wrong storage path). If `exists` is false, the server’s storage root does not contain that channel (again, wrong path or no sync).

5. **If not using MEGA:** Use a single, explicit directory and set it the same way:
   ```bash
   export NEARBYTES_STORAGE_DIR="/path/to/shared/storage"
   npm run dev
   ```
   Ensure both Gabe and Professor Kurz use the **same** path (e.g. shared drive or synced folder).

## 5. Code changes summary

| File | Change |
|------|--------|
| `src/server/storageDiagnostics.ts` | **New.** Resolve storage to absolute path; count channels/blocks; detect MEGA-like paths; log at startup; warn when repo-local + MEGA candidates exist. No secrets. |
| `src/server/index.ts` | Resolve `storageDir` with `path.resolve()`; run diagnostics at startup; pass `resolvedStorageDir` into `createApp`; wrap startup in `main()` and catch. |
| `src/server/app.ts` | Add optional `resolvedStorageDir` to `AppDependencies`. |
| `src/server/routes.ts` | Add optional `resolvedStorageDir`; register `GET /__debug/storage` and `GET /__debug/channel/:id`; in `POST /open`, when `files.length === 0` and storage appears empty, set `storageHint` in response. |
| `src/domain/fileService.ts` | `getDefaultFileService()` uses `process.env.NEARBYTES_STORAGE_DIR ?? './nearbytes-storage'` (single default). |
| `ui/src/lib/api.ts` | Add `storageHint?: string` to `OpenVolumeResponse`. |
| `ui/src/App.svelte` | Set `errorMessage = response.storageHint ?? ''` after successful open so UI shows storage hint when present. |
| `ui/vite.config.js` | Proxy `/__debug` to backend. |
| `README.md` | Document `NEARBYTES_STORAGE_DIR` as single source of truth; MEGA path examples; verification commands; debug endpoints. |

## 6. Verification checklist

- [ ] **Gabe:** Start with `NEARBYTES_STORAGE_DIR` unset → logs show repo-local path and WARNING.
- [ ] **Gabe:** Start with `NEARBYTES_STORAGE_DIR="$HOME/MEGA/NearbytesStorage"` → logs show that path; no repo-local WARNING when using MEGA.
- [ ] **Both:** `curl -s http://localhost:3000/__debug/storage` returns JSON with `storageDirAbs`, `channelsCount`, `blocksCount`.
- [ ] **Both:** Open “LeedsUnited” in UI; note `volumeId`; `curl -s "http://localhost:3000/__debug/channel/<volumeId>"` shows `exists: true` and non-empty `eventFiles` when data exists.
- [ ] **Professor Kurz:** After setting `NEARBYTES_STORAGE_DIR` to the same MEGA path as Gabe and confirming sync, open “LeedsUnited” again → images appear.
- [ ] **Empty storage:** Open a volume when storage has no blocks and no channel events → response includes `storageHint`; UI shows the hint message.

## 7. Prevention (guardrails added)

- **Single source of truth:** Server and default file service use `process.env.NEARBYTES_STORAGE_DIR` with one documented default `./nearbytes-storage` for local dev. Server always resolves this with `path.resolve()` and logs the absolute path.
- **Startup diagnostics:** At server startup we log resolved storage path, existence of `channels`/`blocks`, counts, and a WARNING when using repo-local storage while MEGA-like paths exist.
- **Debug endpoints:** `GET /__debug/storage` and `GET /__debug/channel/:id` expose storage path and channel event file list (names, sizes, mtimes only; no secrets).
- **Friendly hint when storage looks empty:** If `POST /open` returns 0 files and the storage directory has no blocks and no (or only empty) channel dirs, the response includes `storageHint` so the UI can show: “Storage directory appears empty. Verify NEARBYTES_STORAGE_DIR points to the folder containing /blocks and /channels.”
- **README:** Explicit setup for `NEARBYTES_STORAGE_DIR`, MEGA path examples, and verification/debug commands.

---

## Open Flow Trace (UI → API → filesystem)

- **UI:** User types “LeedsUnited” → debounced `loadVolume()` → `openVolume(secret)` in `ui/src/lib/api.ts` → `POST /open` with `{ secret }`.
- **Backend:** `src/server/routes.ts` → `POST /open` handler → `getVolumeId(validatedSecret, crypto, storage)` (calls `openVolume` then `bytesToHex(volume.publicKey)`) and `deps.fileService.listFiles(validatedSecret)`.
- **listFiles:** `src/domain/fileService.ts` → `listFilesWithDeps` → `openVolume` (creates channel dir if needed) → `loadEventLog(volume, channelStorage)` → `channelStorage.listEvents(volume.publicKey)`.
- **Storage:** `src/storage/channel.ts` → `listEvents` → `this.storage.listFiles(channelPath)` where `channelPath = pathMapper(publicKey)` = `channels/<hex>` from `src/types/storage.ts` `defaultPathMapper`.
- **Filesystem:** `src/storage/filesystem.ts` → `listFiles(directory)` → `fs.readdir(join(this.basePath, directory))`; `basePath` is the resolved `storageDir` from server index.

So: **UI (secret) → POST /open → getVolumeId + fileService.listFiles → openVolume + loadEventLog → ChannelStorage.listEvents → StorageBackend.listFiles(channels/<volumeId>) → fs.readdir(<storageDir>/channels/<volumeId>).**  
The `volumeId` in the UI is the public key hex and matches the folder name under `channels/`.
