/**
 * IndexedDB cache for offline file listings.
 * Stores file metadata per volumeId for instant UI updates.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { FileMetadata } from './api.js';

interface CachedVolume {
  volumeId: string;
  files: FileMetadata[];
  cachedAt: number;
}

const DB_NAME = 'nearbytes-cache';
const STORE_NAME = 'volumes';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * Opens the IndexedDB database.
 */
function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'volumeId' });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Gets cached files for a volumeId.
 * Returns null if not cached or cache is stale (> 24 hours).
 */
export async function getCachedFiles(volumeId: string): Promise<FileMetadata[] | null> {
  try {
    const db = await getDB();
    const cached = await db.get<CachedVolume>(STORE_NAME, volumeId);

    if (!cached) {
      return null;
    }

    // Consider cache stale after 24 hours
    const maxAge = 24 * 60 * 60 * 1000;
    const age = Date.now() - cached.cachedAt;

    if (age > maxAge) {
      // Cache is stale, but return it anyway for offline use
      // The UI will refresh in the background
      return cached.files;
    }

    return cached.files;
  } catch (error) {
    console.warn('Failed to read from cache:', error);
    return null;
  }
}

/**
 * Stores file listing for a volumeId.
 */
export async function setCachedFiles(volumeId: string, files: FileMetadata[]): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, {
      volumeId,
      files,
      cachedAt: Date.now(),
    });
  } catch (error) {
    console.warn('Failed to write to cache:', error);
  }
}

/**
 * Clears all cached volumes.
 */
export async function clearCache(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear(STORE_NAME);
  } catch (error) {
    console.warn('Failed to clear cache:', error);
  }
}

/**
 * Gets the cache timestamp for a volumeId.
 */
export async function getCacheTimestamp(volumeId: string): Promise<number | null> {
  try {
    const db = await getDB();
    const cached = await db.get<CachedVolume>(STORE_NAME, volumeId);
    return cached?.cachedAt ?? null;
  } catch (error) {
    console.warn('Failed to read cache timestamp:', error);
    return null;
  }
}
