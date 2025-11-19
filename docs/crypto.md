# Cryptographic Details

## Algorithms

### Hash Function
- **Algorithm**: SHA-256
- **Output**: 64-character hexadecimal string
- **Usage**: Content addressing, event hashing

### Symmetric Encryption
- **Algorithm**: AES-256-GCM
- **Key Size**: 256 bits (32 bytes)
- **IV Size**: 96 bits (12 bytes)
- **Auth Tag**: 128 bits (16 bytes)
- **Format**: `[IV (12 bytes)][ciphertext][auth tag (16 bytes)]`
- **Usage**: Data encryption, key encryption

### Asymmetric Cryptography
- **Algorithm**: ECDSA P-256
- **Key Derivation**: PBKDF2 with SHA-256, 100,000 iterations
- **Usage**: Channel key pairs, event signing

## Key Derivation

### Channel Keys
1. Secret → PBKDF2 (100k iterations) → Seed
2. Seed → Reduce modulo curve order → Private key scalar
3. Private key → EC point multiplication → Public key

### Symmetric Key Derivation
- **From Private Key**: HKDF with SHA-256
- **Random Generation**: Web Crypto API `generateKey`

## Encryption Format

### Encrypted Data Block
```
[IV (12 bytes)][Ciphertext][Auth Tag (16 bytes)]
```

### Event Structure
```json
{
  "payload": {
    "hash": "64-char-hex",
    "encryptedKey": "base64-encoded"
  },
  "signature": "base64-encoded"
}
```

## Security Properties

1. **Confidentiality**: AES-256-GCM encryption
2. **Integrity**: GCM authentication tag, ECDSA signatures
3. **Authenticity**: Signed events verify channel ownership
4. **Determinism**: Same secret always produces same keys

## Limitations

- Web Crypto API doesn't support deterministic EC key generation
- Public key derivation uses a workaround (see code comments)
- In production, implement proper EC point multiplication

