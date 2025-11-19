import type { PublicKey } from './keys.js';

/**
 * Storage backend interface for abstracting file operations
 */
export interface StorageBackend {
  /**
   * Write data to a file path
   * @param path - File path
   * @param data - Data to write
   */
  writeFile(path: string, data: Uint8Array): Promise<void>;

  /**
   * Read data from a file path
   * @param path - File path
   * @returns File contents
   */
  readFile(path: string): Promise<Uint8Array>;

  /**
   * List all files in a directory
   * @param directory - Directory path
   * @returns Array of file paths
   */
  listFiles(directory: string): Promise<string[]>;

  /**
   * Create a directory (and parent directories if needed)
   * @param path - Directory path
   */
  createDirectory(path: string): Promise<void>;

  /**
   * Check if a path exists
   * @param path - Path to check
   * @returns True if path exists
   */
  exists(path: string): Promise<boolean>;
}

/**
 * Function type for mapping public keys to channel directory paths
 */
export type ChannelPathMapper = (publicKey: PublicKey) => string;

/**
 * Default path mapper: converts public key to hex string
 * @param publicKey - Channel public key
 * @returns Hex string representation of the public key
 */
export function defaultPathMapper(publicKey: PublicKey): string {
  return Array.from(publicKey)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

