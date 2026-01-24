import type { SignedEvent, SerializedEvent, EventPayload } from '../types/events.js';
import { createHash, createEncryptedData, createSignature, EventType } from '../types/events.js';
import { bytesToBase64, base64ToBytes } from '../utils/encoding.js';

/**
 * Serializes a signed event to JSON-serializable format
 * @param event - Signed event to serialize
 * @returns Serialized event
 */
export function serializeEvent(event: SignedEvent): SerializedEvent {
  const payload: SerializedEvent['payload'] = {
    type: event.payload.type,
    fileName: event.payload.fileName,
    hash: event.payload.hash,
    encryptedKey: bytesToBase64(event.payload.encryptedKey),
  };

  if (event.payload.size !== undefined) {
    payload.size = event.payload.size;
  }
  if (event.payload.mimeType !== undefined) {
    payload.mimeType = event.payload.mimeType;
  }
  if (event.payload.createdAt !== undefined) {
    payload.createdAt = event.payload.createdAt;
  }
  if (event.payload.deletedAt !== undefined) {
    payload.deletedAt = event.payload.deletedAt;
  }

  return {
    payload,
    signature: bytesToBase64(event.signature),
  };
}

/**
 * Deserializes a signed event from JSON format
 * @param data - Serialized event data
 * @returns Signed event
 */
export function deserializeEvent(data: SerializedEvent): SignedEvent {
  // Validate event type
  if (data.payload.type !== EventType.CREATE_FILE && data.payload.type !== EventType.DELETE_FILE) {
    throw new Error(`Invalid event type: ${data.payload.type}`);
  }
  if (data.payload.size !== undefined) {
    assertFiniteUint(data.payload.size, 'size');
  }
  if (data.payload.createdAt !== undefined) {
    assertFiniteUint(data.payload.createdAt, 'createdAt');
  }
  if (data.payload.deletedAt !== undefined) {
    assertFiniteUint(data.payload.deletedAt, 'deletedAt');
  }
  if (data.payload.mimeType !== undefined && typeof data.payload.mimeType !== 'string') {
    throw new Error('Invalid mimeType: must be a string');
  }

  return {
    payload: {
      type: data.payload.type as EventType,
      fileName: data.payload.fileName,
      hash: createHash(data.payload.hash),
      encryptedKey: createEncryptedData(base64ToBytes(data.payload.encryptedKey)),
      size: data.payload.size,
      mimeType: data.payload.mimeType,
      createdAt: data.payload.createdAt,
      deletedAt: data.payload.deletedAt,
    },
    signature: createSignature(base64ToBytes(data.signature)),
  };
}

/**
 * Serializes an event payload to bytes for hashing/signing
 * 
 * Format (big-endian):
 * - eventType: 1 byte (0 = CREATE_FILE, 1 = DELETE_FILE)
 * - fileNameLength: 4 bytes (uint32)
 * - fileName: N bytes (UTF-8)
 * - hash: 64 bytes (hex string)
 * - encryptedKeyLength: 4 bytes (uint32)
 * - encryptedKey: N bytes
 * 
 * @param payload - Event payload
 * @returns Serialized bytes
 */
