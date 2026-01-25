# Manual Verification Steps

This document provides step-by-step instructions to verify that Phase 3 UI is working correctly.

## Prerequisites

1. Backend server is built and ready
2. UI dependencies are installed
3. Both servers can run simultaneously

## Setup

### Step 1: Start Backend Server

From repository root:

```bash
npm run build
npm run server
```

Verify backend is running:
- Check console: "Nearbytes API server running at http://localhost:3000"
- Or test: `curl http://localhost:3000/health` should return `{"ok":true}`

### Step 2: Start UI Development Server

In a new terminal:

```bash
cd ui
npm install  # If not already done
npm run dev
```

Verify UI is running:
- Check console: "Local: http://localhost:5173"
- Open http://localhost:5173 in browser

## Verification Tests

### Test 1: Secret Input Materializes Files

**Steps:**
1. Open http://localhost:5173
2. Enter a secret in the input field (e.g., "test-volume")
3. Press Enter or wait for reactive update

**Expected:**
- Files appear immediately (if volume exists)
- Volume ID is displayed in status bar
- Last refresh timestamp is shown
- If volume is empty, shows "No files yet" message

**If volume doesn't exist:**
- Create it by uploading a file (see Test 2)

### Test 2: Drag & Drop Upload

**Steps:**
1. Enter a secret (or use existing)
2. Drag a file from your file system into the file area
3. Drop the file

**Expected:**
- File appears in the list immediately after upload
- File shows correct name, size, and date
- No error messages

**Verify upload format:**
- Check browser DevTools → Network tab
- Find POST request to `/upload`
- Verify `Content-Type: multipart/form-data`
- Verify `file` field contains the file

### Test 3: Delete File

**Steps:**
1. Ensure at least one file exists in the list
2. Click the "×" delete button on a file
3. Confirm file disappears

**Expected:**
- File is removed from list immediately
- DELETE request sent to `/files/:name` (check Network tab)
- No error messages

### Test 4: Download File

**Steps:**
1. Click on a file card (not the delete button)
2. File should download

**Expected:**
- GET request to `/file/:hash` (check Network tab)
- Browser downloads file with correct filename
- Downloaded file matches original

**Verify download:**
- Compare file size and hash with original
- Open file to verify content matches

### Test 5: Refresh Page & Re-open Secret

**Steps:**
1. Enter a secret and load files
2. Refresh the browser page (F5 or Cmd+R)
3. Re-enter the same secret

**Expected:**
- If token was returned, it may be in sessionStorage
- Files load successfully
- Volume ID matches previous session

### Test 6: Offline Behavior (Cached Data)

**Steps:**
1. Enter a secret and load files (ensure files are cached)
2. Stop the backend server (Ctrl+C in backend terminal)
3. Refresh the file list (click "Refresh" button or change secret)

**Expected:**
- UI shows "Offline (cached)" indicator
- Cached file list is displayed
- Error message indicates using cached data
- UI remains functional for viewing cached files

**Note:** Downloads and uploads will fail offline (expected behavior).

### Test 7: Token Authentication (if enabled)

**Prerequisites:** Backend must have `NEARBYTES_SERVER_TOKEN_KEY` set

**Steps:**
1. Start backend with token key:
   ```bash
   NEARBYTES_SERVER_TOKEN_KEY="<32-byte-hex-key>" npm run server
   ```
2. Enter a secret in UI
3. Check browser DevTools → Application → Session Storage
4. Verify `nearbytes-token` is stored
5. Check Network tab for subsequent requests
6. Verify `Authorization: Bearer <token>` header is used

**Expected:**
- Token is stored in sessionStorage (not localStorage)
- Subsequent API calls use Bearer token
- No `x-nearbytes-secret` header in requests (except initial `/open`)

### Test 8: Multiple File Upload

**Steps:**
1. Select multiple files in file explorer
2. Drag all files into the UI
3. Drop them

**Expected:**
- All files appear in the list
- Each file uploads successfully
- File list updates after all uploads complete

### Test 9: Error Handling

**Test invalid secret:**
1. Enter a random secret that doesn't exist
2. Try to upload a file

**Expected:**
- Error message displayed in status bar
- Error message is user-friendly
- UI doesn't crash

**Test network error:**
1. Stop backend
2. Enter a secret (that was never cached)

**Expected:**
- Error message indicates backend unavailable
- UI handles error gracefully

## Visual Verification

### Theme & Branding

- [ ] Dark vault theme is applied
- [ ] Nearbytes brand mark (icon + title) is visible
- [ ] Accent color (#667eea) is used consistently
- [ ] Cards have rounded corners and subtle shadows
- [ ] Smooth animations on file materialization
- [ ] Hover effects work on file cards

### Layout

- [ ] Secret input is centered and prominent
- [ ] Status bar shows volume ID, last refresh, errors
- [ ] File grid is responsive
- [ ] Empty states show helpful messages
- [ ] Drag & drop highlight works

## Browser Compatibility

Test in:
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (if available)

## PWA Features

- [ ] Service worker is registered (check DevTools → Application → Service Workers)
- [ ] App can be installed (browser install prompt)
- [ ] Offline page works (if implemented)
- [ ] App shell is cached

## IndexedDB Cache

**Check cache:**
1. Open DevTools → Application → IndexedDB
2. Find `nearbytes-cache` database
3. Check `volumes` object store
4. Verify entries have `volumeId`, `files[]`, `cachedAt`

**Expected:**
- Cache entries exist for loaded volumes
- Cache is updated on file list refresh
- Cache persists across page refreshes

## Common Issues

### Files don't load
- Check backend is running on port 3000
- Check browser console for errors
- Verify proxy configuration in `vite.config.js`

### Upload fails
- Check file size (backend has max upload limit)
- Verify multipart/form-data is used (not base64)
- Check backend logs for errors

### Offline not working
- Verify IndexedDB is enabled in browser
- Check service worker is registered
- Ensure files were cached while online

### Token not stored
- Check backend has `NEARBYTES_SERVER_TOKEN_KEY` set
- Verify token is returned in `/open` response
- Check sessionStorage (not localStorage)

## Success Criteria

All tests pass:
- ✅ Secret input materializes files
- ✅ Drag & drop upload works
- ✅ Delete removes files
- ✅ Download retrieves files correctly
- ✅ Refresh page works
- ✅ Offline shows cached data
- ✅ Token auth works (if enabled)
- ✅ UI is branded and polished
- ✅ No console errors

If all criteria are met, Phase 3 UI is complete! 🎉
