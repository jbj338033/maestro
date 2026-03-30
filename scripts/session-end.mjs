import { readStdin } from './lib/stdin.mjs';
import { readState, writeState } from './lib/state.mjs';
import { readMission } from './lib/mission.mjs';
import { addMemory, readMemory } from './lib/memory.mjs';
import { dirname } from 'node:path';

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
  intent: session.intent,
  intent_confidence: session.intent_confidence,
  mission: mission ? {
    objective: mission.objective,
    criteria_met: mission.acceptance_criteria.filter(c => c.verified).length,
    criteria_total: mission.acceptance_criteria.length
  } : null
};

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
writeState(`history/${timestamp}.json`, historyEntry);

// --- LEARN: file-level co-modification patterns ---
const modCount = session.modified_files?.length || 0;

if (modCount >= 2 && modCount <= 10) {
  addMemory('patterns', {
    type: 'file_co_modification',
    files: session.modified_files.slice(0, 10),
    file_count: modCount,
    session_id: session.session_id
  });
}

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

if (modCount > 0) {
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

// --- LEARN: risk profiles (forgot tests, circular edits) ---
try {
  const riskProfiles = readState('memory/risk-profiles.json', { directories: {}, user_patterns: {} });

  if (modCount > 0 && !session.verification.tests_run) {
    const dirs = [...new Set(session.modified_files.map(f => dirname(f)))];
    for (const dir of dirs) {
      if (!riskProfiles.directories[dir]) riskProfiles.directories[dir] = {};
      riskProfiles.directories[dir].forgot_tests_count =
        (riskProfiles.directories[dir].forgot_tests_count || 0) + 1;
      riskProfiles.directories[dir].last_incident = new Date().toISOString();
    }
  }

  const circularEdits = session.consecutive_edits || {};
  for (const [fp, count] of Object.entries(circularEdits)) {
    if (count >= 3) {
      const dir = dirname(fp);
      if (!riskProfiles.directories[dir]) riskProfiles.directories[dir] = {};
      riskProfiles.directories[dir].circular_edit_count =
        (riskProfiles.directories[dir].circular_edit_count || 0) + 1;
    }
  }

  riskProfiles.user_patterns.total_sessions = (riskProfiles.user_patterns.total_sessions || 0) + 1;
  const tc = session.tool_counts;
  if (tc.write > 0 && tc.read > 0) {
    riskProfiles.user_patterns.avg_read_write_ratio = parseFloat((tc.read / tc.write).toFixed(1));
  }

  writeState('memory/risk-profiles.json', riskProfiles);
} catch {}

// --- LEARN: cross-project intelligence promotion ---
try {
  const { promoteToGlobal, updateTechProfile } = await import('./lib/global-memory.mjs');
  const technologies = session.technologies || [];
  const projectId = session.project_id || 'unknown';

  if (technologies.length > 0) {
    const conventions = readMemory('conventions');
    for (const entry of conventions.entries) {
      const content = JSON.stringify(entry);
      if (!/\/[a-zA-Z]/.test(content)) {
        promoteToGlobal(entry, projectId, technologies);
      }
    }

    const patterns = readMemory('patterns');
    const testCmd = patterns.entries.findLast(e => e.type === 'test_command');
    if (testCmd) {
      for (const tech of technologies) {
        updateTechProfile(tech, { type: 'best_practice', content: `test command: ${testCmd.command}` });
      }
    }
  }
} catch {}

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

// --- cleanup old checkpoints ---
try {
  const { cleanOldCheckpoints } = await import('./lib/checkpoint.mjs');
  cleanOldCheckpoints(10);
} catch {}

// --- clean up transient state ---
writeState('compact-state.json', null);
