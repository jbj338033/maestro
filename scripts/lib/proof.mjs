import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, basename, join, extname } from 'node:path';

const CWD = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const SKIP_EXTENSIONS = new Set(['.md', '.json', '.yaml', '.yml', '.lock', '.css', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot']);

const JS_FUNC = /(export\s+)?(async\s+)?function\s+(\w+)/;
const JS_ARROW = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/;
const JS_METHOD = /^\s+(\w+)\s*\(/;
const PY_DEF = /def\s+(\w+)/;
const PY_CLASS = /class\s+(\w+)/;
const RUST_FN = /(?:pub\s+)?fn\s+(\w+)/;
const RUST_IMPL = /impl\s+(\w+)/;
const GO_FUNC = /func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)/;

export function getGitDiff(cwd = CWD) {
  try {
    return execFileSync('git', ['diff', 'HEAD'], { cwd, timeout: 5000, encoding: 'utf8' });
  } catch {
    return '';
  }
}

export function getChangedFunctions(diffOutput) {
  if (!diffOutput) return [];

  const results = [];
  const seen = new Set();
  let currentFile = null;

  for (const line of diffOutput.split('\n')) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6);
      continue;
    }

    if (!currentFile || SKIP_EXTENSIONS.has(extname(currentFile))) continue;

    if (line.startsWith('@@ ')) {
      const hunkMatch = line.match(/@@ .+? @@\s*(.+)/);
      if (hunkMatch) {
        const name = extractFunctionName(hunkMatch[1], currentFile);
        if (name) addResult(results, seen, name, currentFile, 'function');
      }
      continue;
    }

    if (!line.startsWith('+') || line.startsWith('+++')) continue;

    const content = line.slice(1);
    const name = extractFunctionName(content, currentFile);
    if (name) addResult(results, seen, name, currentFile, inferType(content));
  }

  return results;
}

function extractFunctionName(line, file) {
  const ext = extname(file);
  let m;

  if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
    if ((m = line.match(JS_FUNC))) return m[3];
    if ((m = line.match(JS_ARROW))) return m[1];
    if ((m = line.match(JS_METHOD))) return m[1];
  } else if (ext === '.py') {
    if ((m = line.match(PY_DEF))) return m[1];
    if ((m = line.match(PY_CLASS))) return m[1];
  } else if (ext === '.rs') {
    if ((m = line.match(RUST_FN))) return m[1];
    if ((m = line.match(RUST_IMPL))) return m[1];
  } else if (ext === '.go') {
    if ((m = line.match(GO_FUNC))) return m[1];
  }

  return null;
}

function inferType(line) {
  if (/class\s+/.test(line)) return 'class';
  if (/^\s+\w+\s*\(/.test(line)) return 'method';
  return 'function';
}

function addResult(results, seen, name, file, type) {
  const key = `${file}:${name}`;
  if (seen.has(key)) return;
  seen.add(key);
  results.push({ name, file, type });
}

export function findTestsForFile(filePath) {
  const dir = dirname(filePath);
  const ext = extname(filePath);
  const base = basename(filePath, ext);
  const found = [];

  const candidates = [
    join(dir, `${base}.test${ext}`),
    join(dir, `${base}.spec${ext}`),
    join(dir, '__tests__', `${base}.test${ext}`),
    join(CWD, 'test', `${base}.test${ext}`),
    join(CWD, 'tests', `${base}.test${ext}`),
  ];

  if (ext === '.py') {
    candidates.push(join(dir, `test_${base}.py`));
    candidates.push(join(CWD, 'tests', `test_${base}.py`));
  }

  for (const c of candidates) {
    if (existsSync(c)) found.push(c);
  }

  return found;
}

export function checkTestCoverage(changedFunctions, testFiles) {
  const testContents = new Map();
  for (const tf of testFiles) {
    try {
      testContents.set(tf, readFileSync(tf, 'utf8'));
    } catch {
      // skip unreadable
    }
  }

  return changedFunctions.map(fn => {
    const sourceTestFiles = findTestsForFile(join(CWD, fn.file));
    const allTestFiles = [...new Set([...sourceTestFiles, ...testFiles])];

    for (const tf of allTestFiles) {
      const content = testContents.get(tf) || (() => {
        try {
          const c = readFileSync(tf, 'utf8');
          testContents.set(tf, c);
          return c;
        } catch { return ''; }
      })();

      if (!content.includes(fn.name)) continue;

      const describeTestRe = new RegExp(`(?:describe|it|test)\\s*\\(\\s*['"\`][^'"\`]*${fn.name}`);
      if (describeTestRe.test(content)) {
        return { function: fn.name, file: fn.file, tested: true, testFile: tf, confidence: 'high' };
      }

      const callRe = new RegExp(`${fn.name}\\s*\\(`);
      if (callRe.test(content)) {
        return { function: fn.name, file: fn.file, tested: true, testFile: tf, confidence: 'medium' };
      }

      return { function: fn.name, file: fn.file, tested: true, testFile: tf, confidence: 'low' };
    }

    return { function: fn.name, file: fn.file, tested: false, testFile: null, confidence: null };
  });
}

export function generateProofReport(coverageResults) {
  if (!coverageResults.length) {
    return { report: 'no changed functions detected', untestedFunctions: [], coverageRatio: 1 };
  }

  const tested = coverageResults.filter(r => r.tested);
  const untested = coverageResults.filter(r => !r.tested);
  const coverageRatio = tested.length / coverageResults.length;

  const lines = [
    `proof coverage: ${tested.length}/${coverageResults.length} functions covered (${Math.round(coverageRatio * 100)}%)`,
  ];

  if (untested.length) {
    lines.push('', 'untested:');
    for (const u of untested) {
      lines.push(`  - ${u.function} (${u.file})`);
    }
  }

  if (tested.length) {
    lines.push('', 'covered:');
    for (const t of tested) {
      lines.push(`  - ${t.function} [${t.confidence}] → ${t.testFile}`);
    }
  }

  return {
    report: lines.join('\n'),
    untestedFunctions: untested.map(u => u.function),
    coverageRatio,
  };
}