export function serializeEventPayload(payload: EventPayload): Uint8Array {
  const hasMetadata =
    payload.size !== undefined ||
    payload.mimeType !== undefined ||
    payload.createdAt !== undefined ||
    payload.deletedAt !== undefined;

  const eventTypeByte = payload.type === EventType.CREATE_FILE ? 0 : 1;
  const fileNameBytes = new TextEncoder().encode(payload.fileName);
  const fileNameLength = new Uint8Array(4);
  const fileNameLengthView = new DataView(fileNameLength.buffer);
  fileNameLengthView.setUint32(0, fileNameBytes.length, false); // big-endian

  const hashBytes = new TextEncoder().encode(payload.hash);
  const keyLength = new Uint8Array(4);
  const keyLengthView = new DataView(keyLength.buffer);
  keyLengthView.setUint32(0, payload.encryptedKey.length, false); // big-endian

  const metadataBytes = hasMetadata ? serializeMetadata(payload) : new Uint8Array(0);
  const totalLength =
    1 + 4 + fileNameBytes.length + hashBytes.length + 4 + payload.encryptedKey.length + metadataBytes.length;
  const result = new Uint8Array(totalLength);
  let offset = 0;

  // Event type
  result[offset++] = eventTypeByte;

  // File name length + file name
  result.set(fileNameLength, offset);
  offset += 4;
  result.set(fileNameBytes, offset);
  offset += fileNameBytes.length;

  // Hash
  result.set(hashBytes, offset);
  offset += hashBytes.length;

  // Encrypted key length + encrypted key
  result.set(keyLength, offset);
  offset += 4;
  result.set(payload.encryptedKey, offset);
  offset += payload.encryptedKey.length;

  // Optional metadata
  if (metadataBytes.length > 0) {
    result.set(metadataBytes, offset);
  }

  return result;
}

/**
 * Deserializes an event payload from bytes
 * @param data - Serialized bytes
 * @returns Event payload
 */
export function deserializeEventPayload(data: Uint8Array): EventPayload {
  if (data.length < 1 + 4 + 64 + 4) {
    throw new Error('Invalid event payload: too short');
  }

  let offset = 0;

  // Event type
  const eventTypeByte = data[offset++];
  const type = eventTypeByte === 0 ? EventType.CREATE_FILE : EventType.DELETE_FILE;

  // File name length + file name
  const fileNameLengthView = new DataView(data.buffer, data.byteOffset + offset, 4);
  const fileNameLength = fileNameLengthView.getUint32(0, false); // big-endian
  offset += 4;

  if (data.length < offset + fileNameLength) {
    throw new Error('Invalid event payload: file name length mismatch');
  }

  const fileNameBytes = data.slice(offset, offset + fileNameLength);
  const fileName = new TextDecoder().decode(fileNameBytes);
  offset += fileNameLength;

  // Hash
  if (data.length < offset + 64) {
    throw new Error('Invalid event payload: hash missing');
  }
  const hashBytes = data.slice(offset, offset + 64);
  const hash = new TextDecoder().decode(hashBytes);
  offset += 64;

  // Encrypted key length + encrypted key
  const keyLengthView = new DataView(data.buffer, data.byteOffset + offset, 4);
  const keyLength = keyLengthView.getUint32(0, false); // big-endian
  offset += 4;

  if (data.length < offset + keyLength) {
    throw new Error('Invalid event payload: encrypted key length mismatch');
  }

  const encryptedKey = data.slice(offset, offset + keyLength);
  offset += keyLength;

  const metadata = offset < data.length ? deserializeMetadata(data, offset, type) : {};
  if (metadata.bytesConsumed && offset + metadata.bytesConsumed !== data.length) {
    throw new Error('Invalid event payload: extra bytes after metadata');
  }

  return {
    type,
    fileName,
    hash: createHash(hash),
    encryptedKey: createEncryptedData(encryptedKey),
    size: metadata.size,
    mimeType: metadata.mimeType,
    createdAt: metadata.createdAt,
    deletedAt: metadata.deletedAt,
  };
}

