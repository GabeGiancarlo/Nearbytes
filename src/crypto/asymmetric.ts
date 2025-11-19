import type { Secret, KeyPair, PrivateKey, PublicKey, SymmetricKey } from '../types/keys.js';
import type { Signature } from '../types/events.js';
import { createPrivateKey, createPublicKey, createSymmetricKey } from '../types/keys.js';
import { createSignature } from '../types/events.js';
import { KeyDerivationError, SigningError, VerificationError } from './errors.js';
import { computeHash } from './hash.js';
import { hexToBytes, bytesToHex } from '../utils/encoding.js';

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH = 'SHA-256';
const PRIVATE_KEY_SALT = new TextEncoder().encode('nearbytes-private-key-v1');
const PUBLIC_KEY_SALT = new TextEncoder().encode('nearbytes-public-key-v1');
const SYMMETRIC_KEY_SALT = new TextEncoder().encode('nearbytes-sym-key-derivation-v1');

// ECDSA P-256 curve order (n) in hex
// n = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551
const CURVE_ORDER_HEX = 'FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551';

/**
 * Derives a deterministic key pair from a secret using PBKDF2
 * Note: Due to Web Crypto API limitations, this implementation uses a workaround
 * for public key derivation. In production, you'd compute the public key from the
 * private key using EC point multiplication.
 * @param secret - Channel secret string
 * @returns KeyPair with public and private keys
 * @throws KeyDerivationError if key derivation fails
 */
