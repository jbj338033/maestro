#!/usr/bin/env node
/**
 * CJS bootstrap for ESM hook scripts.
 * Usage: node run.cjs <script.mjs> [args...]
 *
 * Wraps execution in try/catch to never crash Claude Code.
 * Exit 0 = success, Exit 2 = blocking error, other = non-blocking error.
 */
const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const scriptPath = process.argv[2];
const args = process.argv.slice(3);

if (!scriptPath || !existsSync(scriptPath)) {
  process.exit(0); // silent exit, don't crash Claude
}

try {
  // forward stdin to the child process
  let stdinData = '';
  try {
    stdinData = require('node:fs').readFileSync(0, 'utf8');
  } catch {
    // no stdin available
  }

  const result = execFileSync(process.execPath, [scriptPath, ...args], {
    input: stdinData,
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  if (result) process.stdout.write(result);
} catch (err) {
  if (err.status === 2) {
    // blocking error — forward stderr to Claude
    if (err.stderr) process.stderr.write(err.stderr);
    process.exit(2);
  }
  // non-blocking: silent exit
  if (err.stdout) process.stdout.write(err.stdout);
  process.exit(0);
}