function assertFiniteUint(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${fieldName}: must be a non-negative integer`);
  }
}

function serializeMetadata(payload: EventPayload): Uint8Array {
  const metadataVersion = 1;

  if (payload.type === EventType.CREATE_FILE) {
    if (payload.size === undefined) {
      throw new Error('Missing size for CREATE_FILE metadata');
    }
    if (payload.createdAt === undefined) {
      throw new Error('Missing createdAt for CREATE_FILE metadata');
    }
    assertFiniteUint(payload.size, 'size');
    assertFiniteUint(payload.createdAt, 'createdAt');

    const mimeTypeBytes = payload.mimeType ? new TextEncoder().encode(payload.mimeType) : new Uint8Array(0);
    const mimeTypeLength = new Uint8Array(4);
    const mimeTypeLengthView = new DataView(mimeTypeLength.buffer);
    mimeTypeLengthView.setUint32(0, mimeTypeBytes.length, false); // big-endian

    const metadata = new Uint8Array(1 + 8 + 8 + 4 + mimeTypeBytes.length);
    const view = new DataView(metadata.buffer, metadata.byteOffset, metadata.byteLength);

    metadata[0] = metadataVersion;
    writeUint64(view, 1, payload.size);
    writeUint64(view, 1 + 8, payload.createdAt);
    metadata.set(mimeTypeLength, 1 + 8 + 8);
    metadata.set(mimeTypeBytes, 1 + 8 + 8 + 4);

    return metadata;
  }

  if (payload.type === EventType.DELETE_FILE) {
    if (payload.deletedAt === undefined) {
      throw new Error('Missing deletedAt for DELETE_FILE metadata');
    }
    assertFiniteUint(payload.deletedAt, 'deletedAt');

    const metadata = new Uint8Array(1 + 8);
    const view = new DataView(metadata.buffer, metadata.byteOffset, metadata.byteLength);
    metadata[0] = metadataVersion;
    writeUint64(view, 1, payload.deletedAt);
    return metadata;
  }

  return new Uint8Array(0);
}

function deserializeMetadata(
  data: Uint8Array,
  offset: number,
  type: EventType
): {
  size?: number;
  mimeType?: string;
  createdAt?: number;
  deletedAt?: number;
  bytesConsumed?: number;
} {
  if (data.length < offset + 1) {
    throw new Error('Invalid event payload: metadata version missing');
  }

  const metadataVersion = data[offset];
  if (metadataVersion !== 1) {
    throw new Error(`Unsupported metadata version: ${metadataVersion}`);
  }

  if (type === EventType.CREATE_FILE) {
    if (data.length < offset + 1 + 8 + 8 + 4) {
      throw new Error('Invalid event payload: CREATE_FILE metadata too short');
    }

    const view = new DataView(data.buffer, data.byteOffset + offset + 1, data.length - offset - 1);
    const size = readUint64(view, 0, 'size');
    const createdAt = readUint64(view, 8, 'createdAt');

    const mimeTypeLengthView = new DataView(
      data.buffer,
      data.byteOffset + offset + 1 + 8 + 8,
      4
    );
    const mimeTypeLength = mimeTypeLengthView.getUint32(0, false); // big-endian
    const mimeTypeOffset = offset + 1 + 8 + 8 + 4;

    if (data.length < mimeTypeOffset + mimeTypeLength) {
      throw new Error('Invalid event payload: mime type length mismatch');
    }

    const mimeTypeBytes = data.slice(mimeTypeOffset, mimeTypeOffset + mimeTypeLength);
    const mimeType = mimeTypeLength > 0 ? new TextDecoder().decode(mimeTypeBytes) : undefined;

    return {
      size,
      mimeType,
      createdAt,
      bytesConsumed: 1 + 8 + 8 + 4 + mimeTypeLength,
    };
  }

  if (type === EventType.DELETE_FILE) {
    if (data.length < offset + 1 + 8) {
      throw new Error('Invalid event payload: DELETE_FILE metadata too short');
    }
    const view = new DataView(data.buffer, data.byteOffset + offset + 1, 8);
    const deletedAt = readUint64(view, 0, 'deletedAt');
    return {
      deletedAt,
      bytesConsumed: 1 + 8,
    };
  }

  return {};
}

function writeUint64(view: DataView, offset: number, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Value must be a non-negative safe integer');
  }
  view.setBigUint64(offset, BigInt(value), false);
}

function readUint64(view: DataView, offset: number, fieldName: string): number {
  const value = Number(view.getBigUint64(offset, false));
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Invalid ${fieldName}: exceeds safe integer range`);
  }
  return value;
}

