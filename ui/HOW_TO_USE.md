# How to Use the NearBytes UI

## Quick Start

1. **Start the backend server** (Terminal 1):
   ```bash
   cd /Users/gabegiancarlo/Desktop/Projects/Nearbytes
   npm run build
   PORT=4321 npm run server
   ```

2. **Start the UI dev server** (Terminal 2):
   ```bash
   cd ui
   npm run dev
   ```

3. **Open your browser**: http://localhost:5173

## Understanding the Input Fields

### Primary Address Field (Required)
- **What it is**: Your volume secret/address
- **What to enter**: Any string (e.g., `demo-volume-1`, `my-secret`, `test123`)
- **How it works**: This secret deterministically creates a volume. The same secret always opens the same volume.

### Additional Secret Field (Optional)
- **What it is**: An optional second secret to combine with the primary secret
- **What to enter**: Leave it **empty** for normal use, or enter a second secret if you want to combine secrets
- **How it works**: 
  - If **empty**: Uses just the primary secret (e.g., `demo-volume-1`)
  - If **filled**: Combines them as `primary:additional` (e.g., `demo-volume-1:extra-secret`)

**For most users**: **Leave the additional secret field empty**. Only use it if you specifically need to combine two secrets.

## Common Workflow

### Adding Files to a Volume

1. **Enter your address** in the first field (e.g., `demo-volume-1`)
2. **Leave the second field empty** (unless you need combined secrets)
3. **Wait for files to load** (if the volume already has files, they'll appear automatically)
4. **Drag and drop files** into the file area
5. **Files appear** in the grid automatically

### Switching Between Volumes

1. **Clear the address field** or type a different secret
2. **Files automatically update** to show the new volume's files
3. **Type the original secret again** to return to that volume

## Troubleshooting

### Error: "Failed to execute 'json' on 'Response': Unexpected end of JSON input"

**Cause**: The backend server isn't running or returned an empty response.

**Solution**:
1. Check if the backend is running on port 4321:
   ```bash
   curl http://localhost:4321
   ```
2. If it's not running, start it:
   ```bash
   cd /Users/gabegiancarlo/Desktop/Projects/Nearbytes
   PORT=4321 npm run server
   ```
3. Refresh the browser page

### Error: "Cannot connect to backend server"

**Cause**: The backend server isn't running or the port is wrong.

**Solution**: Make sure the backend is running on port 4321 (check Terminal 1)

### Files Don't Appear

**Possible causes**:
- Empty volume (no files added yet)
- Wrong secret entered
- Backend error

**Solution**:
1. Check browser console (F12) for errors
2. Try adding a file to see if it works
3. Check backend terminal for error messages

## Example Usage

### Example 1: Simple Single Secret
1. Enter: `demo-volume-1` (first field)
2. Leave second field: **empty**
3. Result: Uses secret `demo-volume-1`

### Example 2: Combined Secrets
1. Enter: `demo-volume-1` (first field)
2. Enter: `extra-secret` (second field)
3. Result: Uses combined secret `demo-volume-1:extra-secret`

### Example 3: Creating Multiple Volumes
1. Enter `volume-a` → Add files → Files stored in volume-a
2. Enter `volume-b` → Add files → Files stored in volume-b
3. Switch back to `volume-a` → Original files reappear

## Tips

- **Use simple, memorable secrets** for demos (e.g., `demo1`, `demo2`)
- **The additional secret field is optional** - leave it empty unless you specifically need combined secrets
- **Files persist** - once you add files to a volume, they'll be there when you return
- **Volumes are isolated** - different secrets = different volumes
- **Reactive UI** - files appear/disappear automatically as you type

## What the Additional Secret Field Is For

The additional secret field is an **advanced feature** for when you want to:
- Combine two secrets into one volume identifier
- Create a two-part secret system
- Share volumes where one person knows the primary secret and another knows the additional secret

**For normal use**: Just leave it empty and use only the primary address field.
