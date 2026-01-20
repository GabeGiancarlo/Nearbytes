#!/usr/bin/env node

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createCryptoOperations } from '../crypto/index.js';
import { FilesystemStorageBackend } from '../storage/filesystem.js';
import { NearBytesAPI } from '../api/nearbytes-api.js';
import { createSecret } from '../types/keys.js';
import { EventType } from '../types/events.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4321;

// Initialize NearBytes API
const crypto = createCryptoOperations();
const storage = new FilesystemStorageBackend('./data');
const api = new NearBytesAPI(crypto, storage);

// Middleware
app.use(express.json({ limit: '100mb' })); // Allow large file uploads
app.use(express.static(join(__dirname, '../../public')));

// CORS headers (for development)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// API Routes

/**
 * Open a volume
 * POST /api/volume/open
 * Body: { secret: string }
 */
app.post('/api/volume/open', async (req, res): Promise<void> => {
  try {
    const { secret } = req.body;
    if (!secret) {
      res.status(400).json({ error: 'Secret is required' });
      return;
    }

    const validatedSecret = createSecret(secret);
    const result = await api.openVolume(validatedSecret);

    // Convert Uint8Array to base64 for JSON serialization
    res.json({
      publicKeyHex: result.publicKeyHex,
      fileCount: result.fileCount,
      files: Array.from(result.fileSystemState.files.values()).map(file => ({
        name: file.name,
        contentAddress: file.contentAddress,
        eventHash: file.eventHash,
      })),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * List files in a volume
 * POST /api/files/list
 * Body: { secret: string }
 */
app.post('/api/files/list', async (req, res): Promise<void> => {
  try {
    const { secret } = req.body;
    if (!secret) {
      res.status(400).json({ error: 'Secret is required' });
      return;
    }

    const validatedSecret = createSecret(secret);
    const files = await api.listFiles(validatedSecret);

    res.json(files);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Add a file to a volume
 * POST /api/files/add
 * Body: { secret: string, fileName: string, data: string (base64) }
 */
app.post('/api/files/add', async (req, res) => {
  try {
    const { secret, fileName, data } = req.body;
    if (!secret || !fileName || !data) {
      res.status(400).json({ error: 'Secret, fileName, and data are required' });
      return;
    }

    // Convert base64 to Uint8Array (handle binary data correctly)
    const base64Data = data.replace(/^data:.*,/, ''); // Remove data URL prefix if present
    const binaryString = Buffer.from(base64Data, 'base64');
    const bytes = new Uint8Array(binaryString);

    const validatedSecret = createSecret(secret);
    const result = await api.addFile(validatedSecret, fileName, bytes);

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Remove a file from a volume
 * POST /api/files/remove
 * Body: { secret: string, fileName: string }
 */
app.post('/api/files/remove', async (req, res) => {
  try {
    const { secret, fileName } = req.body;
    if (!secret || !fileName) {
      res.status(400).json({ error: 'Secret and fileName are required' });
      return;
    }

    const validatedSecret = createSecret(secret);
    const result = await api.removeFile(validatedSecret, fileName);

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get a file from a volume
 * POST /api/files/get
 * Body: { secret: string, fileName: string }
 */
app.post('/api/files/get', async (req, res) => {
  try {
    const { secret, fileName } = req.body;
    if (!secret || !fileName) {
      res.status(400).json({ error: 'Secret and fileName are required' });
      return;
    }

    const validatedSecret = createSecret(secret);
    const result = await api.getFile(validatedSecret, fileName);

    // Convert Uint8Array to base64 for JSON serialization
    const base64 = Buffer.from(result.data).toString('base64');

    res.json({
      fileName: result.fileName,
      data: base64,
      size: result.size,
      contentAddress: result.contentAddress,
      eventHash: result.eventHash,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get event log for a volume
 * POST /api/volume/events
 * Body: { secret: string }
 */
app.post('/api/volume/events', async (req, res): Promise<void> => {
  try {
    const { secret } = req.body;
    if (!secret) {
      res.status(400).json({ error: 'Secret is required' });
      return;
    }

    const validatedSecret = createSecret(secret);
    const entries = await api.getEventLog(validatedSecret);

    // Convert events to JSON-serializable format
    const serializedEvents = entries.map(entry => {
      const { signedEvent } = entry;
      const { type, fileName, hash } = signedEvent.payload;
      
      // Convert encryptedKey to base64 for JSON
      const encryptedKeyBase64 = Buffer.from(signedEvent.payload.encryptedKey).toString('base64');
      const signatureBase64 = Buffer.from(signedEvent.signature).toString('base64');

      return {
        eventHash: entry.eventHash,
        payload: {
          type: type === EventType.CREATE_FILE ? 'create_file' : 'delete_file',
          fileName,
          hash,
          encryptedKey: encryptedKeyBase64,
        },
        signature: signatureBase64,
      };
    });

    res.json({ events: serializedEvents });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Serve UI
app.get('/', (_req, res) => {
  res.sendFile(join(__dirname, '../../public/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`NearBytes UI server running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
