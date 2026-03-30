import { readStdin } from './lib/stdin.mjs';
import { updateState, readState, writeState } from './lib/state.mjs';
import { addMemory } from './lib/memory.mjs';
import { existsSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';

const input = await readStdin();
if (!input) process.exit(0);

const toolName = input.tool_name || '';
const toolInput = input.tool_input || {};
const toolResponse = input.tool_response;

let category = 'other';
if (['Read', 'Glob', 'Grep'].includes(toolName)) category = 'read';
else if (['Write', 'Edit'].includes(toolName)) category = 'write';
else if (toolName === 'Bash') category = 'bash';

// --- REPLAY: record tool call ---
try {
  const replay = readState('replay.json', { calls: [] });
  replay.calls.push({
    tool: toolName,
    input_summary: JSON.stringify(toolInput).slice(0, 200),
    timestamp: new Date().toISOString(),
    category,
  });
  if (replay.calls.length > 200) replay.calls = replay.calls.slice(-200);
  writeState('replay.json', replay);
} catch {}

// update session state
const session = updateState('session.json', (s) => {
  if (!s || !s.tool_counts) return s;

  s.tool_counts[category] = (s.tool_counts[category] || 0) + 1;

  if (category === 'write' && toolInput.file_path) {
    if (!s.modified_files.includes(toolInput.file_path)) {
      s.modified_files.push(toolInput.file_path);
    }
    const modCount = s.modified_files.length;
    if (s.verification.tests_passed === true && modCount > (s.verification.last_verified_file_count || 0)) {
      s.verification.tests_passed = null;
    }
    if (s.verification.build_passed === true && modCount > (s.verification.last_verified_file_count || 0)) {
      s.verification.build_passed = null;
    }
  }

  if (category === 'read' && toolInput.file_path) {
    if (!s.read_files.includes(toolInput.file_path)) {
      s.read_files.push(toolInput.file_path);
    }
  }

  if (toolName === 'Bash') {
    const cmd = toolInput.command || '';
    const isTestCmd = /\b(test|spec|jest|vitest|mocha|pytest|cargo\s+test|flutter\s+test|pnpm\s+test|npm\s+test|bun\s+test)\b/i.test(cmd);
    const isBuildCmd = /\b(build|compile|tsc|cargo\s+build|flutter\s+build|pnpm\s+build|npm\s+run\s+build|bun\s+build|next\s+build)\b/i.test(cmd);

    const responseStr = typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse || '');
    const hasError = /error|failed|failure|FAIL|ERR!/i.test(responseStr) && !/0 errors|0 failed/i.test(responseStr);

    if (isTestCmd) {
      s.verification.tests_run = true;
      s.verification.tests_passed = !hasError;
      s.verification.last_verified_file_count = s.modified_files.length;
      if (hasError) s.stop_blocked_at_file_count = 0;
    }
    if (isBuildCmd) {
      s.verification.build_run = true;
      s.verification.build_passed = !hasError;
      s.verification.last_verified_file_count = s.modified_files.length;
      if (hasError) s.stop_blocked_at_file_count = 0;
    }
  }

  return s;
}, {});

if (!session) process.exit(0);

const reminders = [];

// --- GUARD: test file reminder ---
if (category === 'write' && toolInput.file_path) {
  const fp = toolInput.file_path;
  const dir = dirname(fp);
  const base = basename(fp);

  if (!/\.(test|spec)\./i.test(base)) {
    const nameWithoutExt = base.replace(/\.[^.]+$/, '');
    const ext = base.slice(base.lastIndexOf('.'));
    const testPatterns = [
      join(dir, `${nameWithoutExt}.test${ext}`),
      join(dir, `${nameWithoutExt}.spec${ext}`),
      join(dir, '__tests__', `${nameWithoutExt}.test${ext}`),
    ];
    const testFile = testPatterns.find(p => existsSync(p));
    if (testFile) {
      const key = `test_reminded_${fp}`;
      if (!session[key]) {
        reminders.push(`[Maestro] ${basename(testFile)} exists. consider updating tests.`);
        updateState('session.json', (s) => { s[key] = true; return s; });
      }
    }
  }
}

