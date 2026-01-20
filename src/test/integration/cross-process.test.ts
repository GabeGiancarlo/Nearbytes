import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { createCryptoOperations } from '../../crypto/index.js';
import { FilesystemStorageBackend } from '../../storage/filesystem.js';
import { ChannelStorage } from '../../storage/channel.js';
import { openVolume, materializeVolume } from '../../domain/volume.js';
import { storeData, deleteFile } from '../../domain/operations.js';
import { createSecret } from '../../types/keys.js';
import { defaultPathMapper } from '../../types/storage.js';

const TEST_DATA_DIR = './test-data-cross-process';

/**
 * Simulates two different processes operating on the same volume
 * This tests cross-process consistency
 */
describe('Cross-Process Consistency', () => {
  beforeEach(async () => {
    // Clean up test data directory
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  it('should allow multiple processes to read the same volume', async () => {
    const secret = createSecret('test:shared:volume');
    const crypto1 = createCryptoOperations();
    const crypto2 = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage1 = new ChannelStorage(storage, defaultPathMapper);
    const channelStorage2 = new ChannelStorage(storage, defaultPathMapper);

    // Process 1: Create volume and add files
    await openVolume(secret, crypto1, storage);
    await storeData(new TextEncoder().encode('File 1'), 'file1.txt', secret, crypto1, channelStorage1);
    await storeData(new TextEncoder().encode('File 2'), 'file2.txt', secret, crypto1, channelStorage1);

    // Process 2: Open same volume and read
    const volume2 = await openVolume(secret, crypto2, storage);
    const state2 = await materializeVolume(volume2, channelStorage2, crypto2);

    // Process 2 should see the files
    expect(state2.files.size).toBe(2);
    expect(state2.files.has('file1.txt')).toBe(true);
    expect(state2.files.has('file2.txt')).toBe(true);
  });

  it('should see new files added by another process', async () => {
    const secret = createSecret('test:shared:volume');
    const crypto1 = createCryptoOperations();
    const crypto2 = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage1 = new ChannelStorage(storage, defaultPathMapper);
    const channelStorage2 = new ChannelStorage(storage, defaultPathMapper);

    // Process 1: Create volume
    await openVolume(secret, crypto1, storage);

    // Process 2: Open volume (empty)
    const volume2 = await openVolume(secret, crypto2, storage);
    let state2 = await materializeVolume(volume2, channelStorage2, crypto2);
    expect(state2.files.size).toBe(0);

    // Process 1: Add file
    await storeData(new TextEncoder().encode('New file'), 'newfile.txt', secret, crypto1, channelStorage1);

    // Process 2: Reload and see new file
    state2 = await materializeVolume(volume2, channelStorage2, crypto2);
    expect(state2.files.size).toBe(1);
    expect(state2.files.has('newfile.txt')).toBe(true);
  });

  it('should see files deleted by another process', async () => {
    const secret = createSecret('test:shared:volume');
    const crypto1 = createCryptoOperations();
    const crypto2 = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage1 = new ChannelStorage(storage, defaultPathMapper);
    const channelStorage2 = new ChannelStorage(storage, defaultPathMapper);

    // Process 1: Create volume and add file
    await openVolume(secret, crypto1, storage);
    await storeData(new TextEncoder().encode('Content'), 'file.txt', secret, crypto1, channelStorage1);

    // Process 2: See file exists
    const volume2 = await openVolume(secret, crypto2, storage);
    let state2 = await materializeVolume(volume2, channelStorage2, crypto2);
    expect(state2.files.has('file.txt')).toBe(true);

    // Process 1: Delete file
    await deleteFile('file.txt', secret, crypto1, channelStorage1);

    // Process 2: Reload and see file is gone
    state2 = await materializeVolume(volume2, channelStorage2, crypto2);
    expect(state2.files.has('file.txt')).toBe(false);
    expect(state2.files.size).toBe(0);
  });

  it('should handle concurrent writes (last write wins)', async () => {
    const secret = createSecret('test:shared:volume');
    const crypto1 = createCryptoOperations();
    const crypto2 = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage1 = new ChannelStorage(storage, defaultPathMapper);
    const channelStorage2 = new ChannelStorage(storage, defaultPathMapper);

    // Both processes open volume
    await openVolume(secret, crypto1, storage);
    const volume2 = await openVolume(secret, crypto2, storage);

    // Process 1: Add file with name "file.txt"
    await storeData(new TextEncoder().encode('Content 1'), 'file.txt', secret, crypto1, channelStorage1);

    // Process 2: Add file with same name "file.txt" (concurrent write)
    await storeData(new TextEncoder().encode('Content 2'), 'file.txt', secret, crypto2, channelStorage2);

    // Both processes should see the file (last write wins)
    const state1 = await materializeVolume(await openVolume(secret, crypto1, storage), channelStorage1, crypto1);
    const state2 = await materializeVolume(volume2, channelStorage2, crypto2);

    // Both should see exactly one file
    expect(state1.files.size).toBe(1);
    expect(state2.files.size).toBe(1);
    expect(state1.files.has('file.txt')).toBe(true);
    expect(state2.files.has('file.txt')).toBe(true);

    // Note: The actual content depends on which event was written last
    // This is expected behavior for concurrent writes without locking
  });

  it('should maintain consistency after multiple operations from different processes', async () => {
    const secret = createSecret('test:shared:volume');
    const crypto1 = createCryptoOperations();
    const crypto2 = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage1 = new ChannelStorage(storage, defaultPathMapper);
    const channelStorage2 = new ChannelStorage(storage, defaultPathMapper);

    // Process 1: Create and add files
    await openVolume(secret, crypto1, storage);
    await storeData(new TextEncoder().encode('File 1'), 'file1.txt', secret, crypto1, channelStorage1);
    await storeData(new TextEncoder().encode('File 2'), 'file2.txt', secret, crypto1, channelStorage1);

    // Process 2: Open and see files
    const volume2 = await openVolume(secret, crypto2, storage);
    let state2 = await materializeVolume(volume2, channelStorage2, crypto2);
    expect(state2.files.size).toBe(2);

    // Process 1: Delete file1, add file3
    await deleteFile('file1.txt', secret, crypto1, channelStorage1);
    await storeData(new TextEncoder().encode('File 3'), 'file3.txt', secret, crypto1, channelStorage1);

    // Process 2: Reload and see final state
    state2 = await materializeVolume(volume2, channelStorage2, crypto2);
    expect(state2.files.size).toBe(2);
    expect(state2.files.has('file1.txt')).toBe(false);
    expect(state2.files.has('file2.txt')).toBe(true);
    expect(state2.files.has('file3.txt')).toBe(true);
  });
});
