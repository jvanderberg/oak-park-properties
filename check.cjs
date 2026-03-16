#!/usr/bin/env node
/**
 * Run all checks: TypeScript type-check, Biome lint, and Biome format.
 *
 * Usage:
 *   node check.js          # check only
 *   node check.js --fix    # auto-fix lint and format issues
 */

const { execFileSync } = require('child_process');

const fix = process.argv.includes('--fix');

const checks = [
  { label: 'TypeScript', cmd: ['npx', 'tsc', '--noEmit'] },
  {
    label: 'Biome (lint + format)',
    cmd: fix
      ? ['npx', '@biomejs/biome', 'check', '--write']
      : ['npx', '@biomejs/biome', 'check'],
  },
];

let failed = false;

for (const check of checks) {
  process.stdout.write(`▸ ${check.label}... `);
  try {
    execFileSync(check.cmd[0], check.cmd.slice(1), { stdio: 'pipe' });
    console.log('✓');
  } catch (err) {
    console.log('✗');
    process.stderr.write(err.stderr?.toString() || err.stdout?.toString() || '');
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
