import type { PublicKey, Hash, EncryptedData } from '../types/keys.js';
import type { Hash as HashType, SignedEvent } from '../types/events.js';
import type { StorageBackend, ChannelPathMapper } from '../types/storage.js';
import { createHash } from '../types/events.js';
import { StorageError } from '../types/errors.js';
import { serializeEvent, deserializeEvent, serializeEventPayload } from './serialization.js';
import { bytesToHex } from '../utils/encoding.js';
import { computeHash } from '../crypto/hash.js';

/**
 * Channel storage operations
 * Handles storing and retrieving events and encrypted data blocks
 */
export class ChannelStorage {
  constructor(
    private readonly storage: StorageBackend,
    private readonly pathMapper: ChannelPathMapper
  ) {}

  /**
   * Gets the channel directory path for a public key
   */
  private getChannelPath(publicKey: PublicKey): string {
    return this.pathMapper(publicKey);
  }

  /**
   * Gets the path for an event file
   */
  private getEventPath(publicKey: PublicKey, eventHash: HashType): string {
    const channelPath = this.getChannelPath(publicKey);
    return `${channelPath}/${eventHash}.bin`;
  }

  /**
   * Gets the path for an encrypted data block
   */
  private getDataPath(dataHash: HashType): string {
    return `data/${dataHash}.bin`;
  }

  /**
   * Stores a signed event in the channel
   * @param publicKey - Channel public key
   * @param event - Signed event to store
   * @returns Event hash
   */
  async storeEvent(publicKey: PublicKey, event: SignedEvent): Promise<HashType> {
    try {
      // Compute event hash from serialized payload
      const payloadBytes = serializeEventPayload(event.payload);
      const eventHash = await computeHash(payloadBytes);

      // Serialize the full event
      const serialized = serializeEvent(event);
      const eventBytes = new TextEncoder().encode(JSON.stringify(serialized));

      // Store event file
      const eventPath = this.getEventPath(publicKey, eventHash);
      await this.storage.writeFile(eventPath, eventBytes);

      return eventHash;
    } catch (error) {
      throw new StorageError(
        `Failed to store event: ${error instanceof Error ? error.message : 'unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Retrieves a signed event from the channel
   * @param publicKey - Channel public key
   * @param eventHash - Event hash
   * @returns Signed event
   */
  async retrieveEvent(publicKey: PublicKey, eventHash: HashType): Promise<SignedEvent> {
    try {
      const eventPath = this.getEventPath(publicKey, eventHash);
      const eventBytes = await this.storage.readFile(eventPath);
      const serialized = JSON.parse(new TextDecoder().decode(eventBytes)) as {
        payload: { hash: string; encryptedKey: string };
        signature: string;
      };

      return deserializeEvent(serialized);
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Failed to retrieve event: ${error instanceof Error ? error.message : 'unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Lists all events in a channel
   * @param publicKey - Channel public key
   * @returns Array of event hashes
   */
  async listEvents(publicKey: PublicKey): Promise<HashType[]> {
    try {
      const channelPath = this.getChannelPath(publicKey);
      const files = await this.storage.listFiles(channelPath);
      
      // Filter for .bin files and extract hashes
      const eventHashes = files
        .filter((file) => file.endsWith('.bin'))
        .map((file) => file.slice(0, -4)) // Remove .bin extension
        .map((hash) => createHash(hash));

      return eventHashes;
    } catch (error) {
      throw new StorageError(
        `Failed to list events: ${error instanceof Error ? error.message : 'unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Stores an encrypted data block
   * @param dataHash - Hash of the encrypted data
   * @param encryptedData - Encrypted data to store
   */
  async storeEncryptedData(dataHash: HashType, encryptedData: EncryptedData): Promise<void> {
    try {
      const dataPath = this.getDataPath(dataHash);
      await this.storage.writeFile(dataPath, encryptedData);
    } catch (error) {
      throw new StorageError(
        `Failed to store encrypted data: ${error instanceof Error ? error.message : 'unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Retrieves an encrypted data block
   * @param dataHash - Hash of the encrypted data
   * @returns Encrypted data
   */
  async retrieveEncryptedData(dataHash: HashType): Promise<EncryptedData> {
    try {
      const dataPath = this.getDataPath(dataHash);
      const data = await this.storage.readFile(dataPath);
      return data as EncryptedData;
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Failed to retrieve encrypted data: ${error instanceof Error ? error.message : 'unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }
}

