import type { Command } from 'commander';
import { readFile } from 'fs/promises';
import { basename } from 'path';
import { createCryptoOperations } from '../../crypto/index.js';
import { FilesystemStorageBackend } from '../../storage/filesystem.js';
import { ChannelStorage } from '../../storage/channel.js';
import { storeDataDeduplicated } from '../../domain/operations.js';
import { green, red, yellow } from '../output/colors.js';
import { validateSecret, validateFilePath } from '../validation.js';
import { defaultPathMapper } from '../../types/storage.js';

export interface StoreUniqueOptions {
  file: string;
  secret: string;
  dataDir?: string;
}

/**
 * Store-unique command handler (with deduplication)
 */
export async function handleStoreUnique(options: StoreUniqueOptions): Promise<void> {
  try {
    // Validate inputs
    const secret = validateSecret(options.secret);
    await validateFilePath(options.file);

    // Read file data
    const fileBuffer = await readFile(options.file);
    const data = new Uint8Array(fileBuffer);

    // Determine file name (use basename of path)
    const fileName = basename(options.file);

    // Initialize crypto and storage
    const crypto = createCryptoOperations();
    const storage = new FilesystemStorageBackend(options.dataDir || './data');
    const channelStorage = new ChannelStorage(storage, defaultPathMapper);

    // Store data with deduplication
    const result = await storeDataDeduplicated(data, fileName, secret, crypto, channelStorage);

    // Output result
    console.log(green('✓ Data stored successfully'));
    console.log(`Event Hash: ${result.eventHash}`);
    console.log(`Data Hash: ${result.dataHash}`);
    if (result.wasDeduplicated) {
      console.log(yellow('ℹ Encrypted data block was reused (deduplicated)'));
    }
  } catch (error) {
    console.error(red(`✗ Error: ${error instanceof Error ? error.message : 'unknown error'}`));
    process.exit(1);
  }
}

/**
 * Registers the store-unique command
 */
export function registerStoreUniqueCommand(program: Command): void {
  program
    .command('store-unique')
    .description('Store data in a channel with deduplication (reuses existing encrypted data blocks)')
    .requiredOption('-f, --file <path>', 'Path to data file')
    .requiredOption('-s, --secret <secret>', 'Channel secret')
    .option('-d, --data-dir <path>', 'Data directory path', './data')
    .action(handleStoreUnique);
}

