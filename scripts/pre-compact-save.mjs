import { readStdin } from './lib/stdin.mjs';
import { readState, writeState, updateState } from './lib/state.mjs';
import { readMission } from './lib/mission.mjs';
import { readMemory } from './lib/memory.mjs';

const input = await readStdin();
if (!input) process.exit(0);

const session = readState('session.json');
const mission = readMission();

// build summary for context injection after compaction
const parts = [];

// mission state
if (mission && mission.objective) {
  const metCount = mission.acceptance_criteria.filter(c => c.verified).length;
  const totalCount = mission.acceptance_criteria.length;
  parts.push(`mission: ${mission.objective}`);
  parts.push(`criteria: ${metCount}/${totalCount} met`);

  const unmet = mission.acceptance_criteria.filter(c => !c.verified);
  if (unmet.length > 0) {
    parts.push('unmet criteria:');
    unmet.forEach(c => parts.push(`  - ${c.description}`));
  }
}

if (session) {
  // modified files
  const modCount = session.modified_files?.length || 0;
  if (modCount > 0) {
    parts.push(`modified files (${modCount}): ${session.modified_files.slice(0, 10).join(', ')}${modCount > 10 ? '...' : ''}`);
  }

  // verification state
  const v = session.verification;
  const testStatus = v.tests_run ? (v.tests_passed ? 'passed' : v.tests_passed === false ? 'failed' : 'run') : 'not run';
  const buildStatus = v.build_run ? (v.build_passed ? 'passed' : v.build_passed === false ? 'failed' : 'run') : 'not run';
  parts.push(`verification: tests ${testStatus}, build ${buildStatus}`);

  // session notes (user/Claude can set via state_write)
  if (session.notes) {
    parts.push(`notes: ${session.notes}`);
  }
}

// recent decisions from this session
const decisions = readMemory('decisions');
const recentDecisions = decisions.entries
  .filter(e => e.source === 'auto-capture')
  .slice(-3);
if (recentDecisions.length > 0) {
  parts.push('recent decisions:');
  recentDecisions.forEach(d => parts.push(`  - ${d.decision || JSON.stringify(d)}`));
}

const summary = parts.join('\n');

// save compact state
writeState('compact-state.json', {
  session,
  mission,
  summary,
  saved_at: new Date().toISOString()
});

// increment compact count
if (session) {
  updateState('session.json', (s) => {
    s.compact_count = (s.compact_count || 0) + 1;
    return s;
  });
}

// inject summary into context so it survives compaction
if (summary) {
  const output = { systemMessage: `[Maestro] state saved before context compaction:\n${summary}` };
  process.stdout.write(JSON.stringify(output));
}
