#!/usr/bin/env node
/**
 * Full build pipeline: ingest from Socrata → extract JSON → ready to serve.
 *
 * Usage:
 *   node build.js
 *   node build.js --year 2024
 */

const { execFileSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);

const steps = [
  { label: 'Ingest Oak Park data from Socrata', cmd: ['node', 'ingest-op.cjs', ...args] },
  { label: 'Extract properties + districts JSON', cmd: ['node', 'extract-all-op-properties.cjs', ...args] },
];

console.log('Oak Park Properties — Full Build');
console.log('================================\n');

const start = Date.now();

for (const step of steps) {
  console.log(`▸ ${step.label}`);
  console.log(`  $ ${step.cmd.join(' ')}\n`);
  execFileSync(step.cmd[0], step.cmd.slice(1), {
    cwd: path.resolve(__dirname),
    stdio: 'inherit',
  });
  console.log();
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`Build complete in ${elapsed}s`);
console.log('Run the app:  npm run dev');
