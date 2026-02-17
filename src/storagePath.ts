/**
 * Default storage directory resolution. The app uses only the MEGA cloud-synced
 * path when NEARBYTES_STORAGE_DIR is unset.
 */

import path from 'path';
import os from 'os';

/** Standard MEGA sync path: MEGA → NearbytesStorage → blocks, channels (single folder, no nesting). */
const DEFAULT_MEGA_STORAGE_DIR = path.join(os.homedir(), 'MEGA', 'NearbytesStorage');

/**
 * Returns the storage root directory. If NEARBYTES_STORAGE_DIR is set, uses that;
 * otherwise uses the standard MEGA path ($HOME/MEGA/NearbytesStorage). All data
 * goes to this cloud-synced folder.
 */
export function getDefaultStorageDir(): string {
  if (typeof process !== 'undefined' && process.env?.NEARBYTES_STORAGE_DIR) {
    return process.env.NEARBYTES_STORAGE_DIR;
  }
  return DEFAULT_MEGA_STORAGE_DIR;
}
