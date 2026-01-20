import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { createCryptoOperations } from '../../crypto/index.js';
import { FilesystemStorageBackend } from '../../storage/filesystem.js';
import { ChannelStorage } from '../../storage/channel.js';
import { storeData, retrieveData } from '../../domain/operations.js';
import { createSecret } from '../../types/keys.js';
import { defaultPathMapper } from '../../types/storage.js';

const TEST_DATA_DIR = './test-data-encryption';

describe('Encryption Correctness', () => {
  beforeEach(async () => {
    // Clean up test data directory
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  it('should encrypt and decrypt data correctly', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    const originalData = new TextEncoder().encode('Test data to encrypt');
    const { eventHash } = await storeData(originalData, 'test.txt', secret, crypto, channelStorage);

    const decryptedData = await retrieveData(eventHash, secret, crypto, channelStorage);
    expect(decryptedData).toEqual(originalData);
  });

  it('should produce different ciphertext for same plaintext (random IV)', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    const originalData = new TextEncoder().encode('Same content');

    // Store same data twice
    const result1 = await storeData(originalData, 'file1.txt', secret, crypto, channelStorage);
    const result2 = await storeData(originalData, 'file2.txt', secret, crypto, channelStorage);

    // Data hashes should be different (different encryption = different ciphertext)
    expect(result1.dataHash).not.toBe(result2.dataHash);
    expect(result1.eventHash).not.toBe(result2.eventHash);

    // But decrypted content should be the same
    const decrypted1 = await retrieveData(result1.eventHash, secret, crypto, channelStorage);
    const decrypted2 = await retrieveData(result2.eventHash, secret, crypto, channelStorage);
    expect(decrypted1).toEqual(originalData);
    expect(decrypted2).toEqual(originalData);
  });

  it('should fail to decrypt with wrong secret', async () => {
    const secret1 = createSecret('test:volume:password1');
    const secret2 = createSecret('test:volume:password2');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    const originalData = new TextEncoder().encode('Secret data');
    const { eventHash } = await storeData(originalData, 'test.txt', secret1, crypto, channelStorage);

    // Try to retrieve with wrong secret (should fail)
    await expect(
      retrieveData(eventHash, secret2, crypto, channelStorage)
    ).rejects.toThrow();
  });

  it('should verify event signatures correctly', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    const originalData = new TextEncoder().encode('Signed data');
    const { eventHash } = await storeData(originalData, 'test.txt', secret, crypto, channelStorage);

    // Retrieve event
    const keyPair = await crypto.deriveKeys(secret);
    const signedEvent = await channelStorage.retrieveEvent(keyPair.publicKey, eventHash);

    // Verify signature
    const { serializeEventPayload } = await import('../../storage/serialization.js');
    const payloadBytes = serializeEventPayload(signedEvent.payload);
    const isValid = await crypto.verifyPU(payloadBytes, signedEvent.signature, keyPair.publicKey);

    expect(isValid).toBe(true);
  });

  it('should handle large files correctly', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    // Create a larger file (1MB)
    const largeData = new Uint8Array(1024 * 1024);
    for (let i = 0; i < largeData.length; i++) {
      largeData[i] = i % 256;
    }

    const { eventHash } = await storeData(largeData, 'large.bin', secret, crypto, channelStorage);
    const decryptedData = await retrieveData(eventHash, secret, crypto, channelStorage);

    expect(decryptedData.length).toBe(largeData.length);
    expect(decryptedData).toEqual(largeData);
  });

  it('should handle empty files correctly', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    const emptyData = new Uint8Array(0);
    const { eventHash } = await storeData(emptyData, 'empty.txt', secret, crypto, channelStorage);
    const decryptedData = await retrieveData(eventHash, secret, crypto, channelStorage);

    expect(decryptedData.length).toBe(0);
    expect(decryptedData).toEqual(emptyData);
  });

  it('should handle binary data correctly', async () => {
    const secret = createSecret('test:volume:password');
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(TEST_DATA_DIR);
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    // Create binary data with all possible byte values
    const binaryData = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      binaryData[i] = i;
    }

    const { eventHash } = await storeData(binaryData, 'binary.bin', secret, crypto, channelStorage);
    const decryptedData = await retrieveData(eventHash, secret, crypto, channelStorage);

    expect(decryptedData.length).toBe(256);
    expect(decryptedData).toEqual(binaryData);
  });
});
