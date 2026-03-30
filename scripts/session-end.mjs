import { readStdin } from './lib/stdin.mjs';
import { readState, writeState } from './lib/state.mjs';
import { readMission } from './lib/mission.mjs';
import { addMemory } from './lib/memory.mjs';

const input = await readStdin();
if (!input) process.exit(0);

const session = readState('session.json');
if (!session) process.exit(0);

const mission = readMission();

// save session history
const historyEntry = {
  session_id: session.session_id,
  started_at: session.started_at,
  ended_at: new Date().toISOString(),
  modified_files: session.modified_files,
  tool_counts: session.tool_counts,
  verification: session.verification,
  mission: mission ? {
    objective: mission.objective,
    criteria_met: mission.acceptance_criteria.filter(c => c.verified).length,
    criteria_total: mission.acceptance_criteria.length
  } : null
};

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
writeState(`history/${timestamp}.json`, historyEntry);

// auto-learn patterns from this session
const modCount = session.modified_files?.length || 0;
if (modCount > 0) {
  // record which file patterns were commonly modified together
  const extensions = [...new Set(session.modified_files.map(f => {
    const parts = f.split('.');
    return parts.length > 1 ? parts.pop() : 'unknown';
  }))];

  if (extensions.length > 0) {
    addMemory('patterns', {
      type: 'file_extensions',
      extensions,
      file_count: modCount,
      session_id: session.session_id
    });
  }
}

// clean up transient state
writeState('compact-state.json', null);
writeState('subagents.json', { agents: [] });
