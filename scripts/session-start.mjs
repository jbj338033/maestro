import { readStdin } from './lib/stdin.mjs';
import { writeState, readState } from './lib/state.mjs';
import { getAllMemory } from './lib/memory.mjs';
import { scanProject } from './lib/codebase.mjs';

const input = await readStdin();
if (!input) process.exit(0);

const sessionId = input.session_id || 'unknown';
const cwd = input.cwd || process.cwd();

// initialize session state
writeState('session.json', {
  version: 2,
  session_id: sessionId,
  started_at: new Date().toISOString(),
  modified_files: [],
  read_files: [],
  injected_dirs: [],
  consecutive_edits: {},
  tool_counts: { read: 0, write: 0, bash: 0, other: 0 },
  verification: {
    tests_run: false,
    tests_passed: null,
    build_run: false,
    build_passed: null,
    last_verified_file_count: 0
  },
  external_models_consulted: false,
  stop_blocked_at_file_count: 0,
  compact_count: 0,
  notes: null
});

const parts = [];

// --- AMPLIFY: codebase scan ---
try {
  const { summary } = scanProject(cwd);
  if (summary) {
    parts.push(`[Maestro] ${summary}`);
  }
} catch { /* scan failure should never block session */ }

// --- AMPLIFY: restore compact state ---
const compactState = readState('compact-state.json');
if (compactState && compactState.summary) {
  parts.push(`[Maestro] previous session state restored:\n${compactState.summary}`);
}

// --- AMPLIFY: inject actual memory contents ---
const memory = getAllMemory();
const conventions = memory.conventions.entries.slice(-5);
const decisions = memory.decisions.entries.slice(-3);

if (conventions.length > 0) {
  const items = conventions.map(e => {
    const content = e.rule || e.convention || e.description || JSON.stringify(e);
    return `  - ${typeof content === 'string' ? content : JSON.stringify(content)}`;
  });
  parts.push(`[Maestro] conventions from past sessions:\n${items.join('\n')}`);
}

if (decisions.length > 0) {
  const items = decisions.map(e => {
    const content = e.decision || e.description || e.what || JSON.stringify(e);
    return `  - ${typeof content === 'string' ? content : JSON.stringify(content)}`;
  });
  parts.push(`[Maestro] recent decisions:\n${items.join('\n')}`);
}

// --- AMPLIFY: learned project commands ---
const patterns = memory.patterns.entries;
const testCmd = patterns.findLast(e => e.type === 'test_command');
const buildCmd = patterns.findLast(e => e.type === 'build_command');
if (testCmd || buildCmd) {
  const cmds = [];
  if (testCmd) cmds.push(`test: ${testCmd.command}`);
  if (buildCmd) cmds.push(`build: ${buildCmd.command}`);
  parts.push(`[Maestro] learned commands: ${cmds.join(', ')}`);
}

if (parts.length > 0) {
  const output = { systemMessage: parts.join('\n\n') };
  process.stdout.write(JSON.stringify(output));
}
