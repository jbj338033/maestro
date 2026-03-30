import { readStdin } from './lib/stdin.mjs';
import { readState } from './lib/state.mjs';

const input = await readStdin();
if (!input) process.exit(0);

const toolName = input.tool_name || '';
const toolInput = input.tool_input || {};

const session = readState('session.json');
if (!session) process.exit(0);

const counts = session.tool_counts || { read: 0, write: 0, bash: 0, other: 0 };
const warnings = [];

const isWrite = ['Write', 'Edit'].includes(toolName);

// warn on first write without any reads
if (isWrite && counts.read === 0) {
  warnings.push('[Maestro] attempting to write without reading any files first. read related files before writing.');
}

// warn on high write:read ratio
if (isWrite && counts.write > 0 && counts.read > 0) {
  const ratio = counts.write / counts.read;
  if (ratio >= 3) {
    warnings.push(`[Maestro] write:read ratio is ${ratio.toFixed(1)}:1. read more files and verify before continuing.`);
  }
}

// dangerous bash patterns
if (toolName === 'Bash') {
  const cmd = toolInput.command || '';

  if (/git\s+add\s+(-A|\.)\s*$/i.test(cmd)) {
    warnings.push('[Maestro] git add -A is dangerous. run git status first to review changes.');
  }
  if (/git\s+push\s+.*--force/i.test(cmd) || /git\s+push\s+-f\b/i.test(cmd)) {
    warnings.push('[Maestro] force push detected. this may overwrite remote branch history.');
  }
  if (/git\s+reset\s+--hard/i.test(cmd)) {
    warnings.push('[Maestro] git reset --hard detected. all uncommitted changes will be lost.');
  }
  if (/git\s+checkout\s+\.\s*$/i.test(cmd) || /git\s+restore\s+\.\s*$/i.test(cmd)) {
    warnings.push('[Maestro] discard-all detected. in-progress changes may be lost.');
  }
  if (/rm\s+-rf?\s+/i.test(cmd) && !/node_modules|dist|build|\.maestro|\.next|target/i.test(cmd)) {
    warnings.push('[Maestro] rm -rf detected. verify the target is correct.');
  }
  if (/\benv\b|\bprintenv\b|echo\s+\$\w*(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/i.test(cmd)) {
    warnings.push('[Maestro] possible secret/env exposure. output will be included in context.');
  }
  if (/--no-verify/i.test(cmd)) {
    warnings.push('[Maestro] --no-verify detected. skipping git hooks bypasses validation.');
  }
}

if (warnings.length > 0) {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: warnings.join('\n')
    }
  };
  process.stdout.write(JSON.stringify(output));
}
