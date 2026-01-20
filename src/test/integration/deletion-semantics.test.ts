import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { createCryptoOperations } from '../../crypto/index.js';
import { FilesystemStorageBackend } from '../../storage/filesystem.js';
import { ChannelStorage } from '../../storage/channel.js';
import { openVolume, materializeVolume } from '../../domain/volume.js';
import { storeData, deleteFile, retrieveData } from '../../domain/operations.js';
import { createSecret } from '../../types/keys.js';
import { defaultPathMapper } from '../../types/storage.js';

const TEST_DATA_DIR = './test-data-deletion';

describe('Deletion Semantics', () => {
  beforeEach(async () => {
    // Clean up test data directory
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  it('should remove file from materialized view when deleted', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    // Create volume and add file
    const volume = await openVolume(secret, crypto, storage);
    const testData = new TextEncoder().encode('Test content');
    await storeData(testData, 'test.txt', secret, crypto, channelStorage);

    // Verify file exists
    let state = await materializeVolume(volume, channelStorage, crypto);
    expect(state.files.has('test.txt')).toBe(true);

    // Delete file
    await deleteFile('test.txt', secret, crypto, channelStorage);

    // Verify file is gone from materialized view
    state = await materializeVolume(volume, channelStorage, crypto);
    expect(state.files.has('test.txt')).toBe(false);
    expect(state.files.size).toBe(0);
  });

  it('should not delete encrypted data block when file is deleted', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    // Create volume and add file
    await openVolume(secret, crypto, storage);
    const testData = new TextEncoder().encode('Test content');
    const { dataHash } = await storeData(testData, 'test.txt', secret, crypto, channelStorage);

    // Verify data block exists
    const dataPath = `blocks/${dataHash}.bin`;
    expect(await storage.exists(dataPath)).toBe(true);

    // Delete file
    await deleteFile('test.txt', secret, crypto, channelStorage);

    // Data block should still exist (content-addressed storage)
    expect(await storage.exists(dataPath)).toBe(true);
  });

  it('should be idempotent (deleting non-existent file is no-op)', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    // Create volume
    const volume = await openVolume(secret, crypto, storage);

    // Delete non-existent file (should not throw)
    await expect(deleteFile('nonexistent.txt', secret, crypto, channelStorage)).resolves.not.toThrow();

    // Materialize - should still be empty
    const state = await materializeVolume(volume, channelStorage, crypto);
    expect(state.files.size).toBe(0);
  });

  it('should allow retrieving file by event hash even after deletion', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    // Create volume and add file
    const volume = await openVolume(secret, crypto, storage);
    const testData = new TextEncoder().encode('Test content');
    const { eventHash } = await storeData(testData, 'test.txt', secret, crypto, channelStorage);

    // Delete file from materialized view
    await deleteFile('test.txt', secret, crypto, channelStorage);

    // File should be gone from materialized view
    const state = await materializeVolume(volume, channelStorage, crypto);
    expect(state.files.has('test.txt')).toBe(false);

    // But we can still retrieve by event hash (event still exists)
    const retrievedData = await retrieveData(eventHash, secret, crypto, channelStorage);
    expect(retrievedData).toEqual(testData);
  });

  it('should handle delete then recreate with same name', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    // Create volume
    const volume = await openVolume(secret, crypto, storage);

    // Add file
    await storeData(new TextEncoder().encode('Original'), 'file.txt', secret, crypto, channelStorage);
    let state = await materializeVolume(volume, channelStorage, crypto);
    expect(state.files.has('file.txt')).toBe(true);

    // Delete file
    await deleteFile('file.txt', secret, crypto, channelStorage);
    state = await materializeVolume(volume, channelStorage, crypto);
    expect(state.files.has('file.txt')).toBe(false);

    // Recreate with same name
    await storeData(new TextEncoder().encode('Recreated'), 'file.txt', secret, crypto, channelStorage);
    state = await materializeVolume(volume, channelStorage, crypto);
    expect(state.files.has('file.txt')).toBe(true);
    expect(state.files.size).toBe(1);
  });

  it('should handle multiple deletions of same file', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    // Create volume and add file
    const volume = await openVolume(secret, crypto, storage);
    await storeData(new TextEncoder().encode('Content'), 'file.txt', secret, crypto, channelStorage);

    // Delete multiple times
    await deleteFile('file.txt', secret, crypto, channelStorage);
    await deleteFile('file.txt', secret, crypto, channelStorage);
    await deleteFile('file.txt', secret, crypto, channelStorage);

    // File should be gone
    const state = await materializeVolume(volume, channelStorage, crypto);
    expect(state.files.has('file.txt')).toBe(false);
    expect(state.files.size).toBe(0);
  });

  it('should create DELETE_FILE event with correct structure', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    // Create volume
    await openVolume(secret, crypto, storage);

    // Delete file (creates DELETE_FILE event)
    const { eventHash } = await deleteFile('test.txt', secret, crypto, channelStorage);

    // Retrieve event and verify it's a DELETE_FILE event
    const signedEvent = await channelStorage.retrieveEvent(volume.publicKey, eventHash);
    expect(signedEvent.payload.type).toBe('DELETE_FILE');
    expect(signedEvent.payload.fileName).toBe('test.txt');
  });
});
