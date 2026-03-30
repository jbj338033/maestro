import { readStdin } from './lib/stdin.mjs';
import { readState, updateState } from './lib/state.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const input = await readStdin();
if (!input) process.exit(0);

const toolName = input.tool_name || '';
const toolInput = input.tool_input || {};

const session = readState('session.json');
if (!session) process.exit(0);

const counts = session.tool_counts || { read: 0, write: 0, bash: 0, other: 0 };
const warnings = [];
let additionalContext = null;

const isWrite = ['Write', 'Edit'].includes(toolName);
const isRead = toolName === 'Read';

// --- GUARD: write without read ---
if (isWrite && counts.read === 0) {
  warnings.push('[Maestro] attempting to write without reading any files first. read related files before writing.');
}

// --- GUARD: high write:read ratio ---
if (isWrite && counts.write > 0 && counts.read > 0) {
  const ratio = counts.write / counts.read;
  if (ratio >= 3) {
    warnings.push(`[Maestro] write:read ratio is ${ratio.toFixed(1)}:1. read more files and verify before continuing.`);
  }
}

// --- GUARD: circular edit detection ---
if (isWrite && toolInput.file_path) {
  const fp = toolInput.file_path;
  const edits = session.consecutive_edits || {};
  const count = (edits[fp] || 0) + 1;

  if (count >= 3) {
    warnings.push(`[Maestro] ${count} consecutive edits to ${fp} without re-reading. consider reading the file to verify your changes.`);
  }

  // update consecutive edit count
  updateState('session.json', (s) => {
    if (!s.consecutive_edits) s.consecutive_edits = {};
    s.consecutive_edits[fp] = count;
    return s;
  });
}

// --- GUARD: reset consecutive edits on read ---
if (isRead && toolInput.file_path) {
  const fp = toolInput.file_path;
  const edits = session.consecutive_edits || {};
  if (edits[fp]) {
    updateState('session.json', (s) => {
      if (s.consecutive_edits) delete s.consecutive_edits[fp];
      return s;
    });
  }
}

// --- AMPLIFY: directory context injection ---
if (isRead && toolInput.file_path) {
  const dir = dirname(toolInput.file_path);
  const injectedDirs = session.injected_dirs || [];

  if (!injectedDirs.includes(dir)) {
    const contextFiles = ['README.md', 'ARCHITECTURE.md', 'readme.md'];
    for (const name of contextFiles) {
      const contextPath = join(dir, name);
      if (existsSync(contextPath)) {
        try {
          const content = readFileSync(contextPath, 'utf8');
          // cap at 2000 chars to avoid flooding context
          const trimmed = content.length > 2000 ? content.slice(0, 2000) + '\n...(truncated)' : content;
          additionalContext = `[Maestro] directory context from ${name}:\n${trimmed}`;
        } catch { /* ignore */ }
        break;
      }
    }

    // mark as injected regardless of whether a file was found
    updateState('session.json', (s) => {
      if (!s.injected_dirs) s.injected_dirs = [];
      s.injected_dirs.push(dir);
      return s;
    });
  }
}

// --- GUARD: dangerous bash patterns ---
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

// build output
const output = {};
const contextParts = [];

if (warnings.length > 0) contextParts.push(warnings.join('\n'));
if (additionalContext) contextParts.push(additionalContext);

if (contextParts.length > 0) {
  output.hookSpecificOutput = {
    hookEventName: 'PreToolUse',
    additionalContext: contextParts.join('\n\n')
  };
  process.stdout.write(JSON.stringify(output));
}
