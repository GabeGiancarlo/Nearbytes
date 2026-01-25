import type { Secret } from '../types/keys.js';
import { createSecret } from '../types/keys.js';
import type { CryptoOperations } from '../crypto/index.js';
import type { StorageBackend, ChannelPathMapper } from '../types/storage.js';
import type { EventPayload, Hash } from '../types/events.js';
import { createEncryptedData, EMPTY_HASH, EventType } from '../types/events.js';
import { createCryptoOperations } from '../crypto/index.js';
import { FilesystemStorageBackend } from '../storage/filesystem.js';
import { ChannelStorage } from '../storage/channel.js';
import { defaultPathMapper } from '../types/storage.js';
import { serializeEventPayload } from '../storage/serialization.js';
import { openVolume, loadEventLog, verifyEventLog } from './volume.js';
import type { FileEvent, FileMetadata } from './fileEvents.js';
import { reconstructFileState } from './fileState.js';
import { isFileEvent } from './fileEventCodec.js';

export interface FileServiceDependencies {
  crypto: CryptoOperations;
  storage: StorageBackend;
  pathMapper?: ChannelPathMapper;
  now?: () => number;
}

export interface FileService {
  addFile(
    secret: string,
    filename: string,
    data: Buffer,
    mimeType?: string
  ): Promise<FileMetadata>;
  deleteFile(secret: string, filename: string): Promise<void>;
  listFiles(secret: string): Promise<FileMetadata[]>;
  getFile(secret: string, blobHash: string): Promise<Buffer>;
}

/**
 * Creates a dependency-injected file service for testing or custom storage.
 * @param dependencies - Crypto, storage, and optional path mapper/time source
 * @returns File service implementation
 */
export function createFileService(dependencies: FileServiceDependencies): FileService {
  const pathMapper = dependencies.pathMapper ?? defaultPathMapper;
  const channelStorage = new ChannelStorage(dependencies.storage, pathMapper);
  const now = dependencies.now ?? (() => Date.now());

  return {
    addFile: async (secret, filename, data, mimeType) =>
      addFileWithDeps(
        secret,
        filename,
        data,
        mimeType,
        dependencies.crypto,
        dependencies.storage,
        channelStorage,
        pathMapper,
        now
      ),
    deleteFile: async (secret, filename) =>
      deleteFileWithDeps(
        secret,
        filename,
        dependencies.crypto,
        dependencies.storage,
        channelStorage,
        pathMapper,
        now
      ),
    listFiles: async (secret) =>
      listFilesWithDeps(secret, dependencies.crypto, dependencies.storage, channelStorage, pathMapper),
    getFile: async (secret, blobHash) =>
      getFileWithDeps(secret, blobHash, dependencies.crypto, channelStorage),
  };
}

/**
 * Adds a file to the secret-derived channel.
 * @param secret - Channel secret used for deterministic key derivation
 * @param filename - Logical filename within the channel
 * @param data - Plaintext file contents
 * @param mimeType - Optional MIME type
 * @returns File metadata for the created file
 */
export async function addFile(
  secret: string,
  filename: string,
  data: Buffer,
  mimeType?: string
): Promise<FileMetadata> {
  const service = getDefaultFileService();
  return service.addFile(secret, filename, data, mimeType);
}

/**
 * Appends a delete event for a file in the secret-derived channel.
 * @param secret - Channel secret used for deterministic key derivation
 * @param filename - Logical filename to delete
 */
export async function deleteFile(secret: string, filename: string): Promise<void> {
  const service = getDefaultFileService();
  return service.deleteFile(secret, filename);
}

/**
 * Lists the current file set by replaying the channel event log.
 * @param secret - Channel secret used for deterministic key derivation
 * @returns Array of file metadata sorted by creation time
 */
export async function listFiles(secret: string): Promise<FileMetadata[]> {
  const service = getDefaultFileService();
  return service.listFiles(secret);
}

/**
 * Retrieves and decrypts a file blob by its encrypted blob hash.
 * @param secret - Channel secret used for deterministic key derivation
 * @param blobHash - Hash of the encrypted blob to retrieve
 * @returns Decrypted file contents
 */
export async function getFile(secret: string, blobHash: string): Promise<Buffer> {
  const service = getDefaultFileService();
  return service.getFile(secret, blobHash);
}

function getDefaultFileService(): FileService {
  if (!defaultFileService) {
    defaultFileService = createFileService({
      crypto: createCryptoOperations(),
      storage: new FilesystemStorageBackend('./nearbytes-storage'),
      pathMapper: defaultPathMapper,
    });
  }
  return defaultFileService;
}

let defaultFileService: FileService | null = null;

