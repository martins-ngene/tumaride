#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const distMain = path.resolve(__dirname, '..', 'dist', 'main.js');
if (!fs.existsSync(distMain)) {
  console.error(`[Smoke Test] FAIL: Missing build output at ${distMain}`);
  process.exit(1);
}

console.log(`[Smoke Test] PASS: Found compiled production entrypoint ${distMain}`);
process.exit(0);
