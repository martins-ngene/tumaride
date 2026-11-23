#!/usr/bin/env node
const { execSync, spawn } = require('child_process');
const path = require('path');

console.log('[Tuma Ride] Bootstrapping production environment...');

if (process.env.DATABASE_URL) {
  try {
    console.log('[Tuma Ride] Running Prisma schema push (--accept-data-loss)...');
    execSync('npx prisma db push --accept-data-loss --skip-generate', {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..'),
    });
    console.log('[Tuma Ride] Prisma schema synced successfully.');
  } catch (err) {
    console.error('[Tuma Ride] Prisma db push failed:', err.message);
    process.exit(1);
  }
} else {
  console.warn('[Tuma Ride] DATABASE_URL not set; skipping prisma db push.');
}

const mainEntry = path.resolve(__dirname, '..', 'dist', 'main.js');
console.log(`[Tuma Ride] Starting NestJS server from ${mainEntry}...`);

const child = spawn(process.execPath, [mainEntry], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