async function addFileWithDeps(
  secret: string,
  filename: string,
  data: Buffer,
  mimeType: string | undefined,
  crypto: CryptoOperations,
  storage: StorageBackend,
  channelStorage: ChannelStorage,
  pathMapper: ChannelPathMapper,
  now: () => number
): Promise<FileMetadata> {
  assertNonEmptyFilename(filename);
  const normalizedSecret = normalizeSecret(secret);
  await openVolume(normalizedSecret, crypto, storage, pathMapper);

  const keyPair = await crypto.deriveKeys(normalizedSecret);
  const symmetricKey = await crypto.deriveSymKey(keyPair.privateKey);
  const encryptedData = await crypto.encryptSym(data, symmetricKey);
  const blobHash = await crypto.computeHash(encryptedData);
  await channelStorage.storeEncryptedData(blobHash, encryptedData, true);

  const createdAt = now();
  const payload: EventPayload = {
    type: EventType.CREATE_FILE,
    fileName: filename,
    hash: blobHash,
    encryptedKey: createEncryptedData(new Uint8Array(0)),
    size: data.length,
    mimeType,
    createdAt,
  };

  const payloadBytes = serializeEventPayload(payload);
  const signature = await crypto.signPR(payloadBytes, keyPair.privateKey);
  await channelStorage.storeEvent(keyPair.publicKey, { payload, signature });

  return {
    filename,
    blobHash,
    size: data.length,
    mimeType,
    createdAt,
  };
}

async function deleteFileWithDeps(
  secret: string,
  filename: string,
  crypto: CryptoOperations,
  storage: StorageBackend,
  channelStorage: ChannelStorage,
  pathMapper: ChannelPathMapper,
  now: () => number
): Promise<void> {
  assertNonEmptyFilename(filename);
  const normalizedSecret = normalizeSecret(secret);
  await openVolume(normalizedSecret, crypto, storage, pathMapper);

  const keyPair = await crypto.deriveKeys(normalizedSecret);
  const deletedAt = now();
  const payload: EventPayload = {
    type: EventType.DELETE_FILE,
    fileName: filename,
    hash: EMPTY_HASH,
    encryptedKey: createEncryptedData(new Uint8Array(0)),
    deletedAt,
  };

  const payloadBytes = serializeEventPayload(payload);
  const signature = await crypto.signPR(payloadBytes, keyPair.privateKey);
  await channelStorage.storeEvent(keyPair.publicKey, { payload, signature });
}

async function listFilesWithDeps(
  secret: string,
  crypto: CryptoOperations,
  storage: StorageBackend,
  channelStorage: ChannelStorage,
  pathMapper: ChannelPathMapper
): Promise<FileMetadata[]> {
  const volume = await openVolume(normalizeSecret(secret), crypto, storage, pathMapper);
  const entries = await loadEventLog(volume, channelStorage);
  await verifyEventLog(entries, volume, crypto);

  const fileEvents: FileEvent[] = [];
  for (const entry of entries) {
    const fileEvent = mapPayloadToFileEvent(entry.signedEvent.payload);
    if (fileEvent) {
      fileEvents.push(fileEvent);
    }
  }

  const state = reconstructFileState(fileEvents);
  const files = Array.from(state.values());
  files.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    if (a.filename < b.filename) return -1;
    if (a.filename > b.filename) return 1;
    return 0;
  });

  return files;
}

async function getFileWithDeps(
  secret: string,
  blobHash: string,
  crypto: CryptoOperations,
  channelStorage: ChannelStorage
): Promise<Buffer> {
  const keyPair = await crypto.deriveKeys(normalizeSecret(secret));
  const symmetricKey = await crypto.deriveSymKey(keyPair.privateKey);
  const encryptedData = await channelStorage.retrieveEncryptedData(blobHash as Hash);
  const plaintext = await crypto.decryptSym(encryptedData, symmetricKey);
  return Buffer.from(plaintext);
}

function mapPayloadToFileEvent(payload: EventPayload): FileEvent | null {
  if (payload.type === EventType.CREATE_FILE) {
    if (payload.size === undefined || payload.createdAt === undefined) {
      return null;
    }
    const event: FileEvent = {
      type: 'CREATE_FILE',
      filename: payload.fileName,
      blobHash: payload.hash,
      size: payload.size,
      mimeType: payload.mimeType,
      createdAt: payload.createdAt,
    };
    return isFileEvent(event) ? event : null;
  }

  if (payload.type === EventType.DELETE_FILE) {
    if (payload.deletedAt === undefined) {
      return null;
    }
    const event: FileEvent = {
      type: 'DELETE_FILE',
      filename: payload.fileName,
      deletedAt: payload.deletedAt,
    };
    return isFileEvent(event) ? event : null;
  }

  return null;
}

function assertNonEmptyFilename(filename: string): void {
  if (!filename || filename.trim().length === 0) {
    throw new Error('File name cannot be empty');
  }
}

function normalizeSecret(secret: string): Secret {
  return createSecret(secret);
}
