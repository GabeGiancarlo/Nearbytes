import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { createCryptoOperations } from '../../crypto/index.js';
import { FilesystemStorageBackend } from '../../storage/filesystem.js';
import { ChannelStorage } from '../../storage/channel.js';
import { openVolume, materializeVolume, loadEventLog, verifyEventLog, replayEvents } from '../../domain/volume.js';
import { storeData, deleteFile } from '../../domain/operations.js';
import { createSecret } from '../../types/keys.js';
import { defaultPathMapper } from '../../types/storage.js';
import { EventType } from '../../types/events.js';

const TEST_DATA_DIR = './test-data-materialization';

describe('Volume Materialization', () => {
  beforeEach(async () => {
    // Clean up test data directory
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  it('should deterministically replay events in the same order', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    // Open volume
    const volume = await openVolume(secret, crypto, storage);

    // Store multiple files
    const data1 = new TextEncoder().encode('File 1 content');
    const data2 = new TextEncoder().encode('File 2 content');
    const data3 = new TextEncoder().encode('File 3 content');

    await storeData(data1, 'file1.txt', secret, crypto, channelStorage);
    await storeData(data2, 'file2.txt', secret, crypto, channelStorage);
    await storeData(data3, 'file3.txt', secret, crypto, channelStorage);

    // Load and replay events
    const entries1 = await loadEventLog(volume, channelStorage);
    await verifyEventLog(entries1, volume, crypto);
    const state1 = replayEvents(entries1);

    // Load and replay again (should be identical)
    const entries2 = await loadEventLog(volume, channelStorage);
    await verifyEventLog(entries2, volume, crypto);
    const state2 = replayEvents(entries2);

    // States should be identical
    expect(state1.files.size).toBe(state2.files.size);
    expect(state1.files.size).toBe(3);

    // Files should be the same
    const files1 = Array.from(state1.files.values()).sort((a, b) => a.name.localeCompare(b.name));
    const files2 = Array.from(state2.files.values()).sort((a, b) => a.name.localeCompare(b.name));

    expect(files1.map(f => f.name)).toEqual(files2.map(f => f.name));
    expect(files1.map(f => f.contentAddress)).toEqual(files2.map(f => f.contentAddress));
  });

  it('should materialize file system state correctly', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    // Open volume
    const volume = await openVolume(secret, crypto, storage);

    // Store files
    await storeData(new TextEncoder().encode('Content 1'), 'file1.txt', secret, crypto, channelStorage);
    await storeData(new TextEncoder().encode('Content 2'), 'file2.txt', secret, crypto, channelStorage);

    // Materialize
    const fileSystemState = await materializeVolume(volume, channelStorage, crypto);

    // Verify files exist
    expect(fileSystemState.files.size).toBe(2);
    expect(fileSystemState.files.has('file1.txt')).toBe(true);
    expect(fileSystemState.files.has('file2.txt')).toBe(true);
    expect(fileSystemState.files.has('file3.txt')).toBe(false);
  });

  it('should handle DELETE_FILE events correctly', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    // Open volume
    const volume = await openVolume(secret, crypto, storage);

    // Store a file
    await storeData(new TextEncoder().encode('Content'), 'file.txt', secret, crypto, channelStorage);

    // Materialize - file should exist
    let fileSystemState = await materializeVolume(volume, channelStorage, crypto);
    expect(fileSystemState.files.has('file.txt')).toBe(true);

    // Delete the file
    await deleteFile('file.txt', secret, crypto, channelStorage);

    // Materialize again - file should be gone
    fileSystemState = await materializeVolume(volume, channelStorage, crypto);
    expect(fileSystemState.files.has('file.txt')).toBe(false);
    expect(fileSystemState.files.size).toBe(0);
  });

  it('should handle CREATE_FILE after DELETE_FILE (recreate file)', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    // Open volume
    const volume = await openVolume(secret, crypto, storage);

    // Store, delete, then store again
    await storeData(new TextEncoder().encode('Original'), 'file.txt', secret, crypto, channelStorage);
    await deleteFile('file.txt', secret, crypto, channelStorage);
    await storeData(new TextEncoder().encode('Recreated'), 'file.txt', secret, crypto, channelStorage);

    // Materialize - file should exist with new content
    const fileSystemState = await materializeVolume(volume, channelStorage, crypto);
    expect(fileSystemState.files.has('file.txt')).toBe(true);
    expect(fileSystemState.files.size).toBe(1);
  });

  it('should handle multiple DELETE_FILE events (idempotent)', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    // Open volume
    const volume = await openVolume(secret, crypto, storage);

    // Store a file
    await storeData(new TextEncoder().encode('Content'), 'file.txt', secret, crypto, channelStorage);

    // Delete multiple times (should be idempotent)
    await deleteFile('file.txt', secret, crypto, channelStorage);
    await deleteFile('file.txt', secret, crypto, channelStorage);
    await deleteFile('file.txt', secret, crypto, channelStorage);

    // Materialize - file should be gone
    const fileSystemState = await materializeVolume(volume, channelStorage, crypto);
    expect(fileSystemState.files.has('file.txt')).toBe(false);
  });

  it('should verify all event signatures', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    // Open volume
    const volume = await openVolume(secret, crypto, storage);

    // Store files
    await storeData(new TextEncoder().encode('Content 1'), 'file1.txt', secret, crypto, channelStorage);
    await storeData(new TextEncoder().encode('Content 2'), 'file2.txt', secret, crypto, channelStorage);

    // Load and verify events
    const entries = await loadEventLog(volume, channelStorage);
    
    // Should not throw (all signatures valid)
    await expect(verifyEventLog(entries, volume, crypto)).resolves.not.toThrow();

    // All events should be CREATE_FILE
    for (const entry of entries) {
      expect(entry.signedEvent.payload.type).toBe(EventType.CREATE_FILE);
    }
  });

  it('should reconstruct file system from event log and secret', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    // Create volume and add files
    const volume1 = await openVolume(secret, crypto, storage);
    await storeData(new TextEncoder().encode('File 1'), 'file1.txt', secret, crypto, channelStorage);
    await storeData(new TextEncoder().encode('File 2'), 'file2.txt', secret, crypto, channelStorage);
    await deleteFile('file1.txt', secret, crypto, channelStorage);

    // Materialize first time
    const state1 = await materializeVolume(volume1, channelStorage, crypto);

    // Reconstruct from scratch (simulating a new process)
    const volume2 = await openVolume(secret, crypto, storage);
    const state2 = await materializeVolume(volume2, channelStorage, crypto);

    // States should be identical
    expect(state1.files.size).toBe(state2.files.size);
    expect(state1.files.size).toBe(1);
    expect(state2.files.has('file2.txt')).toBe(true);
    expect(state2.files.has('file1.txt')).toBe(false);
  });
});
