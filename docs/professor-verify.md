# Professor Verification Guide

This guide helps verify that Nearbytes is working correctly after a fresh clone and setup.

## Prerequisites Check

Before starting, ensure:

- [ ] Node.js 18+ is installed (`node --version`)
- [ ] npm is installed (`npm --version`)
- [ ] MEGA desktop app is installed and running
- [ ] MEGA shared folder is synced at `$HOME/MEGA/NearbytesStorage`
- [ ] The folder exists: `ls -la "$HOME/MEGA/NearbytesStorage"`

## Step 1: Clone and Install

```bash
git clone <repo-url>
cd Nearbytes
npm install
cd ui && npm install && cd ..
```

**Verify:**
- No errors during installation
- `node_modules` directories exist in both root and `ui/`

## Step 2: Set Storage Directory

```bash
export NEARBYTES_STORAGE_DIR="$HOME/MEGA/NearbytesStorage"
```

**Verify:**
- Environment variable is set: `echo $NEARBYTES_STORAGE_DIR`
- Should output: `/Users/yourname/MEGA/NearbytesStorage` (or your home path)

## Step 3: Start Development Servers

```bash
npm run dev
```

**Verify:**
- Both servers start without errors
- Backend logs: `Using storage dir: /Users/.../MEGA/NearbytesStorage`
- Backend logs: `Nearbytes API server running at http://localhost:3000`
- UI logs: `Local: http://localhost:5173`

## Step 4: Verify Server Health

In a new terminal:

```bash
curl http://localhost:3000/health
```

**Expected:** `{"ok":true}`

## Step 5: Open UI in Browser

1. Navigate to `http://localhost:5173`
2. Check browser console for errors (should be empty)

**Verify:**
- UI loads without errors
- Dark theme is applied
- Secret input field is visible

## Step 6: Test with "LeedsUnited" Secret

1. Type `LeedsUnited` in the secret input field
2. Press Enter or wait for automatic load

**Verify:**
- Volume ID appears (hex string)
- If MEGA folder is synced: files appear in the list
- If MEGA folder is empty: shows "No files yet" or empty list
- Last refresh timestamp is displayed

## Step 7: Verify File Download (if files exist)

1. Click on a file in the list
2. File should download

**Verify:**
- Download starts automatically
- File has correct name
- File content matches expected

## Step 8: Verify File Upload (optional)

1. Drag and drop an image file onto the UI
2. File should appear in the list

**Verify:**
- File appears immediately after upload
- File shows correct name, size, and timestamp
- Check MEGA folder: `ls -la "$HOME/MEGA/NearbytesStorage/blocks"`
- New encrypted blob files should appear

## Troubleshooting

### Wrong Storage Directory

**Symptom:** Files don't appear in MEGA folder, or server logs show wrong path.

**Fix:**
```bash
# Check current value
echo $NEARBYTES_STORAGE_DIR

# Set correctly
export NEARBYTES_STORAGE_DIR="$HOME/MEGA/NearbytesStorage"

# Restart server
# (Stop with Ctrl+C, then run npm run dev again)
```

### MEGA Not Synced Yet

**Symptom:** Empty volume when typing "LeedsUnited", but files should exist.

**Fix:**
1. Check MEGA desktop app is running
2. Verify sync folder is configured in MEGA settings
3. Check MEGA web UI to see if files are in cloud
4. Wait for sync to complete (check MEGA desktop app status)
5. Verify files exist locally: `ls -la "$HOME/MEGA/NearbytesStorage/blocks"`

### Backend Not Running

**Symptom:** UI shows "Backend unavailable" or connection errors.

**Fix:**
1. Check if backend is running: `curl http://localhost:3000/health`
2. If not running, check terminal for errors
3. Ensure `npm run dev` is running from repo root
4. Check port 3000 is not in use: `lsof -i :3000`

### Port Conflict

**Symptom:** Server fails to start with "port already in use" error.

**Fix:**
```bash
# Find process using port 3000
lsof -i :3000

# Kill the process (replace PID with actual process ID)
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

### UI Not Loading

**Symptom:** Browser shows connection error or blank page.

**Fix:**
1. Verify UI server is running (check terminal)
2. Check URL is correct: `http://localhost:5173`
3. Check browser console for errors
4. Try hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows/Linux)

### Files Not Appearing After Upload

**Symptom:** Upload succeeds but files don't appear in list.

**Fix:**
1. Click "Refresh" button
2. Check browser console for errors
3. Verify backend is running: `curl http://localhost:3000/health`
4. Check storage directory: `ls -la "$HOME/MEGA/NearbytesStorage/blocks"`

### Wrong Files Showing

**Symptom:** Files with wrong names appear in the list.

**Fix:**
1. Hard refresh browser: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows/Linux)
2. Clear browser cache
3. Ensure UI code is up to date (filename is now explicitly sent)
4. Re-upload files if needed

## Success Criteria

All of the following should be true:

- ✅ Server health check returns `{"ok":true}`
- ✅ UI loads at `http://localhost:5173` without errors
- ✅ Typing "LeedsUnited" shows files (if MEGA folder is synced)
- ✅ File download works (if files exist)
- ✅ File upload works and files appear in MEGA folder
- ✅ Server logs show correct storage directory

## Next Steps

After verification:

1. Review [MEGA Integration Guide](mega.md) for detailed information
2. Review [UI Documentation](../ui/README.md) for UI-specific details
3. Review [API Server Documentation](api-server.md) for backend details

## Getting Help

If verification fails:

1. Check all prerequisites are met
2. Review troubleshooting section above
3. Check server logs for errors
4. Check browser console for errors
5. Verify MEGA folder is synced and contains files