// --- GUARD: modification threshold reminders ---
const modCount = session.modified_files?.length || 0;
if (modCount === 5) {
  reminders.push(`[Maestro] ${modCount} files modified. consider running tests and cross-validating.`);
}
if (modCount === 10) {
  reminders.push(`[Maestro] ${modCount} files modified. strongly recommend running critic agent for a deep review.`);
}

// --- HEAL: structured error analysis + learning ---
if (toolName === 'Bash') {
  const cmd = toolInput.command || '';
  const responseStr = typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse || '');
  const isTestCmd = /\b(test|spec|jest|vitest|mocha|pytest|cargo\s+test|flutter\s+test|pnpm\s+test|npm\s+test|bun\s+test)\b/i.test(cmd);
  const isBuildCmd = /\b(build|compile|tsc|cargo\s+build|flutter\s+build|pnpm\s+build|npm\s+run\s+build|bun\s+build|next\s+build)\b/i.test(cmd);
  const hasError = /error|failed|failure|FAIL|ERR!/i.test(responseStr) && !/0 errors|0 failed/i.test(responseStr);

  if ((isTestCmd || isBuildCmd) && hasError) {
    try {
      const { parseErrors, matchKnownFixes, generateHealPrompt } = await import('./lib/heal.mjs');
      const errors = parseErrors(responseStr);
      if (errors.length > 0) {
        updateState('session.json', (s) => {
          s.last_errors = errors;
          s.last_error_file_count = s.modified_files.length;
          return s;
        });
        const knownFixes = matchKnownFixes(errors);
        reminders.push(generateHealPrompt(errors, knownFixes, session));
      }
    } catch {}
  }

  if ((isTestCmd || isBuildCmd) && !hasError && session.last_errors?.length > 0) {
    try {
      const { learnFix } = await import('./lib/heal.mjs');
      const fixedFiles = session.modified_files.slice(session.last_error_file_count || 0);
      if (fixedFiles.length > 0 && fixedFiles.length <= 5) {
        learnFix(session.last_errors, fixedFiles);
      }
      updateState('session.json', (s) => {
        s.last_errors = null;
        s.last_error_file_count = null;
        return s;
      });
    } catch {}
  }
}

// --- LEARN: auto-capture decisions ---
if (toolName === 'Bash') {
  const cmd = toolInput.command || '';

  const installMatch = cmd.match(/(?:npm|pnpm|yarn|bun)\s+(?:add|install)\s+([^\s-][^\s]*)/);
  if (installMatch) {
    try { addMemory('decisions', { decision: `added dependency: ${installMatch[1]}`, source: 'auto-capture' }); } catch {}
  }

  const isTestCmd = /\b(pnpm\s+test|npm\s+test|cargo\s+test|flutter\s+test|bun\s+test|pytest|vitest|jest)\b/i.test(cmd);
  if (isTestCmd) {
    try { addMemory('patterns', { type: 'test_command', command: cmd.trim().slice(0, 100), source: 'auto-capture' }); } catch {}
  }

  const isBuildCmd = /\b(pnpm\s+build|npm\s+run\s+build|cargo\s+build|next\s+build)\b/i.test(cmd);
  if (isBuildCmd) {
    try { addMemory('patterns', { type: 'build_command', command: cmd.trim().slice(0, 100), source: 'auto-capture' }); } catch {}
  }
}

if (category === 'write' && toolInput.file_path) {
  const configPatterns = /\.(config|rc|json|toml|yaml|yml)$/i;
  const configFiles = /(tsconfig|eslint|prettier|vite\.config|next\.config|tailwind\.config|jest\.config|vitest\.config)/i;
  const fp = toolInput.file_path;
  if (configPatterns.test(fp) && configFiles.test(fp)) {
    try { addMemory('decisions', { decision: `modified config: ${basename(fp)}`, source: 'auto-capture' }); } catch {}
  }
}

if (reminders.length > 0) {
  const output = { systemMessage: reminders.join('\n') };
  process.stdout.write(JSON.stringify(output));
}
