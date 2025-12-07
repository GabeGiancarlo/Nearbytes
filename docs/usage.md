# Usage Guide

## Basic Workflow

### 1. Initialize a Channel

```bash
nearbytes setup --secret "mychannel:mypassword"
```

Output:
```
✓ Channel initialized successfully
Public Key: abc123...
Channel Path: abc123...
```

### 2. Store Data

**Standard store (always creates new encrypted data blocks):**
```bash
nearbytes store --file ./document.pdf --secret "mychannel:mypassword"
```

**Store with deduplication (reuses existing encrypted data blocks):**
```bash
nearbytes store-unique --file ./document.pdf --secret "mychannel:mypassword"
```

Output:
```
✓ Data stored successfully
Event Hash: def456...
Data Hash: ghi789...
ℹ Encrypted data block was reused (deduplicated)  # Only shown with store-unique
```

**Note:** The `store-unique` command checks if an encrypted data block with the same hash already exists. If it does, it reuses the existing block instead of creating a duplicate, saving storage space. The `store` command always creates a new encrypted data block, even if the same file is stored multiple times.

**Important:** Since each encryption uses a randomly generated symmetric key, storing the same plaintext file twice will produce different encrypted data (and thus different hashes). The `store-unique` command will deduplicate if the same encrypted data hash is encountered, but this is unlikely for the same plaintext due to random encryption. For true content-based deduplication of plaintext files, additional implementation would be required (e.g., content-addressable storage based on plaintext hash).

### 3. List Events

```bash
nearbytes list --secret "mychannel:mypassword"
```

Table format (default):
```
Event Hash
------------------------------------------------------------
def456...
jkl012...
```

JSON format:
```bash
nearbytes list --secret "mychannel:mypassword" --format json
```

### 4. Retrieve Data

```bash
nearbytes retrieve --event def456... --secret "mychannel:mypassword" --output ./retrieved-document.pdf
```

Output:
```
✓ Data retrieved successfully to ./retrieved-document.pdf
```

## Advanced Usage

### Custom Data Directory

```bash
nearbytes setup --secret "mychannel:mypassword" --data-dir /path/to/data
nearbytes store --file ./file.txt --secret "mychannel:mypassword" --data-dir /path/to/data
```

### Scripting with JSON Output

```bash
EVENT_HASH=$(nearbytes store --file ./data.txt --secret "mychannel:mypassword" | jq -r '.eventHash')
nearbytes retrieve --event "$EVENT_HASH" --secret "mychannel:mypassword" --output ./retrieved.txt
```

## Common Use Cases

### Backup Important Files

```bash
# Store files
for file in important/*; do
  nearbytes store --file "$file" --secret "backup:password"
done

# List all backups
nearbytes list --secret "backup:password"
```

### Share Encrypted Data

1. Setup channel with shared secret
2. Store data
3. Share event hash and secret (securely)
4. Recipient retrieves data

## Troubleshooting

### "File not found" Error

- Check file path is correct
- Ensure file is readable

### "Invalid secret" Error

- Secret must be at least 8 characters
- Use format: "channelname:password"

### "Event signature verification failed"

- Wrong secret provided
- Data corruption
- Check event hash is correct

### "Web Crypto API not available"

- Requires Node.js 18+
- Check Node.js version: `node --version`

