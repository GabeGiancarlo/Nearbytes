/**
 * Default storage directory resolution. At this time the app uses only the MEGA
 * cloud synced path when NEARBYTES_STORAGE_DIR is unset (no fallback to repo-local).
 */

import path from 'path';
import os from 'os';

/** Standard MEGA sync path: MEGA → NearbytesStorage → NearbytesStorage → blocks, channels. */
const DEFAULT_MEGA_STORAGE_DIR = path.join(os.homedir(), 'MEGA', 'NearbytesStorage', 'NearbytesStorage');

/**
 * Returns the storage root directory. If NEARBYTES_STORAGE_DIR is set, uses that;
 * otherwise uses the standard MEGA path ($HOME/MEGA/NearbytesStorage/NearbytesStorage). No fallback
 * to repo-local ./nearbytes-storage.
 */
export function getDefaultStorageDir(): string {
  if (typeof process !== 'undefined' && process.env?.NEARBYTES_STORAGE_DIR) {
    return process.env.NEARBYTES_STORAGE_DIR;
  }
  return DEFAULT_MEGA_STORAGE_DIR;
}
