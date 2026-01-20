# Key Derivation Documentation

## Overview

NearBytes uses deterministic key derivation from a user-provided secret. The same secret always produces the same keys, allowing volumes to be recreated from just the secret.

## Derivation Process

### Step 1: Secret Input
- User provides a secret string (e.g., "mychannel:password")
- Secret is encoded as UTF-8 bytes

### Step 2: Private Key Derivation
```
Secret (UTF-8 bytes)
  → PBKDF2(secret, PRIVATE_KEY_SALT, 100,000 iterations, SHA-256)
  → 32-byte seed
  → Reduce modulo curve order (ECDSA P-256)
  → Private key scalar (32 bytes)
```

**Parameters**:
- Salt: `'nearbytes-private-key-v1'` (UTF-8 encoded)
- Iterations: 100,000
- Hash: SHA-256
- Output: 32 bytes

### Step 3: Public Key Derivation
```
Private key scalar
  → Import as ECDSA P-256 key
  → Export as JWK (extracts public key coordinates)
  → Convert to raw format (0x04 + x + y)
  → Public key (65 bytes)
```

**Format**: Uncompressed point (0x04 prefix + 32-byte x + 32-byte y)

### Step 4: Storage Namespace Derivation
```
Public key (65 bytes)
  → Convert to hex string
  → Path: `channels/[hex-string]`
```

**Deterministic**: Same public key always produces the same path.

## Deterministic Properties

### Verification

**Test**: Changing one character in the secret should fully change the volume.

**Example**:
```typescript
const secret1 = createSecret('mychannel:password');
const secret2 = createSecret('mychannel:passworX'); // One character different

const keyPair1 = await deriveKeys(secret1);
const keyPair2 = await deriveKeys(secret2);

// Public keys should be completely different
expect(keyPair1.publicKey).not.toEqual(keyPair2.publicKey);
```

**Result**: ✅ PBKDF2 is a one-way function with avalanche effect. Changing one bit in the input changes approximately 50% of the output bits.

### No Randomness

**Verification**: Same secret always produces same keys.

**Example**:
```typescript
const secret = createSecret('mychannel:password');

const keyPair1 = await deriveKeys(secret);
const keyPair2 = await deriveKeys(secret);

// Should be identical
expect(keyPair1.publicKey).toEqual(keyPair2.publicKey);
expect(keyPair1.privateKey).toEqual(keyPair2.privateKey);
```

**Result**: ✅ PBKDF2 is deterministic. Same input always produces same output.

## Key Usage

### Encryption Keys
- **Symmetric keys**: Generated randomly for each file (not derived from secret)
- **Key encryption keys**: Derived from private key using HKDF

### Signing Keys
- **Private key**: Used to sign events
- **Public key**: Used to verify event signatures and derive storage path

### Storage Namespace
- **Path**: Derived from public key hex representation
- **Format**: `channels/[64-character-hex-string]`
- **Deterministic**: Same secret → same public key → same path

## Security Properties

1. **One-way**: Cannot derive secret from keys (PBKDF2 is one-way)
2. **Avalanche effect**: Small change in secret → large change in keys
3. **High iteration count**: 100,000 iterations makes brute-force expensive
4. **Salt**: Prevents rainbow table attacks

## Browser Compatibility

**Question**: Can this function run in a browser later?

**Answer**: ✅ Yes. All operations use Web Crypto API:
- `crypto.subtle.deriveBits()` for PBKDF2
- `crypto.subtle.importKey()` / `exportKey()` for key operations
- No Node.js-specific APIs used

**Note**: The current implementation uses Node.js `fs` for storage, but the key derivation itself is browser-compatible. Only the storage backend needs to be swapped for browser use.

## Implementation Details

### PBKDF2 Parameters
```typescript
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH = 'SHA-256';
const PRIVATE_KEY_SALT = new TextEncoder().encode('nearbytes-private-key-v1');
```

### Curve
- **ECDSA P-256** (secp256r1)
- Curve order: `0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551`

### Key Format
- **Private key**: 32-byte scalar (raw bytes)
- **Public key**: 65-byte uncompressed point (0x04 + x + y)

## Summary

✅ **Deterministic**: Same secret → same keys  
✅ **Sensitive**: One character change → completely different keys  
✅ **No randomness**: After secret input, all derivation is deterministic  
✅ **Browser-compatible**: Uses Web Crypto API only
