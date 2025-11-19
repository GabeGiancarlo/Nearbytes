# Known Limitations

## PKCS8 Private Key Structure for Deterministic Signing

**Issue**: The current implementation cannot sign data using deterministically derived private keys due to PKCS8 structure limitations.

**Root Cause**: 
- Web Crypto API requires PKCS8 format for importing private keys
- When we replace the private key scalar in a generated PKCS8 structure, the public key (if present) doesn't match
- Web Crypto API validates the structure and rejects it with "Invalid keyData"

**Why This Happens**:
1. We derive a deterministic private key from a secret using PBKDF2
2. We generate a temporary key pair to get a valid PKCS8 structure
3. We replace the private key bytes with our deterministic key
4. The public key in the structure still corresponds to the temporary key pair
5. Web Crypto API detects the mismatch and rejects the key

**Potential Solutions** (not implemented):
1. **Compute public key from private key**: Implement EC point multiplication to derive the correct public key from the private key scalar, then update the PKCS8 structure
2. **Remove public key from PKCS8**: The public key is optional in PKCS8 format. Remove it and recalculate all ASN.1 length fields (complex ASN.1 manipulation)
3. **Use ASN.1 library**: Use a proper ASN.1 encoding library to construct PKCS8 from scratch (not allowed per requirements - Web Crypto API only)
4. **Different approach**: Store both keys deterministically instead of trying to derive public from private

**Current Workaround**:
- Signing tests are skipped (`it.skip`)
- The `signPR` function will fail when called with deterministically derived keys
- Other cryptographic operations (hashing, symmetric encryption, key derivation) work correctly

**Impact**:
- `storeData` operation fails (requires signing)
- `retrieveData` operation cannot be tested end-to-end (requires `storeData` to work first)
- `setup` and `list` operations work correctly

**Status**: This is a known limitation that would need to be addressed for production use. The implementation demonstrates the architecture and most functionality, but signing with deterministic keys requires additional work.

