import type { Secret } from '../types/keys.js';
import { createSecret } from '../types/keys.js';
import type { CryptoOperations } from '../crypto/index.js';
import type { StorageBackend, ChannelPathMapper } from '../types/storage.js';
import type { EventPayload, Hash } from '../types/events.js';
import { createEncryptedData, EMPTY_HASH, EventType } from '../types/events.js';
import { createCryptoOperations } from '../crypto/index.js';
import { FilesystemStorageBackend } from '../storage/filesystem.js';
import { ChannelStorage } from '../storage/channel.js';
import { getDefaultStorageDir } from '../storagePath.js';
import { defaultPathMapper } from '../types/storage.js';
import { serializeEventPayload } from '../storage/serialization.js';
import { openVolume, loadEventLog, verifyEventLog } from './volume.js';
import type { FileEvent, FileMetadata } from './fileEvents.js';
import { reconstructFileState } from './fileState.js';
import type { EventLogEntry } from '../types/volume.js';

const SNAPSHOT_FILE_NAME = 'snapshot.latest.json';
const SNAPSHOT_VERSION = 1;

interface StoredVolumeSnapshot {
  version: number;
  generatedAt: number;
  eventCount: number;
  lastEventHash: string | null;
  files: FileMetadata[];
}

export interface SnapshotSummary {
  generatedAt: number;
  eventCount: number;
  fileCount: number;
  lastEventHash: string | null;
}

export interface TimelineEvent {
  eventHash: string;
  type: FileEvent['type'];
  filename: string;
  timestamp: number;
  blobHash?: string;
  size?: number;
  mimeType?: string;
  createdAt?: number;
  deletedAt?: number;
}

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
  computeSnapshot(secret: string): Promise<SnapshotSummary>;
  getTimeline(secret: string): Promise<TimelineEvent[]>;
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
    computeSnapshot: async (secret) =>
      computeSnapshotWithDeps(
        secret,
        dependencies.crypto,
        dependencies.storage,
        channelStorage,
        pathMapper,
        now
      ),
    getTimeline: async (secret) =>
      getTimelineWithDeps(secret, dependencies.crypto, dependencies.storage, channelStorage, pathMapper),
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

/**
 * Computes and persists a point-in-time snapshot of the current volume state.
 * Snapshot generation is explicit (on-demand) and never automatic.
 */
export async function computeSnapshot(secret: string): Promise<SnapshotSummary> {
  const service = getDefaultFileService();
  return service.computeSnapshot(secret);
}

/**
 * Returns a deterministic, chronological timeline of file events for a volume.
 */
export async function getTimeline(secret: string): Promise<TimelineEvent[]> {
  const service = getDefaultFileService();
  return service.getTimeline(secret);
}

