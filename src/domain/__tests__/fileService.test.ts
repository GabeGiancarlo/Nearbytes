import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createCryptoOperations } from '../../crypto/index.js';
import { FilesystemStorageBackend } from '../../storage/filesystem.js';
import { createFileService } from '../fileService.js';

const START_TIME = 1700000000000;

describe('FileService', () => {
  it('adds a file and lists it', async () => {
    const { service, cleanup } = await createTestService(START_TIME);

    const data = Buffer.from('hello file');
    const result = await service.addFile('test:secret:one', 'hello.txt', data, 'text/plain');
    const files = await service.listFiles('test:secret:one');

    expect(result.filename).toBe('hello.txt');
    expect(result.size).toBe(data.length);
    expect(result.mimeType).toBe('text/plain');
    expect(result.createdAt).toBe(START_TIME);

    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('hello.txt');
    expect(files[0].size).toBe(data.length);
    expect(files[0].createdAt).toBe(START_TIME);

    await cleanup();
  });

  it('deletes a file and it disappears from the list', async () => {
    const { service, cleanup } = await createTestService(START_TIME);

    await service.addFile('test:secret:two', 'remove.txt', Buffer.from('remove me'));
    await service.deleteFile('test:secret:two', 'remove.txt');
    const files = await service.listFiles('test:secret:two');

    expect(files).toHaveLength(0);

    await cleanup();
  });

  it('keeps the latest version when the same filename is added twice', async () => {
    const { service, cleanup } = await createTestService(START_TIME);

    await service.addFile('test:secret:three', 'notes.txt', Buffer.from('first'));
    await service.addFile('test:secret:three', 'notes.txt', Buffer.from('second'));
    const files = await service.listFiles('test:secret:three');

    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('notes.txt');
    expect(files[0].size).toBe(Buffer.from('second').length);
    expect(files[0].createdAt).toBe(START_TIME + 1000);

    await cleanup();
  });

  it('rebuilds state from the event log', async () => {
    const { service, dir, cleanup } = await createTestService(START_TIME);

    await service.addFile('test:secret:four', 'a.txt', Buffer.from('alpha'));
    await service.addFile('test:secret:four', 'b.txt', Buffer.from('beta'));
    await service.deleteFile('test:secret:four', 'a.txt');

    const reconstructed = createFileService({
      crypto: createCryptoOperations(),
      storage: new FilesystemStorageBackend(dir),
      now: () => START_TIME,
    });

    const files = await reconstructed.listFiles('test:secret:four');

    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('b.txt');

    await cleanup();
  });

  it('isolates file spaces between different secrets', async () => {
    const { service, cleanup } = await createTestService(START_TIME);

    await service.addFile('test:secret:five', 'shared.txt', Buffer.from('one'));
    const filesSecretA = await service.listFiles('test:secret:five');
    const filesSecretB = await service.listFiles('test:secret:six');

    expect(filesSecretA).toHaveLength(1);
    expect(filesSecretB).toHaveLength(0);

    await cleanup();
  });
});

async function createTestService(startTime: number): Promise<{
  service: ReturnType<typeof createFileService>;
  dir: string;
  cleanup: () => Promise<void>;
}> {
  const dir = await mkdtemp(join(tmpdir(), 'nearbytes-file-service-'));
  const storage = new FilesystemStorageBackend(dir);
  const crypto = createCryptoOperations();
  const now = createNow(startTime);
  const service = createFileService({ crypto, storage, now });

  return {
    service,
    dir,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

function createNow(start: number): () => number {
  let current = start;
  return () => {
    const value = current;
    current += 1000;
    return value;
  };
}
