import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createCryptoOperations } from '../../crypto/index.js';
import { storeData } from '../../domain/operations.js';
import { ChannelStorage } from '../../storage/channel.js';
import { FilesystemStorageBackend } from '../../storage/filesystem.js';
import { createSecret } from '../../types/keys.js';
import { defaultPathMapper } from '../../types/storage.js';
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

  it('computes and persists snapshots on demand', async () => {
    const { service, dir, cleanup } = await createTestService(START_TIME);
    const secret = 'test:secret:snapshot';

    await service.addFile(secret, 'snap.txt', Buffer.from('snap'));
    const summary = await service.computeSnapshot(secret);

    expect(summary.eventCount).toBe(1);
    expect(summary.fileCount).toBe(1);
    expect(summary.generatedAt).toBe(START_TIME + 1000);
    expect(summary.lastEventHash).toMatch(/^[0-9a-f]{64}$/);

    const keyPair = await createCryptoOperations().deriveKeys(createSecret(secret));
    const channelPath = defaultPathMapper(keyPair.publicKey);
    const snapshotPath = join(dir, channelPath, 'snapshot.latest.json');
    const snapshotRaw = await readFile(snapshotPath, 'utf8');
    const snapshot = JSON.parse(snapshotRaw) as {
      version: number;
      files: { filename: string }[];
    };

    expect(snapshot.version).toBe(1);
    expect(snapshot.files).toHaveLength(1);
    expect(snapshot.files[0].filename).toBe('snap.txt');

    await cleanup();
  });

  it('returns a deterministic timeline for playback UIs', async () => {
    const { service, cleanup } = await createTestService(START_TIME);
    const secret = 'test:secret:timeline';

    await service.addFile(secret, 'a.txt', Buffer.from('a'));
    await service.addFile(secret, 'b.txt', Buffer.from('b'));
    await service.deleteFile(secret, 'a.txt');

    const timeline = await service.getTimeline(secret);

    expect(timeline).toHaveLength(3);
    expect(timeline[0].type).toBe('CREATE_FILE');
    expect(timeline[1].type).toBe('CREATE_FILE');
    expect(timeline[2].type).toBe('DELETE_FILE');
    expect(timeline[0].timestamp).toBe(START_TIME);
    expect(timeline[1].timestamp).toBe(START_TIME + 1000);
    expect(timeline[2].timestamp).toBe(START_TIME + 2000);

    await cleanup();
  });

  it('renames a folder prefix across all nested files', async () => {
    const { service, cleanup } = await createTestService(START_TIME);
    const secret = 'test:secret:rename-folder';

    await service.addFile(secret, 'photos/a.jpg', Buffer.from('a'));
    await service.addFile(secret, 'photos/2024/b.jpg', Buffer.from('b'));
    await service.addFile(secret, 'notes/todo.txt', Buffer.from('todo'));

    const renamed = await service.renameFolder(secret, 'photos', 'archive/photos');
    const files = await service.listFiles(secret);
    const names = files.map((file) => file.filename).sort((left, right) => left.localeCompare(right));

    expect(renamed.fromFolder).toBe('photos');
    expect(renamed.toFolder).toBe('archive/photos');
    expect(renamed.movedFiles).toBe(2);
    expect(renamed.mergedConflicts).toBe(0);
    expect(names).toEqual(['archive/photos/2024/b.jpg', 'archive/photos/a.jpg', 'notes/todo.txt']);

    await cleanup();
  });

  it('renames a single file with a first-class rename event', async () => {
    const { service, cleanup } = await createTestService(START_TIME);
    const secret = 'test:secret:rename-file';

    await service.addFile(secret, 'draft.txt', Buffer.from('hello'));

    const renamed = await service.renameFile(secret, 'draft.txt', 'final.txt');
    const files = await service.listFiles(secret);
    const timeline = await service.getTimeline(secret);

    expect(renamed.fromName).toBe('draft.txt');
    expect(renamed.toName).toBe('final.txt');
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('final.txt');
    expect(timeline.at(-1)?.type).toBe('RENAME_FILE');
    expect(timeline.at(-1)?.filename).toBe('draft.txt');
    expect(timeline.at(-1)?.toFilename).toBe('final.txt');

    await cleanup();
  });

  it('requires merge when destination folder already contains files', async () => {
    const { service, cleanup } = await createTestService(START_TIME);
    const secret = 'test:secret:rename-merge';

    await service.addFile(secret, 'src/a.txt', Buffer.from('src-version'));
    await service.addFile(secret, 'dst/a.txt', Buffer.from('dst-version'));

    await expect(service.renameFolder(secret, 'src', 'dst')).rejects.toThrow(
      'Destination folder already contains 1 file(s). Retry with merge enabled.'
    );

    const renamed = await service.renameFolder(secret, 'src', 'dst', { merge: true });
    const files = await service.listFiles(secret);
    const moved = files.find((file) => file.filename === 'dst/a.txt');

    expect(renamed.movedFiles).toBe(1);
    expect(renamed.mergedConflicts).toBe(1);
    expect(files.some((file) => file.filename.startsWith('src/'))).toBe(false);
    expect(moved).toBeDefined();

    const payload = await service.getFile(secret, moved!.blobHash);
    expect(payload.toString('utf8')).toBe('src-version');

    await cleanup();
  });

  it('includes legacy log events without metadata in timeline replay', async () => {
    const { service, dir, cleanup } = await createTestService(START_TIME);
    const secret = 'test:secret:legacy';
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(dir);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    await storeData(
      new Uint8Array(Buffer.from('legacy-file')),
      'legacy.txt',
      createSecret(secret),
      crypto,
      channelStorage
    );

    const timeline = await service.getTimeline(secret);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].type).toBe('CREATE_FILE');
    expect(timeline[0].filename).toBe('legacy.txt');

    const files = await service.listFiles(secret);
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('legacy.txt');

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