function getDefaultFileService(): FileService {
  if (!defaultFileService) {
    const storageDir = getDefaultStorageDir();
    defaultFileService = createFileService({
      crypto: createCryptoOperations(),
      storage: new FilesystemStorageBackend(storageDir),
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
  return materializeFilesFromEntries(entries);
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

async function computeSnapshotWithDeps(
  secret: string,
  crypto: CryptoOperations,
  storage: StorageBackend,
  channelStorage: ChannelStorage,
  pathMapper: ChannelPathMapper,
  now: () => number
): Promise<SnapshotSummary> {
  const volume = await openVolume(normalizeSecret(secret), crypto, storage, pathMapper);
  const entries = await loadEventLog(volume, channelStorage);
  await verifyEventLog(entries, volume, crypto);

  const snapshot: StoredVolumeSnapshot = {
    version: SNAPSHOT_VERSION,
    generatedAt: now(),
    eventCount: entries.length,
    lastEventHash: entries.length > 0 ? entries[entries.length - 1].eventHash : null,
    files: materializeFilesFromEntries(entries),
  };

  const snapshotPath = `${volume.path}/${SNAPSHOT_FILE_NAME}`;
  const snapshotBytes = new TextEncoder().encode(JSON.stringify(snapshot));
  await storage.writeFile(snapshotPath, snapshotBytes);

  return {
    generatedAt: snapshot.generatedAt,
    eventCount: snapshot.eventCount,
    fileCount: snapshot.files.length,
    lastEventHash: snapshot.lastEventHash,
  };
}

async function getTimelineWithDeps(
  secret: string,
  crypto: CryptoOperations,
  storage: StorageBackend,
  channelStorage: ChannelStorage,
  pathMapper: ChannelPathMapper
): Promise<TimelineEvent[]> {
  const volume = await openVolume(normalizeSecret(secret), crypto, storage, pathMapper);
  const entries = await loadEventLog(volume, channelStorage);
  await verifyEventLog(entries, volume, crypto);
  return mapEntriesToTimeline(entries);
}

function materializeFilesFromEntries(entries: EventLogEntry[]): FileMetadata[] {
  const timeline = mapEntriesToTimeline(entries);
  const fileEvents = timelineToFileEvents(timeline);

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

function mapEntriesToTimeline(entries: EventLogEntry[]): TimelineEvent[] {
  const rows: Array<{
    event: TimelineEvent;
    hasExplicitTimestamp: boolean;
    sequence: number;
  }> = [];

  for (let sequence = 0; sequence < entries.length; sequence += 1) {
    const entry = entries[sequence];
    const payload = entry.signedEvent.payload;

    if (payload.type === EventType.CREATE_FILE) {
      const inferredTimestamp = payload.createdAt ?? sequence;
      rows.push({
        sequence,
        hasExplicitTimestamp: payload.createdAt !== undefined,
        event: {
          eventHash: entry.eventHash,
          type: 'CREATE_FILE',
          filename: payload.fileName,
          timestamp: inferredTimestamp,
          blobHash: payload.hash,
          size: payload.size ?? 0,
          mimeType: payload.mimeType,
          createdAt: inferredTimestamp,
        },
      });
      continue;
    }

    if (payload.type === EventType.DELETE_FILE) {
      const inferredTimestamp = payload.deletedAt ?? sequence;
      rows.push({
        sequence,
        hasExplicitTimestamp: payload.deletedAt !== undefined,
        event: {
          eventHash: entry.eventHash,
          type: 'DELETE_FILE',
          filename: payload.fileName,
          timestamp: inferredTimestamp,
          deletedAt: inferredTimestamp,
        },
      });
    }
  }

  rows.sort(compareTimelineRows);
  return rows.map((row) => row.event);
}

function timelineToFileEvents(timeline: TimelineEvent[]): FileEvent[] {
  const fileEvents: FileEvent[] = [];
  for (const event of timeline) {
    if (event.type === 'CREATE_FILE') {
      if (
        event.blobHash === undefined ||
        event.size === undefined ||
        event.createdAt === undefined
      ) {
        continue;
      }
      fileEvents.push({
        type: 'CREATE_FILE',
        filename: event.filename,
        blobHash: event.blobHash,
        size: event.size,
        mimeType: event.mimeType,
        createdAt: event.createdAt,
      });
      continue;
    }
    if (event.deletedAt === undefined) {
      continue;
    }
    fileEvents.push({
      type: 'DELETE_FILE',
      filename: event.filename,
      deletedAt: event.deletedAt,
    });
  }
  return fileEvents;
}

function compareTimelineRows(
  left: { event: TimelineEvent; hasExplicitTimestamp: boolean; sequence: number },
  right: { event: TimelineEvent; hasExplicitTimestamp: boolean; sequence: number }
): number {
  if (left.hasExplicitTimestamp !== right.hasExplicitTimestamp) {
    return left.sequence - right.sequence;
  }

  if (left.hasExplicitTimestamp && right.hasExplicitTimestamp) {
    if (left.event.timestamp !== right.event.timestamp) {
      return left.event.timestamp - right.event.timestamp;
    }
  } else if (left.sequence !== right.sequence) {
    return left.sequence - right.sequence;
  }

  if (left.event.filename < right.event.filename) return -1;
  if (left.event.filename > right.event.filename) return 1;

  const leftTie = left.event.type === 'CREATE_FILE' ? `C:${left.event.blobHash ?? ''}` : 'D';
  const rightTie = right.event.type === 'CREATE_FILE' ? `C:${right.event.blobHash ?? ''}` : 'D';
  if (leftTie < rightTie) return -1;
  if (leftTie > rightTie) return 1;

  if (left.event.eventHash < right.event.eventHash) return -1;
  if (left.event.eventHash > right.event.eventHash) return 1;
  return 0;
}

function assertNonEmptyFilename(filename: string): void {
  if (!filename || filename.trim().length === 0) {
    throw new Error('File name cannot be empty');
  }
}

function normalizeSecret(secret: string): Secret {
  return createSecret(secret);
}
