import { readStdin } from './lib/stdin.mjs';
import { readState, writeState, updateState } from './lib/state.mjs';
import { readMission } from './lib/mission.mjs';

const input = await readStdin();
if (!input) process.exit(0);

const session = readState('session.json');
const mission = readMission();

// build summary for context injection after compaction
const parts = [];

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
  const modCount = session.modified_files?.length || 0;
  if (modCount > 0) {
    parts.push(`modified files (${modCount}): ${session.modified_files.slice(0, 10).join(', ')}${modCount > 10 ? '...' : ''}`);
  }
  parts.push(`verification: tests ${session.verification.tests_run ? 'run' : 'not run'}, build ${session.verification.build_run ? 'run' : 'not run'}`);
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
