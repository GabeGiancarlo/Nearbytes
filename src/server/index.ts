#!/usr/bin/env node

import { createCryptoOperations } from '../crypto/index.js';
import { createFileService } from '../domain/fileService.js';
import { FilesystemStorageBackend } from '../storage/filesystem.js';
import { createApp } from './app.js';
import { parseTokenKey } from './auth.js';

const port = parsePort(process.env.PORT);
const storageDir = process.env.NEARBYTES_STORAGE_DIR ?? './nearbytes-storage';
const corsOrigin = parseCorsOrigin(process.env.NEARBYTES_CORS_ORIGIN ?? 'http://localhost:5173');
const maxUploadBytes = parseMaxUploadBytes(process.env.NEARBYTES_MAX_UPLOAD_MB);
const tokenKey = process.env.NEARBYTES_SERVER_TOKEN_KEY
  ? parseTokenKey(process.env.NEARBYTES_SERVER_TOKEN_KEY)
  : undefined;

const crypto = createCryptoOperations();
const storage = new FilesystemStorageBackend(storageDir);
const fileService = createFileService({ crypto, storage });

console.log(`Using storage dir: ${storageDir}`);

const app = createApp({
  fileService,
  crypto,
  storage,
  tokenKey,
  corsOrigin,
  maxUploadBytes,
});

app.listen(port, () => {
  console.log(`Nearbytes API server running at http://localhost:${port}`);
});

function parsePort(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '3000', 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 3000;
  }
  return parsed;
}

function parseCorsOrigin(value: string): string | string[] | boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (trimmed === '*') {
    return true;
  }
  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return trimmed;
}

function parseMaxUploadBytes(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '50', 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 50 * 1024 * 1024;
  }
  return parsed * 1024 * 1024;
}
