import { readStdin } from './lib/stdin.mjs';
import { writeState, readState } from './lib/state.mjs';
import { getAllMemory } from './lib/memory.mjs';
import { scanProject } from './lib/codebase.mjs';
import { getRelevantGlobal } from './lib/global-memory.mjs';

const input = await readStdin();
if (!input) process.exit(0);

const sessionId = input.session_id || 'unknown';
const cwd = input.cwd || process.cwd();

// initialize session state (v3: adds intent, heal, proof, checkpoint fields)
writeState('session.json', {
  version: 3,
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
  notes: null,
  // v3 fields
  intent_detected: false,
  intent: null,
  intent_confidence: 0,
  guard_level: 'standard',
  suggested_agents: [],
  last_errors: null,
  last_error_file_count: null,
  proof_report: null,
  technologies: [],
  project_id: null,
});

// initialize replay log
writeState('replay.json', { calls: [], started_at: new Date().toISOString() });

const parts = [];
let projectMeta = null;

// --- AMPLIFY: codebase scan ---
try {
  const result = scanProject(cwd);
  if (result.summary) {
    parts.push(`[Maestro] ${result.summary}`);
  }
  projectMeta = result.meta;
} catch {}

// --- AMPLIFY: store project identity ---
if (projectMeta) {
  const technologies = [...(projectMeta.languages || [])];
  if (projectMeta.framework) technologies.push(projectMeta.framework);
  const projectId = projectMeta.description || cwd.split('/').pop() || 'unknown';
  writeState('session.json', {
    ...readState('session.json'),
    technologies,
    project_id: projectId,
  });
}

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

// --- AMPLIFY: cross-project intelligence ---
try {
  const session = readState('session.json');
  const technologies = session?.technologies || [];
  if (technologies.length > 0) {
    const global = getRelevantGlobal(technologies);
    const promoted = global.conventions.filter(e => e.seen_in_projects >= 2);
    if (promoted.length > 0) {
      const items = promoted.slice(0, 5).map(e => {
        const content = e.rule || e.convention || e.description || JSON.stringify(e);
        return `  - ${typeof content === 'string' ? content : JSON.stringify(content)}`;
      });
      parts.push(`[Maestro] cross-project conventions:\n${items.join('\n')}`);
    }
  }
} catch {}

if (parts.length > 0) {
  const output = { systemMessage: parts.join('\n\n') };
  process.stdout.write(JSON.stringify(output));
}
