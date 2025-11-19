import { createSecret } from '../types/keys.js';
import { createHash as createHashType } from '../types/events.js';
import { ValidationError } from '../types/errors.js';
import { readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';

/**
 * Validates a secret string
 */
export function validateSecret(secret: string): import('../types/keys.js').Secret {
  try {
    return createSecret(secret);
  } catch (error) {
    throw new ValidationError(
      `Invalid secret: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Validates a hash string
 */
export function validateHash(hash: string): import('../types/events.js').Hash {
  try {
    return createHashType(hash);
  } catch (error) {
    throw new ValidationError(
      `Invalid hash: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Validates a file path exists and is readable
 */
export async function validateFilePath(filePath: string): Promise<void> {
  if (!existsSync(filePath)) {
    throw new ValidationError(`File not found: ${filePath}`);
  }

  try {
    await readFile(filePath);
  } catch (error) {
    throw new ValidationError(
      `Cannot read file ${filePath}: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Validates output directory exists or can be created
 */
export async function validateOutputPath(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    // Try to create it
    try {
      await mkdir(dir, { recursive: true });
    } catch (error) {
      throw new ValidationError(
        `Cannot create output directory ${dir}: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }
}

