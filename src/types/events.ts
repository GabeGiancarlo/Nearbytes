import { ValidationError } from './errors.js';

/**
 * Branded type for SHA-256 hashes (64-character hex string)
 */
export type Hash = string & { readonly __brand: 'Hash' };

/**
 * Branded type for encrypted data
 */
export type EncryptedData = Uint8Array & { readonly __brand: 'EncryptedData' };

/**
 * Branded type for cryptographic signatures
 */
export type Signature = Uint8Array & { readonly __brand: 'Signature' };

/**
 * Creates a hash from a hex string with validation
 * @param hex - 64-character hexadecimal string
 * @returns Branded Hash
 * @throws InvalidHashError if hex string is invalid
 */
export function createHash(hex: string): Hash {
  const normalized = hex.toLowerCase().trim();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new InvalidHashError(
      `Hash must be 64-character hex string, got: ${hex.substring(0, 20)}...`
    );
  }
  return normalized as Hash;
}

/**
 * Creates encrypted data from a byte array
 * @param bytes - Encrypted bytes
 * @returns Branded EncryptedData
 */
export function createEncryptedData(bytes: Uint8Array): EncryptedData {
  return bytes as EncryptedData;
}

/**
 * Creates a signature from a byte array
 * @param bytes - Signature bytes
 * @returns Branded Signature
 */
export function createSignature(bytes: Uint8Array): Signature {
  return bytes as Signature;
}

/**
 * Event payload structure containing hash and encrypted key
 */
export interface EventPayload {
  readonly hash: Hash;
  readonly encryptedKey: EncryptedData;
}

/**
 * Signed event structure containing payload and signature
 */
export interface SignedEvent {
  readonly payload: EventPayload;
  readonly signature: Signature;
}

/**
 * JSON-serializable event format
 */
export interface SerializedEvent {
  readonly payload: {
    readonly hash: string;
    readonly encryptedKey: string; // Base64
  };
  readonly signature: string; // Base64
}

/**
 * Error thrown when a hash is invalid
 */
export class InvalidHashError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidHashError';
  }
}

