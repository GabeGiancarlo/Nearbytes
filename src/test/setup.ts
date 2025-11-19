/**
 * Test setup file
 * Ensures Web Crypto API is available in test environment
 */
import { webcrypto } from 'crypto';

// Make Web Crypto API available globally for tests
if (!globalThis.crypto) {
  (globalThis as { crypto: Crypto }).crypto = webcrypto as Crypto;
}

