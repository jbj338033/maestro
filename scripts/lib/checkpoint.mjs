import { execFileSync } from 'node:child_process';
import { readState, writeState, getDataDir } from './state.mjs';
import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const CWD = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function getCheckpointsDir() {
  return 'checkpoints';
}

function git(...args) {
  return execFileSync('git', args, { cwd: CWD, timeout: 5000, encoding: 'utf8' }).trim();
}

function getModifiedFiles() {
  try {
    return git('diff', '--name-only', 'HEAD').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export function createCheckpoint(name, description = '') {
  let git_ref = null;
  let git_type = null;

  try {
    const stash = git('stash', 'create');
    if (stash) {
      git_ref = stash;
      git_type = 'stash';
    } else {
      git_ref = git('rev-parse', 'HEAD');
      git_type = 'commit';
    }
  } catch {
    // no git
  }

  const session_snapshot = readState('session.json', null);
  const mission_snapshot = readState('mission.json', null);
  const modified_files = getModifiedFiles();
  const id = `cp_${Date.now()}_${randomBytes(3).toString('hex')}`;

  writeState(`${getCheckpointsDir()}/${id}.json`, {
    id,
    name,
    description,
    created_at: new Date().toISOString(),
    git_ref,
    git_type,
    session_snapshot,
    mission_snapshot,
    modified_files,
  });

  return { id, name, git_ref, created_at: new Date().toISOString() };
}

export function listCheckpoints() {
  const dir = getCheckpointsDir();
  const absDir = join(getDataDir(), dir);
  const data = [];

  try {
    const files = readdirSync(absDir);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const cp = readState(`${dir}/${f}`, null);
      if (cp) data.push(cp);
    }
  } catch {
    // dir doesn't exist yet
  }

  data.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return data.map(cp => ({
    id: cp.id,
    name: cp.name,
    description: cp.description,
    created_at: cp.created_at,
    modified_files_count: cp.modified_files?.length ?? 0,
  }));
}

export function restoreCheckpoint(id) {
  const cp = readState(`${getCheckpointsDir()}/${id}.json`, null);
  if (!cp) return { success: false, error: 'checkpoint not found' };

  try {
    if (cp.git_type === 'stash') {
      git('stash', 'apply', cp.git_ref);
    } else if (cp.git_type === 'commit') {
      git('checkout', cp.git_ref, '--', '.');
    }
  } catch (err) {
    return { success: false, error: `git restore failed: ${err.message}` };
  }

  if (cp.session_snapshot) {
    const current = readState('session.json', {});
    writeState('session.json', {
      ...cp.session_snapshot,
      session_id: current.session_id,
      started_at: current.started_at,
    });
  }

  if (cp.mission_snapshot) {
    writeState('mission.json', cp.mission_snapshot);
  }

  return { success: true, restored_to: cp.name };
}

export function deleteCheckpoint(id) {
  const filepath = join(getDataDir(), getCheckpointsDir(), `${id}.json`);
  try {
    unlinkSync(filepath);
  } catch {
    // already gone
  }
}

export function cleanOldCheckpoints(keep = 10) {
  const all = listCheckpoints();
  if (all.length <= keep) return;

  const toDelete = all.slice(keep);
  for (const cp of toDelete) {
    deleteCheckpoint(cp.id);
  }
}
