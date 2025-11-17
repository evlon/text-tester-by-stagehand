#!/usr/bin/env node
"use strict";

const path = require('path');

// Run the internal CLI with forwarded args
const args = process.argv.slice(2);

// Dynamically import to keep ESM
import(path.join(__dirname, '../src/vitest/runners/cli.mjs'))
  .then(mod => {
    const runCLI = mod.runCLI || mod.default;
    if (typeof runCLI !== 'function') {
      console.error('CLI entry not found.');
      process.exit(1);
    }
    runCLI(args);
  })
  .catch(err => {
    console.error('Failed to start CLI:', err?.stack || err?.message || err);
    process.exit(1);
  });