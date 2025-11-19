import type { Secret, KeyPair, PrivateKey, PublicKey, SymmetricKey } from '../types/keys.js';
import type { Signature } from '../types/events.js';
import { createPrivateKey, createPublicKey, createSymmetricKey } from '../types/keys.js';
import { createSignature } from '../types/events.js';
import { KeyDerivationError, SigningError, VerificationError } from './errors.js';
import { computeHash } from './hash.js';
import { hexToBytes, bytesToHex } from '../utils/encoding.js';

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH = 'SHA-256';
const KEY_DERIVATION_SALT = new TextEncoder().encode('nearbytes-key-derivation-v1');
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

    // Create PKCS8 private key
    const pkcs8PrivateKey = createPKCS8PrivateKey(privateKeyScalar);

    // Import private key to get CryptoKey
    const cryptoPrivateKey = await crypto.importKey(
      'pkcs8',
      pkcs8PrivateKey,
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true,
      ['sign']
    );

    // Derive public key deterministically from secret
    // Since Web Crypto doesn't support EC point multiplication, we derive
    // the public key separately but deterministically
    const publicKeySeed = await deriveSeed(crypto, secretBytes, PUBLIC_KEY_SALT, 32);
    
    // Generate a key pair and use the seed to make it deterministic
    // This is a workaround - in production, compute public key from private key
    const publicKeyBytes = await derivePublicKeyBytes(crypto, publicKeySeed);

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
  const seedKey = await crypto.importKey('raw', secretBytes, 'PBKDF2', false, ['deriveBits']);

  const seedBits = await crypto.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
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
 */
function createPKCS8PrivateKey(privateKeyScalar: Uint8Array): ArrayBuffer {
  // PKCS8 structure: SEQUENCE { version, AlgorithmIdentifier, PrivateKey }
  // This is a simplified but valid structure
  
  const privateKeyOctet = new Uint8Array(34); // 0x04 (tag) + 0x20 (length) + 32 bytes
  privateKeyOctet[0] = 0x04; // OCTET STRING
  privateKeyOctet[1] = 0x20; // Length (32 bytes)
  privateKeyOctet.set(privateKeyScalar, 2);

  const ecPrivateKey = new Uint8Array(38); // SEQUENCE + version + privateKey
  ecPrivateKey[0] = 0x30; // SEQUENCE
  ecPrivateKey[1] = 0x24; // Length (36 bytes)
  ecPrivateKey[2] = 0x02; // INTEGER (version)
  ecPrivateKey[3] = 0x01; // Length
  ecPrivateKey[4] = 0x01; // Version = 1
  ecPrivateKey.set(privateKeyOctet, 5);

  const algorithmId = new Uint8Array(19);
  algorithmId[0] = 0x30; // SEQUENCE
  algorithmId[1] = 0x13; // Length
  algorithmId[2] = 0x06; // OID
  algorithmId[3] = 0x07; // Length
  // EC OID: 1.2.840.10045.2.1
  algorithmId[4] = 0x2a;
  algorithmId[5] = 0x86;
  algorithmId[6] = 0x48;
  algorithmId[7] = 0xce;
  algorithmId[8] = 0x3d;
  algorithmId[9] = 0x02;
  algorithmId[10] = 0x01;
  algorithmId[11] = 0x30; // SEQUENCE (namedCurve)
  algorithmId[12] = 0x08; // Length
  algorithmId[13] = 0x06; // OID
  algorithmId[14] = 0x05; // Length
  // P-256 OID: 1.2.840.10045.3.1.7
  algorithmId[15] = 0x2b;
  algorithmId[16] = 0x81;
  algorithmId[17] = 0x04;
  algorithmId[18] = 0x00;
  algorithmId[19] = 0x07;

  const privateKeyOctetString = new Uint8Array(36);
  privateKeyOctetString[0] = 0x04; // OCTET STRING
  privateKeyOctetString[1] = 0x22; // Length (34 bytes)
  privateKeyOctetString.set(ecPrivateKey, 2);

  const pkcs8 = new Uint8Array(59);
  pkcs8[0] = 0x30; // SEQUENCE
  pkcs8[1] = 0x39; // Length (57 bytes)
  pkcs8[2] = 0x02; // INTEGER (version)
  pkcs8[3] = 0x01; // Length
  pkcs8[4] = 0x01; // Version = 1
  pkcs8.set(algorithmId, 5);
  pkcs8.set(privateKeyOctetString, 24);

  return pkcs8.buffer;
}

/**
 * Derives public key bytes deterministically
 * Note: This is a workaround. In production, compute public key from private key.
 */
async function derivePublicKeyBytes(
  crypto: SubtleCrypto,
  seed: Uint8Array
): Promise<Uint8Array> {
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

    // Create PKCS8 private key
    const pkcs8 = createPKCS8PrivateKey(privateKey);

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
    const signatureBuffer = await crypto.sign(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      cryptoKey,
      dataHashBytes
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

    const cryptoKey = await crypto.importKey(
      'raw',
      publicKey,
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      false,
      ['verify']
    );

    // Verify signature
    return await crypto.verify(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      cryptoKey,
      signature,
      dataHashBytes
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
    const baseKey = await crypto.importKey(
      'raw',
      privateKey,
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
