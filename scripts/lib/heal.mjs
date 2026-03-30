import { readState, writeState } from './state.mjs';

const MAX_ERRORS = 5;
const MAX_OUTPUT = 10 * 1024;

function truncateOutput(output) {
  if (output.length <= MAX_OUTPUT) return output;
  const half = MAX_OUTPUT / 2;
  return output.slice(0, half) + '\n...[truncated]...\n' + output.slice(-half);
}

const ERROR_PATTERNS = [
  {
    type: 'typescript',
    re: /(.+\.tsx?)\((\d+),(\d+)\): error (TS\d+): (.+)/g,
    extract: m => ({ type: 'typescript', file: m[1], line: +m[2], message: m[5], code: m[4] }),
  },
  {
    type: 'eslint',
    re: /(.+)\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+([\w/-]+)$/gm,
    extract: m => ({ type: 'eslint', file: m[1].trim(), line: +m[2], message: m[5], code: m[6] }),
  },
  {
    type: 'jest',
    re: /FAIL\s+(.+)/g,
    postProcess: (matches, output) => {
      const results = [];
      for (const m of matches) {
        const errorMatch = /Error: (.+)/m.exec(output);
        results.push({ type: 'jest', file: m[1].trim(), line: null, message: errorMatch?.[1] || 'test failed', code: null });
      }
      return results;
    },
  },
  {
    type: 'rust',
    re: /error\[(\w+)]: (.+)\n\s*--> (.+):(\d+)/g,
    extract: m => ({ type: 'rust', file: m[3], line: +m[4], message: m[2], code: m[1] }),
  },
  {
    type: 'python',
    re: /File "(.+)", line (\d+).*\n.*\n(\w+Error): (.+)/g,
    extract: m => ({ type: 'python', file: m[1], line: +m[2], message: m[4], code: m[3] }),
  },
  {
    type: 'go',
    re: /(.+\.go):(\d+):\d+: (.+)/g,
    extract: m => ({ type: 'go', file: m[1], line: +m[2], message: m[3], code: null }),
  },
  {
    type: 'generic',
    re: /^error:?\s*(.+)/gim,
    extract: m => ({ type: 'generic', file: null, line: null, message: m[1], code: null }),
  },
];

export function parseErrors(output) {
  const text = truncateOutput(output);
  const errors = [];

  for (const pattern of ERROR_PATTERNS) {
    if (errors.length >= MAX_ERRORS) break;
    pattern.re.lastIndex = 0;

    if (pattern.postProcess) {
      const matches = [];
      let m;
      while ((m = pattern.re.exec(text)) !== null) matches.push(m);
      if (matches.length > 0) {
        errors.push(...pattern.postProcess(matches, text));
      }
    } else {
      let m;
      while ((m = pattern.re.exec(text)) !== null && errors.length < MAX_ERRORS) {
        errors.push(pattern.extract(m));
      }
    }
  }

  return errors.slice(0, MAX_ERRORS);
}

export function normalizeErrorPattern(message) {
  return message
    .replace(/\/[\w./-]+\.\w+/g, '...')
    .replace(/\b\d+\b/g, 'N')
    .replace(/'[^']+'/g, "'...'")
    .replace(/"[^"]+"/g, '"..."')
    .trim();
}

function similarity(a, b) {
  if (!a || !b) return 0;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  if (longer.includes(shorter)) return 1;
  let matches = 0;
  const words = shorter.split(/\s+/);
  for (const w of words) {
    if (longer.includes(w)) matches++;
  }
  return words.length > 0 ? matches / words.length : 0;
}

function extMatch(a, b) {
  const extA = a.split('.').pop();
  const extB = b.split('.').pop();
  return extA === extB;
}

export function matchKnownFixes(errors) {
  const errorsDb = readState('memory/errors.json', { entries: [] });
  const results = [];

  for (const error of errors) {
    const normalized = normalizeErrorPattern(error.message);
    let bestFix = null;
    let bestScore = 0;

    for (const entry of errorsDb.entries) {
      let score = 0;
      if (entry.error_type === error.type) score += 0.5;
      const sim = similarity(normalized, entry.error_pattern);
      if (sim > 0.7) score += 0.3;
      if (error.file && entry.fix_files?.some(f => extMatch(f, error.file))) score += 0.2;
      if (score > bestScore) {
        bestScore = score;
        bestFix = entry;
      }
    }

    if (bestFix && bestScore > 0.5) {
      results.push({ error, fix: bestFix, confidence: Math.min(bestScore, 1) });
    }
  }

  return results;
}

export function generateHealPrompt(errors, knownFixes, session) {
  let prompt = '[Maestro] error analysis:\n';

  for (const error of errors) {
    const loc = error.file ? `${error.file}${error.line ? ':' + error.line : ''}` : 'unknown';
    prompt += `  ${error.type} in ${loc}: ${error.message}\n`;
  }

  if (knownFixes.length > 0) {
    prompt += '\nknown fixes from past sessions:\n';
    for (const { fix, confidence } of knownFixes) {
      const pct = Math.round(confidence * 100);
      const desc = fix.fix_files?.join(', ') || 'unknown files';
      prompt += `  - fixed in ${desc} (confidence: ${pct}%)\n`;
    }
  }

  const types = new Set(errors.map(e => e.type));
  prompt += '\nsuggested actions:\n';
  if (types.has('typescript')) prompt += '  - check type annotations and imports\n';
  if (types.has('eslint')) prompt += '  - run linter with --fix flag\n';
  if (types.has('jest') || types.has('vitest')) prompt += '  - review test assertions and mocks\n';
  if (types.has('rust')) prompt += '  - check borrow checker and type constraints\n';
  if (types.has('python')) prompt += '  - check exception handling and type errors\n';
  if (types.has('go')) prompt += '  - check error handling and type assertions\n';

  return prompt;
}

export function learnFix(previousErrors, fixedFiles) {
  const errorsDb = readState('memory/errors.json', { entries: [] });

  for (const error of previousErrors) {
    errorsDb.entries.push({
      error_pattern: normalizeErrorPattern(error.message),
      error_type: error.type,
      fix_files: fixedFiles,
      added_at: new Date().toISOString(),
    });
  }

  if (errorsDb.entries.length > 50) {
    errorsDb.entries = errorsDb.entries.slice(-50);
  }

  writeState('memory/errors.json', errorsDb);
}
