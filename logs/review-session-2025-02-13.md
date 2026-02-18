# Review session log — 2025-02-13

Reproducibility-focused. Commands, paths, and steps only.

---

## Session start

- **Branch:** `ak-review-2` (from git status)
- **Workspace:** `/Users/akurz/alexhkurz-at-git/nearbytes/Giancarlo-Nearbytes`

---

## Entries

| Time | Action | Reproducible |
|------|--------|--------------|
| — | Session log created per request | `logs/review-session-2025-02-13.md` |
| — | User: keep session log in `logs/`, concise, emphasis on reproducibility | — |
| — | User: catch up and review — what is there, what is new | — |
| — | Checked: `git log --oneline -30`, `git branch -a`, `git log main..HEAD` (empty: branch = main), `git log 974502d..HEAD --name-only` | — |
| — | Read: `README.md` (limit 330), `package.json`, listed `docs/`, dir tree | — |
| — | User: add Electron-Desktop-MVP-Planning.md to review later; create setup.sh from README, root level, use scripts/ | — |
| — | Checked: no setup.sh on ak-review-1; read README steps, scripts/run-mega-dev.sh, scripts/run-mega.sh, setup.log | — |
| — | Created `setup.sh` at root: npm install, ui npm install, npm run build, logs to setup.log, next step npm run mega / scripts/run-mega-dev.sh | — |
| — | User: add important steps and terminal output to log for collaborator | — |

---

## Steps to reproduce (Professor / MEGA flow)

1. **Setup (once):**
   ```bash
   ./setup.sh
   ```

2. **Verify MEGA folder (optional):**
   ```bash
   ls -la "${NEARBYTES_STORAGE_DIR:-$HOME/MEGA/NearbytesStorage}" | head
   ```
   Expected: directory exists, contains `channels` (and optionally `blocks`).

3. **Start server and UI:**
   ```bash
   npm run mega
   ```
   Must use `npm run mega` (or `export NEARBYTES_STORAGE_DIR="$HOME/MEGA/NearbytesStorage"` then `npm run dev`). If you start with plain `npm run dev`, the server uses `./nearbytes-storage` and the UI can show "Storage directory appears empty...".

4. **Open browser:** http://localhost:5173 — enter secret (e.g. `LeedsUnited`).

5. **Expected UI when storage is correct:** Volume id shown, "No files yet", "Drop files here to add them". If you see "Storage directory appears empty...", restart from step 3 with `npm run mega`.

---

## Terminal output: `npm run mega` (successful run)

```
> nearbytes-crypto@1.0.0 mega
> bash scripts/run-mega-dev.sh

Using MEGA storage dir: /Users/akurz/MEGA/NearbytesStorage

> nearbytes-crypto@1.0.0 dev
> concurrently -k "npm run dev:server" "npm run dev:ui"

[0] > nearbytes-crypto@1.0.0 dev:server
[0] > npm run build --silent && npm run server
[1] > nearbytes-ui@1.0.0 dev
[1] > vite dev
[1]   VITE v6.4.1  ready in 255 ms
[1]   ➜  Local:   http://localhost:5173/
[0] > nearbytes-crypto@1.0.0 server
[0] > node dist/server/index.js
[0]
[0] Using storage dir: /Users/akurz/MEGA/NearbytesStorage
[0] [storage] resolved storageDir (absolute): /Users/akurz/MEGA/NearbytesStorage
[0] [storage] storageDir exists: true
[0] [storage] channels path: /Users/akurz/MEGA/NearbytesStorage/channels
[0] [storage] channels exists: true
[0] [storage] channel directories count: 1
[0] [storage] blocks path: /Users/akurz/MEGA/NearbytesStorage/blocks
[0] [storage] blocks exists: false
[0] [storage] blocks *.bin count: 0
[0] Nearbytes API server running at http://localhost:3000
```

---

*Append below as session continues.*
