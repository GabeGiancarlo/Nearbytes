# NearBytes Web UI

A simple web interface for NearBytes encrypted file storage.

## Quick Start

1. **Install dependencies** (if not already done):
```bash
npm install
```

2. **Build the project**:
```bash
npm run build
```

3. **Start the server**:
```bash
npm run server
```

4. **Open in browser**:
Navigate to http://localhost:3000

## Usage

1. **Open a Volume**:
   - Enter your volume secret (e.g., "mychannel:password")
   - Click "Open Volume"
   - The volume will be created if it doesn't exist

2. **Add Files**:
   - Enter a file name
   - Select a file using the file picker
   - Click "Add File"
   - Files are encrypted and stored in the volume

3. **View Files**:
   - After opening a volume, all files are listed
   - Each file shows its name and actions

4. **Download Files**:
   - Click "Download" next to any file
   - The file will be decrypted and downloaded

5. **Remove Files**:
   - Click "Remove" next to any file
   - Confirm the deletion
   - The file is removed from the volume (encrypted data block remains)

## API Endpoints

The server exposes REST API endpoints:

- `POST /api/volume/open` - Open a volume
- `POST /api/files/list` - List files in a volume
- `POST /api/files/add` - Add a file to a volume
- `POST /api/files/remove` - Remove a file from a volume
- `POST /api/files/get` - Get a file from a volume

## Configuration

- **Port**: Set `PORT` environment variable (default: 3000)
- **Data Directory**: Files are stored in `./data` directory (relative to server)

## Security Notes

- The secret is sent to the server in plaintext (for MVP demo)
- In production, consider:
  - Using HTTPS
  - Implementing client-side encryption
  - Using secure secret storage
  - Adding authentication/authorization

## Development

The UI is a simple HTML/JavaScript application served by Express. The server uses the NearBytes API layer, demonstrating the framework-agnostic design.
