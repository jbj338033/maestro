import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * get plugin data directory
 * falls back to $CLAUDE_PROJECT_DIR/.maestro if $CLAUDE_PLUGIN_DATA is not set
 */
export function getDataDir() {
  const dir = process.env.CLAUDE_PLUGIN_DATA
    || join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.maestro');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** read a JSON state file, return defaultValue if missing/corrupt */
export function readState(filename, defaultValue = null) {
  try {
    const filepath = join(getDataDir(), filename);
    if (!existsSync(filepath)) return defaultValue;
    return JSON.parse(readFileSync(filepath, 'utf8'));
  } catch {
    return defaultValue;
  }
}

/** atomic write: write to .tmp then rename */
export function writeState(filename, data) {
  const dir = getDataDir();
  const filepath = join(dir, filename);
  const parentDir = dirname(filepath);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }
  const tmp = filepath + '.' + randomBytes(4).toString('hex') + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  renameSync(tmp, filepath);
}

/** read-modify-write a state file */
export function updateState(filename, updater, defaultValue = {}) {
  const current = readState(filename, defaultValue);
  const updated = updater(current);
  writeState(filename, updated);
  return updated;
}
