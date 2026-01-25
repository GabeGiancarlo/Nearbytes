---
name: nearbytes-phase2-api
overview: Implement a stateless Express API layer over the Phase 1 file service, with token-based auth (plus secret header), validation, tests, and docs.
todos:
  - id: server-scaffold
    content: Refactor server into app/routes/auth/errors/validation modules.
    status: pending
  - id: api-logic
    content: Implement endpoints, auth/token, validation, errors.
    status: pending
  - id: tests
    content: Add unit + integration tests with temp storage dirs.
    status: completed
  - id: docs
    content: Update README and add docs/api-server.md.
    status: completed
  - id: deps
    content: Add server/test dependencies and types.
    status: completed
---

# Nearbytes Phase 2 API Plan

## Architecture & wiring

- Replace the current `src/server/index.ts` with a thin entrypoint that reads env (`PORT` default 3000, `NEARBYTES_STORAGE_DIR` default `./nearbytes-storage`, `NEARBYTES_SERVER_TOKEN_KEY`, `NEARBYTES_CORS_ORIGIN` default `http://localhost:5173`, `NEARBYTES_MAX_UPLOAD_MB` default 50) and calls a new `createApp()` exported from [`src/server/app.ts`](src/server/app.ts).
- Build a server dependency container that constructs `FilesystemStorageBackend` with the configured storage dir and `createFileService()` from [`src/domain/fileService.ts`](src/domain/fileService.ts), so the server never uses the hard-coded `./data` default.
- Derive `volumeId` using `openVolume()` from [`src/domain/volume.ts`](src/domain/volume.ts) plus `bytesToHex()` from [`src/utils/encoding.ts`](src/utils/encoding.ts), keeping the secret out of responses.

## Core modules

- `src/server/auth.ts`: stateless auth helpers
  - Single `getSecretFromRequest(req)` used by all routes for consistent validation.
  - Auth precedence: Bearer token wins; otherwise use `x-nearbytes-secret`; if neither → 401.
  - Implement AES-256-GCM token encode/decode using `NEARBYTES_SERVER_TOKEN_KEY` (32 bytes) with base64url output; if token key is missing, allow header secret only.
  - Validate secrets using `createSecret()` from [`src/types/keys.ts`](src/types/keys.ts); never log secrets/tokens.
  - Expose `encodeSecretToken()` + `decodeSecretToken()` for `/open` and tests.
- `src/server/validation.ts`: zod schemas for `/open`, `/upload`, `/files/:name`, `/file/:hash` and common error mapping for validation failures.
- `src/server/errors.ts`: `ApiError` class, error codes, and Express error middleware returning `{ error: { code, message } }`.
- `src/server/routes.ts`: register endpoints `/health`, `/open`, `/files`, `/upload`, `/files/:name`, `/file/:hash`, with consistent error handling and redacted logging.
- `src/server/app.ts`: configure `cors` middleware with `NEARBYTES_CORS_ORIGIN` and JSON/upload limits, then register routes.

## Endpoint behavior

- `/open`: validate secret; call `openVolume()` and `fileService.listFiles()`; map to the response model (`volumeId`, `fileCount`, `files` with `filename`, `blobHash`, `size`, `mimeType`, `createdAt`); if token key is configured, include `token` in response.
- `/files`: list files for the secret/token.
- `/upload`: use `multer` with disk temp storage (OS temp dir) and size limit from `NEARBYTES_MAX_UPLOAD_MB`; choose `filename` override; pass `mimeType` to `fileService.addFile()`; delete temp file after read.
- `/files/:name`: URL decode `:name`; call `fileService.deleteFile()`.
- `/file/:hash`: call `fileService.getFile()`; resolve filename/mimeType from `listFiles()` for headers (note: log replay per request; add TODO for hash lookup); return raw bytes with `Content-Type` + `Content-Disposition`.
- `/health`: return `{ ok: true }`.

## Tests

- Add unit tests for auth token encode/decode, precedence rules, and missing auth in `src/server/__tests__/auth.test.ts`.
- Add integration tests with `supertest` in `src/server/__tests__/api.test.ts` using a temp storage dir (mkdtemp) and cleaned up after tests.
- Cover the required flows: `/health`, `/open`, `/upload`→`/files`, `/file/:hash` download bytes, `/files/:name` delete, wrong secret rejection, and cross-secret isolation.

## Docs & scripts

- Update [`README.md`](README.md) with a “Phase 2: Local File Server API” section, run instructions (`npm run build`, `npm run server`), curl examples, auth precedence (Bearer wins), and CORS env notes.
- Add [`docs/api-server.md`](docs/api-server.md) covering endpoints, auth modes, error format, env config, and sample flows (including token response on `/open` when enabled).
- Add JSDoc to exported server functions/types in `src/server/*`.
- Update `package.json` dependencies: add `multer`, `zod`, `cors`, `supertest`, `@types/multer`, `@types/supertest`, `@types/cors`.

## Key existing code reference

```41:73:src/domain/fileService.ts
export function createFileService(dependencies: FileServiceDependencies): FileService {
  const pathMapper = dependencies.pathMapper ?? defaultPathMapper;
  const channelStorage = new ChannelStorage(dependencies.storage, pathMapper);
  const now = dependencies.now ?? (() => Date.now());

  return {
    addFile: async (secret, filename, data, mimeType) =>
      addFileWithDeps(
        secret,
        filename,
        data,
        mimeType,
        dependencies.crypto,
        dependencies.storage,
        channelStorage,
        pathMapper,
        now
      ),
    deleteFile: async (secret, filename) =>
      deleteFileWithDeps(
        secret,
        filename,
        dependencies.crypto,
        dependencies.storage,
        channelStorage,
        pathMapper,
        now
      ),
    listFiles: async (secret) =>
      listFilesWithDeps(secret, dependencies.crypto, dependencies.storage, channelStorage, pathMapper),
    getFile: async (secret, blobHash) =>
      getFileWithDeps(secret, blobHash, dependencies.crypto, channelStorage),
  };
}
```