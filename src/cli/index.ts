#!/usr/bin/env node

import { Command } from 'commander';
import { registerSetupCommand } from './commands/setup.js';
import { registerStoreCommand } from './commands/store.js';
import { registerRetrieveCommand } from './commands/retrieve.js';
import { registerListCommand } from './commands/list.js';

const program = new Command();

program
  .name('nearbytes')
  .description('NearBytes cryptographic storage protocol CLI')
  .version('1.0.0');

// Register all commands
registerSetupCommand(program);
registerStoreCommand(program);
registerRetrieveCommand(program);
registerListCommand(program);

// Parse arguments and execute
program.parse();

