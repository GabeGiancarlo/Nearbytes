import type { SignedEvent, SerializedEvent, EventPayload } from '../types/events.js';
import { createHash, createEncryptedData, createSignature, EventType } from '../types/events.js';
import { bytesToBase64, base64ToBytes } from '../utils/encoding.js';

/**
 * Serializes a signed event to JSON-serializable format
 * @param event - Signed event to serialize
 * @returns Serialized event
 */
export function serializeEvent(event: SignedEvent): SerializedEvent {
  return {
    payload: {
      type: event.payload.type,
      fileName: event.payload.fileName,
      hash: event.payload.hash,
      encryptedKey: bytesToBase64(event.payload.encryptedKey),
    },
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

  return {
    payload: {
      type: data.payload.type as EventType,
      fileName: data.payload.fileName,
      hash: createHash(data.payload.hash),
      encryptedKey: createEncryptedData(base64ToBytes(data.payload.encryptedKey)),
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
  const eventTypeByte = payload.type === EventType.CREATE_FILE ? 0 : 1;
  const fileNameBytes = new TextEncoder().encode(payload.fileName);
  const fileNameLength = new Uint8Array(4);
  const fileNameLengthView = new DataView(fileNameLength.buffer);
  fileNameLengthView.setUint32(0, fileNameBytes.length, false); // big-endian

  const hashBytes = new TextEncoder().encode(payload.hash);
  const keyLength = new Uint8Array(4);
  const keyLengthView = new DataView(keyLength.buffer);
  keyLengthView.setUint32(0, payload.encryptedKey.length, false); // big-endian

  const totalLength = 1 + 4 + fileNameBytes.length + hashBytes.length + 4 + payload.encryptedKey.length;
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

  return {
    type,
    fileName,
    hash: createHash(hash),
    encryptedKey: createEncryptedData(encryptedKey),
  };
}

