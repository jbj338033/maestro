import { readStdin } from './lib/stdin.mjs';
import { readState, writeState } from './lib/state.mjs';
import { readMission } from './lib/mission.mjs';
import { addMemory } from './lib/memory.mjs';

const input = await readStdin();
if (!input) process.exit(0);

const session = readState('session.json');
if (!session) process.exit(0);

const mission = readMission();

// --- save session history ---
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

// --- LEARN: meaningful patterns ---
const modCount = session.modified_files?.length || 0;

if (modCount > 0) {
  // learn file co-modification patterns (which files change together)
  if (modCount >= 2 && modCount <= 20) {
    const dirs = [...new Set(session.modified_files.map(f => {
      const parts = f.split('/');
      return parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    }))];
    if (dirs.length >= 2) {
      addMemory('patterns', {
        type: 'co_modification',
        directories: dirs,
        file_count: modCount,
        session_id: session.session_id
      });
    }
  }

  // learn R:W ratio as a pattern
  const tc = session.tool_counts;
  if (tc.write > 0 && tc.read > 0) {
    const ratio = (tc.read / tc.write).toFixed(1);
    addMemory('patterns', {
      type: 'read_write_ratio',
      ratio: parseFloat(ratio),
      reads: tc.read,
      writes: tc.write,
      session_id: session.session_id
    });
  }
}

// --- cleanup stuck subagents ---
const subagents = readState('subagents.json', { agents: [] });
if (subagents?.agents) {
  const cleaned = subagents.agents.map(a =>
    a.status === 'running'
      ? { ...a, status: 'abandoned', abandoned_at: new Date().toISOString() }
      : a
  );
  writeState('subagents.json', { agents: cleaned });
}

// --- clean up transient state ---
writeState('compact-state.json', null);
