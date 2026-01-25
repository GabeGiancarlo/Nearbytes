import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import type { StorageBackend } from '../types/storage.js';
import { StorageError } from '../types/errors.js';

/**
 * Filesystem-based storage backend implementation
 * Uses Node.js fs/promises for all operations
 */
export class FilesystemStorageBackend implements StorageBackend {
  constructor(private readonly basePath: string) {}

  /**
   * Write data to a file, creating parent directories if needed
   */
  async writeFile(path: string, data: Uint8Array): Promise<void> {
    try {
      const fullPath = join(this.basePath, path);
      const dir = dirname(fullPath);
      
      // Create directory if it doesn't exist
      await fs.mkdir(dir, { recursive: true });
      
      // Write file atomically by writing to temp file first, then renaming
      const tempPath = `${fullPath}.tmp`;
      await fs.writeFile(tempPath, data);
      await fs.rename(tempPath, fullPath);
    } catch (error) {
      throw new StorageError(
        `Failed to write file ${path}: ${error instanceof Error ? error.message : 'unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Read data from a file
   */
  async readFile(path: string): Promise<Uint8Array> {
    try {
      const fullPath = join(this.basePath, path);
      const buffer = await fs.readFile(fullPath);
      return new Uint8Array(buffer);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new StorageError(`File not found: ${path}`, error);
      }
      throw new StorageError(
        `Failed to read file ${path}: ${error instanceof Error ? error.message : 'unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * List all files in a directory
   */
  async listFiles(directory: string): Promise<string[]> {
    try {
      const fullPath = join(this.basePath, directory);
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return []; // Directory doesn't exist, return empty list
      }
      throw new StorageError(
        `Failed to list files in ${directory}: ${error instanceof Error ? error.message : 'unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Create a directory and all parent directories
   */
  async createDirectory(path: string): Promise<void> {
    try {
      const fullPath = join(this.basePath, path);
      await fs.mkdir(fullPath, { recursive: true });
    } catch (error) {
      throw new StorageError(
        `Failed to create directory ${path}: ${error instanceof Error ? error.message : 'unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if a path exists
   */
  async exists(path: string): Promise<boolean> {
    try {
      const fullPath = join(this.basePath, path);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a file at the given path
   * Safe delete: only deletes files, not directories
   * Idempotent: does not throw if file doesn't exist
   */
  async deleteFile(path: string): Promise<void> {
    try {
      const fullPath = join(this.basePath, path);
      await fs.unlink(fullPath);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // File doesn't exist - idempotent operation, no error
        return;
      }
      throw new StorageError(
        `Failed to delete file ${path}: ${error instanceof Error ? error.message : 'unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }
}

