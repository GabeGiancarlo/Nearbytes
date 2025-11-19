import type { SignedEvent, SerializedEvent, EventPayload } from '../types/events.js';
import { createHash, createEncryptedData, createSignature } from '../types/events.js';
import { bytesToBase64, base64ToBytes } from '../utils/encoding.js';

/**
 * Serializes a signed event to JSON-serializable format
 * @param event - Signed event to serialize
 * @returns Serialized event
 */
export function serializeEvent(event: SignedEvent): SerializedEvent {
  return {
    payload: {
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
  return {
    payload: {
      hash: createHash(data.payload.hash),
      encryptedKey: createEncryptedData(base64ToBytes(data.payload.encryptedKey)),
    },
    signature: createSignature(base64ToBytes(data.signature)),
  };
}

/**
 * Serializes an event payload to bytes for hashing/signing
 * @param payload - Event payload
 * @returns Serialized bytes
 */
export function serializeEventPayload(payload: EventPayload): Uint8Array {
  // Format: hash (64 bytes as hex string) + encryptedKey length (4 bytes) + encryptedKey
  const hashBytes = new TextEncoder().encode(payload.hash);
  const keyLength = new Uint8Array(4);
  const view = new DataView(keyLength.buffer);
  view.setUint32(0, payload.encryptedKey.length, false); // big-endian
  
  const result = new Uint8Array(hashBytes.length + 4 + payload.encryptedKey.length);
  result.set(hashBytes, 0);
  result.set(keyLength, hashBytes.length);
  result.set(payload.encryptedKey, hashBytes.length + 4);
  
  return result;
}

/**
 * Deserializes an event payload from bytes
 * @param data - Serialized bytes
 * @returns Event payload
 */
export function deserializeEventPayload(data: Uint8Array): EventPayload {
  if (data.length < 36) {
    throw new Error('Invalid event payload: too short');
  }
  
  const hashBytes = data.slice(0, 64);
  const hash = new TextDecoder().decode(hashBytes);
  
  const view = new DataView(data.buffer, data.byteOffset + 64, 4);
  const keyLength = view.getUint32(0, false); // big-endian
  
  if (data.length < 64 + 4 + keyLength) {
    throw new Error('Invalid event payload: encrypted key length mismatch');
  }
  
  const encryptedKey = data.slice(64 + 4, 64 + 4 + keyLength);
  
  return {
    hash: createHash(hash),
    encryptedKey: createEncryptedData(encryptedKey),
  };
}

