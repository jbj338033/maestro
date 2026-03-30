import { readStdin } from './lib/stdin.mjs';
import { updateState } from './lib/state.mjs';

const input = await readStdin();
if (!input) process.exit(0);

const toolName = input.tool_name || '';
const toolInput = input.tool_input || {};
const toolResponse = input.tool_response;

// categorize tool
let category = 'other';
if (['Read', 'Glob', 'Grep'].includes(toolName)) category = 'read';
else if (['Write', 'Edit'].includes(toolName)) category = 'write';
else if (toolName === 'Bash') category = 'bash';

// update session state
const session = updateState('session.json', (s) => {
  if (!s || !s.tool_counts) return s;

  s.tool_counts[category] = (s.tool_counts[category] || 0) + 1;

  // track modified files
  if (category === 'write' && toolInput.file_path) {
    if (!s.modified_files.includes(toolInput.file_path)) {
      s.modified_files.push(toolInput.file_path);
    }
  }

  // track read files
  if (category === 'read' && toolInput.file_path) {
    if (!s.read_files.includes(toolInput.file_path)) {
      s.read_files.push(toolInput.file_path);
    }
  }

  // detect test/build runs from bash commands
  if (toolName === 'Bash') {
    const cmd = toolInput.command || '';
    const isTestCmd = /\b(test|spec|jest|vitest|mocha|pytest|cargo\s+test|flutter\s+test|pnpm\s+test|npm\s+test|bun\s+test)\b/i.test(cmd);
    const isBuildCmd = /\b(build|compile|tsc|cargo\s+build|flutter\s+build|pnpm\s+build|npm\s+run\s+build|bun\s+build|next\s+build)\b/i.test(cmd);

    // detect pass/fail from tool_response
    const responseStr = typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse || '');
    const hasError = /error|failed|failure|FAIL|ERR!/i.test(responseStr) && !/0 errors|0 failed/i.test(responseStr);

    if (isTestCmd) {
      s.verification.tests_run = true;
      s.verification.tests_passed = !hasError;
      // reset stop gate so it can re-block if tests fail
      if (hasError) s.stop_blocked_once = false;
    }
    if (isBuildCmd) {
      s.verification.build_run = true;
      s.verification.build_passed = !hasError;
      if (hasError) s.stop_blocked_once = false;
    }
  }

  return s;
}, {});

if (!session) process.exit(0);

// generate reminders based on thresholds
const modCount = session.modified_files?.length || 0;
const reminders = [];

if (modCount === 5) {
  reminders.push(`[Maestro] ${modCount} files modified. consider running tests and cross-validating with codex-bridge or gemini-bridge.`);
}

if (modCount === 10) {
  reminders.push(`[Maestro] ${modCount} files modified. strongly recommend running critic agent for a deep review.`);
}

// remind about failed tests/builds
const v = session.verification;
if (v.tests_passed === false) {
  reminders.push('[Maestro] tests failed. fix and re-run before completing.');
}
if (v.build_passed === false) {
  reminders.push('[Maestro] build failed. check errors before completing.');
}

if (reminders.length > 0) {
  const output = { systemMessage: reminders.join('\n') };
  process.stdout.write(JSON.stringify(output));
}
