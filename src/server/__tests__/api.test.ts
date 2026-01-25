import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createCryptoOperations } from '../../crypto/index.js';
import { createFileService } from '../../domain/fileService.js';
import { FilesystemStorageBackend } from '../../storage/filesystem.js';
import { createApp } from '../app.js';

const SECRET_OPEN = 'nearbytes-open-secret';
const SECRET_UPLOAD = 'nearbytes-upload-secret';
const SECRET_ISOLATION = 'nearbytes-isolation-secret';
const SECRET_OTHER = 'nearbytes-other-secret';

describe('Nearbytes API', () => {
  let tempDir: string;
  let app: ReturnType<typeof createApp>;
  let tokenKey: Uint8Array;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nearbytes-api-'));
    tokenKey = randomBytes(32);

    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(tempDir);
    const fileService = createFileService({ crypto, storage });

    app = createApp({
      fileService,
      crypto,
      storage,
      tokenKey,
      corsOrigin: true,
      maxUploadBytes: 5 * 1024 * 1024,
    });
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns health status', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('opens a volume and returns a token', async () => {
    const res = await request(app).post('/open').send({ secret: SECRET_OPEN }).expect(200);
    expect(res.body.volumeId).toMatch(/^[0-9a-f]+$/);
    expect(res.body.fileCount).toBe(0);
    expect(res.body.files).toEqual([]);
    expect(res.body.token).toBeTypeOf('string');
  });

  it('uploads, lists, downloads, and deletes files', async () => {
    const openRes = await request(app).post('/open').send({ secret: SECRET_UPLOAD }).expect(200);
    const token = openRes.body.token as string;

    const uploadRes = await request(app)
      .post('/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('hello world'), 'hello.txt')
      .expect(200);

    const created = uploadRes.body.created;
    expect(created.filename).toBe('hello.txt');
    expect(created.blobHash).toBeTypeOf('string');
    expect(created.size).toBe(11);

    const listRes = await request(app)
      .get('/files')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listRes.body.files).toHaveLength(1);
    expect(listRes.body.files[0].blobHash).toBe(created.blobHash);

    const downloadRes = await request(app)
      .get(`/file/${created.blobHash}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(downloadRes.body.toString()).toBe('hello world');
    expect(downloadRes.headers['content-disposition']).toContain('hello.txt');

    await request(app)
      .delete(`/files/${encodeURIComponent('hello.txt')}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const emptyList = await request(app)
      .get('/files')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(emptyList.body.files).toHaveLength(0);
  });

  it('rejects wrong secrets and isolates volumes', async () => {
    const openRes = await request(app)
      .post('/open')
      .send({ secret: SECRET_ISOLATION })
      .expect(200);
    const token = openRes.body.token as string;

    const uploadRes = await request(app)
      .post('/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('secret data'), 'secret.txt')
      .expect(200);

    const blobHash = uploadRes.body.created.blobHash as string;

    const otherOpen = await request(app)
      .post('/open')
      .send({ secret: SECRET_OTHER })
      .expect(200);
    const otherToken = otherOpen.body.token as string;

    const otherList = await request(app)
      .get('/files')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);

    expect(otherList.body.files).toHaveLength(0);

    const badDownload = await request(app)
      .get(`/file/${blobHash}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(401);

    expect(badDownload.body.error.code).toBe('UNAUTHORIZED');
  });
});

function binaryParser(
  res: NodeJS.ReadableStream,
  callback: (error: Error | null, body?: Buffer) => void
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  res.on('end', () => {
    callback(null, Buffer.concat(chunks));
  });
  res.on('error', (error) => {
    callback(error);
  });
}
