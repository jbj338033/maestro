import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { readState, getDataDir } from './state.mjs';

const IMPORT_RE = /(?:import\s+.*?\s+from\s+['"](.+?)['"]|require\s*\(\s*['"](.+?)['"]\s*\)|export\s+.*?\s+from\s+['"](.+?)['"])/g;
const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const MAX_FILE_SIZE = 100 * 1024;

function tryResolve(base, specifier) {
  const resolved = resolve(dirname(base), specifier);
  if (existsSync(resolved) && statSync(resolved).isFile()) return resolved;
  for (const ext of SOURCE_EXTS) {
    const withExt = resolved + ext;
    if (existsSync(withExt)) return withExt;
  }
  for (const ext of SOURCE_EXTS) {
    const indexPath = join(resolved, `index${ext}`);
    if (existsSync(indexPath)) return indexPath;
  }
  return null;
}

export function parseImports(filePath) {
  try {
    if (statSync(filePath).size > MAX_FILE_SIZE) return [];
  } catch {
    return [];
  }

  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const results = [];
  IMPORT_RE.lastIndex = 0;
  let match;
  while ((match = IMPORT_RE.exec(content)) !== null) {
    const specifier = match[1] || match[2] || match[3];
    if (!specifier || (!specifier.startsWith('./') && !specifier.startsWith('../'))) continue;
    const resolved = tryResolve(filePath, specifier);
    if (resolved) results.push(resolved);
  }
  return results;
}

export function getCoModifiedFiles(filePath) {
  const patterns = readState('memory/patterns.json', { entries: [] });
  const scored = new Map();

  for (const entry of patterns.entries) {
    if (entry.type !== 'file_co_modification') continue;
    if (!entry.files?.includes(filePath)) continue;
    for (const f of entry.files) {
      if (f === filePath) continue;
      scored.set(f, (scored.get(f) || 0) + (entry.frequency || 1));
    }
  }

  try {
    const histDir = join(getDataDir(), 'history');
    if (existsSync(histDir)) {
      const files = readdirSync(histDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .slice(-10);
      for (const file of files) {
        try {
          const session = JSON.parse(readFileSync(join(histDir, file), 'utf8'));
          if (!session.modified_files?.includes(filePath)) continue;
          for (const f of session.modified_files) {
            if (f === filePath) continue;
            scored.set(f, (scored.get(f) || 0) + 1);
          }
        } catch {}
      }
    }
  } catch {}

  return Array.from(scored.entries())
    .map(([path, score]) => ({ path, score }))
    .sort((a, b) => b.score - a.score);
}

export function predictNextFiles(filePath, readFiles, modifiedFiles) {
  const seen = new Set([...(readFiles || []), ...(modifiedFiles || []), filePath]);
  const candidates = new Map();

  function add(path, score, reason) {
    if (seen.has(path)) return;
    const existing = candidates.get(path);
    if (!existing || existing.score < score) {
      candidates.set(path, { score, reason });
    }
  }

  for (const p of parseImports(filePath)) {
    add(p, 3, 'imported');
  }

  for (const { path } of getCoModifiedFiles(filePath)) {
    add(path, 2, 'co-modified');
  }

  try {
    const dir = dirname(filePath);
    for (const entry of readdirSync(dir)) {
      const ext = extname(entry);
      if (!SOURCE_EXTS.includes(ext)) continue;
      if (/\.(test|spec)\./.test(entry)) continue;
      const full = join(dir, entry);
      add(full, 1, 'nearby');
    }
  } catch {}

  return Array.from(candidates.entries())
    .map(([path, { score, reason }]) => ({ path, score, reason }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