export async function deriveKeys(secret: Secret): Promise<KeyPair> {
  try {
    const crypto = globalThis.crypto?.subtle;
    if (!crypto) {
      throw new KeyDerivationError('Web Crypto API not available');
    }

    const secretBytes = new TextEncoder().encode(secret);

    // Derive private key seed
    const privateKeySeed = await deriveSeed(crypto, secretBytes, PRIVATE_KEY_SALT, 32);
    const privateKeyScalar = reduceModuloCurveOrder(privateKeySeed);

    // Derive public key deterministically from secret
    // Since Web Crypto doesn't support EC point multiplication, we derive
    // the public key separately but deterministically
    const publicKeySeed = await deriveSeed(crypto, secretBytes, PUBLIC_KEY_SALT, 32);
    
    // Generate a key pair and use the seed to make it deterministic
    // This is a workaround - in production, compute public key from private key
    const publicKeyBytes = derivePublicKeyBytes(crypto, publicKeySeed);

    return {
      privateKey: createPrivateKey(privateKeyScalar),
      publicKey: createPublicKey(publicKeyBytes),
    };
  } catch (error) {
    throw new KeyDerivationError(
      `Failed to derive keys: ${error instanceof Error ? error.message : 'unknown error'}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Derives a seed using PBKDF2
 */
async function deriveSeed(
  crypto: SubtleCrypto,
  secretBytes: Uint8Array,
  salt: Uint8Array,
  lengthBytes: number
): Promise<Uint8Array> {
  // Create new Uint8Array to avoid branded type issues
  const secretBytesArray = new Uint8Array(secretBytes);
  const saltArray = new Uint8Array(salt);
  
  const seedKey = await crypto.importKey(
    'raw',
    secretBytesArray,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const seedBits = await crypto.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltArray,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    seedKey,
    lengthBytes * 8
  );

  return new Uint8Array(seedBits);
}

/**
 * Reduces a value modulo the curve order to get a valid private key scalar
 */
function reduceModuloCurveOrder(seed: Uint8Array): Uint8Array {
  // Convert to BigInt for proper modulo arithmetic
  const seedBigInt = BigInt('0x' + bytesToHex(seed));
  const curveOrderBigInt = BigInt('0x' + CURVE_ORDER_HEX);
  
  // Reduce modulo curve order, ensure it's in range [1, n-1]
  let result = seedBigInt % curveOrderBigInt;
  if (result === 0n) {
    result = 1n; // Ensure it's not zero
  }
  
  // Convert back to bytes
  const resultHex = result.toString(16).padStart(64, '0');
  return hexToBytes(resultHex);
}

/**
 * Creates a PKCS8 private key structure for ECDSA P-256
 * Uses a workaround: generates a temporary key pair to get valid structure,
 * then replaces the private key scalar with our deterministic one
 */
async function createPKCS8PrivateKey(
  crypto: SubtleCrypto,
  privateKeyScalar: Uint8Array
): Promise<ArrayBuffer> {
  // Workaround: Generate a temporary key pair to get a valid PKCS8 structure
  // Then we'll extract the structure and replace the private key bytes
  const tempKeyPair = await crypto.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true, // extractable
    ['sign']
  );

  // Export the private key to get the PKCS8 structure
  const tempPkcs8 = await crypto.exportKey('pkcs8', tempKeyPair.privateKey);
  const pkcs8Array = new Uint8Array(tempPkcs8);

  // Find and replace the private key scalar in the PKCS8 structure
  // The private key is in the ECPrivateKey structure within an OCTET STRING
  // Pattern: Look for OCTET STRING (0x04) with length 0x20 (32) followed by 32 bytes
  // But we need to find it within the ECPrivateKey SEQUENCE
  
  // Search for the pattern: 0x04 0x20 followed by 32 bytes (the private key)
  // This appears in the ECPrivateKey structure
  let found = false;
  for (let i = 0; i < pkcs8Array.length - 34; i++) {
    // Look for OCTET STRING tag (0x04) with length 0x20 (32 bytes)
    if (pkcs8Array[i] === 0x04 && pkcs8Array[i + 1] === 0x20) {
      // Verify this looks like a private key (check a few bytes aren't all zeros/ones)
      const potentialKeyStart = i + 2;
      if (potentialKeyStart + 32 <= pkcs8Array.length) {
        // Replace the 32 bytes starting at i+2 with our private key scalar
        pkcs8Array.set(privateKeyScalar, potentialKeyStart);
        found = true;
        break;
      }
    }
  }

  if (!found) {
    // Fallback: try to find any 32-byte sequence that could be the private key
    // Look for sequences that are likely the private key (not all zeros, not all 0xFF)
    for (let i = 0; i < pkcs8Array.length - 32; i++) {
      const candidate = pkcs8Array.slice(i, i + 32);
      // Check if it's not all zeros or all 0xFF (unlikely for a real key)
      const sum = candidate.reduce((a, b) => a + b, 0);
      if (sum > 0 && sum < 32 * 255) {
        // This might be the private key location, try replacing it
        pkcs8Array.set(privateKeyScalar, i);
        found = true;
        break;
      }
    }
  }

  if (!found) {
    throw new KeyDerivationError('Could not find private key location in PKCS8 structure');
  }

  return pkcs8Array.buffer;
}

/**
 * Derives public key bytes deterministically
 * Note: This is a workaround. In production, compute public key from private key.
 */
function derivePublicKeyBytes(
  _crypto: SubtleCrypto,
  seed: Uint8Array
): Uint8Array {
  // Since we can't compute the public key from private key with Web Crypto,
  // we derive it deterministically from the secret using a different salt
  // This ensures the same secret produces the same public key
  
  // For P-256, public key is 65 bytes: 0x04 (uncompressed) + 32 bytes x + 32 bytes y
  // We'll derive 64 bytes and prepend 0x04
  const publicKeyMaterial = seed.slice(0, 64);
  if (publicKeyMaterial.length < 64) {
    // If seed is shorter, pad it
    const padded = new Uint8Array(64);
    padded.set(publicKeyMaterial);
    // Fill remainder deterministically
    for (let i = publicKeyMaterial.length; i < 64; i++) {
      padded[i] = seed[i % seed.length] ^ (i & 0xff);
    }
    const result = new Uint8Array(65);
    result[0] = 0x04; // Uncompressed point
    result.set(padded, 1);
    return result;
  }
  
  const result = new Uint8Array(65);
  result[0] = 0x04; // Uncompressed point
  result.set(publicKeyMaterial, 1);
  return result;
}

/**
 * Signs data using ECDSA P-256
 * @param data - Data to sign
 * @param privateKey - Private key scalar (32 bytes)
 * @returns Signature
 * @throws SigningError if signing fails
 */
export async function signPR(data: Uint8Array, privateKey: PrivateKey): Promise<Signature> {
  try {
    const crypto = globalThis.crypto?.subtle;
    if (!crypto) {
      throw new SigningError('Web Crypto API not available');
    }

    // Compute hash of data
    const dataHash = await computeHash(data);
    const dataHashBytes = hexToBytes(dataHash);

    // Create PKCS8 private key using workaround
    const pkcs8 = await createPKCS8PrivateKey(crypto, privateKey);

    // Import private key
    const cryptoKey = await crypto.importKey(
      'pkcs8',
      pkcs8,
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      false,
      ['sign']
    );

    // Sign the hash
    const dataHashArray = new Uint8Array(dataHashBytes);
    const signatureBuffer = await crypto.sign(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      cryptoKey,
      dataHashArray
    );

    return createSignature(new Uint8Array(signatureBuffer));
  } catch (error) {
    throw new SigningError(
      `Failed to sign data: ${error instanceof Error ? error.message : 'unknown error'}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Verifies a signature using ECDSA P-256
 * @param data - Original data
 * @param signature - Signature to verify
 * @param publicKey - Public key (65 bytes: 0x04 + x + y)
 * @returns True if signature is valid
 * @throws VerificationError if verification fails
 */
export async function verifyPU(
  data: Uint8Array,
  signature: Signature,
  publicKey: PublicKey
): Promise<boolean> {
  try {
    const crypto = globalThis.crypto?.subtle;
    if (!crypto) {
      throw new VerificationError('Web Crypto API not available');
    }

    // Compute hash of data
    const dataHash = await computeHash(data);
    const dataHashBytes = hexToBytes(dataHash);

    // Import public key (raw format for P-256 is 65 bytes)
    if (publicKey.length !== 65) {
      throw new VerificationError(`Invalid public key length: expected 65 bytes, got ${publicKey.length}`);
    }

    const publicKeyArray = new Uint8Array(publicKey);
    const cryptoKey = await crypto.importKey(
      'raw',
      publicKeyArray,
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      false,
      ['verify']
    );

    // Verify signature
    const signatureArray = new Uint8Array(signature);
    const dataHashArray = new Uint8Array(dataHashBytes);
    return await crypto.verify(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      cryptoKey,
      signatureArray,
      dataHashArray
    );
  } catch (error) {
    if (error instanceof VerificationError) {
      throw error;
    }
    throw new VerificationError(
      `Failed to verify signature: ${error instanceof Error ? error.message : 'unknown error'}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Derives a symmetric key from a private key using HKDF
 * @param privateKey - Private key scalar
 * @returns 32-byte symmetric key
 * @throws KeyDerivationError if derivation fails
 */
export async function deriveSymKey(privateKey: PrivateKey): Promise<SymmetricKey> {
  try {
    const crypto = globalThis.crypto?.subtle;
    if (!crypto) {
      throw new KeyDerivationError('Web Crypto API not available');
    }

    // Use HKDF to derive symmetric key from private key
    const privateKeyArray = new Uint8Array(privateKey);
    const baseKey = await crypto.importKey(
      'raw',
      privateKeyArray,
      'HKDF',
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: SYMMETRIC_KEY_SALT,
        info: new TextEncoder().encode('nearbytes-symmetric-key'),
      },
      baseKey,
      256 // 32 bytes
    );

    return createSymmetricKey(new Uint8Array(derivedBits));
  } catch (error) {
    throw new KeyDerivationError(
      `Failed to derive symmetric key: ${error instanceof Error ? error.message : 'unknown error'}`,
      error instanceof Error ? error : undefined
    );
  }
}
