import { readStdin } from './lib/stdin.mjs';
import { readState, updateState } from './lib/state.mjs';

const input = await readStdin();
if (!input) process.exit(0);

// respect Claude Code contract: if stop_hook_active, never block
if (input.stop_hook_active) process.exit(0);

const session = readState('session.json');
if (!session) process.exit(0);

// if no files were modified, no need to block
const modCount = session.modified_files?.length || 0;
if (modCount === 0) process.exit(0);

// re-block if new files were modified since last block
const lastBlockedAt = session.stop_blocked_at_file_count || 0;
const hasNewModifications = modCount > lastBlockedAt;

// skip if already blocked at this file count
if (!hasNewModifications) process.exit(0);

const reasons = [];

// check: were tests run?
if (!session.verification.tests_run) {
  reasons.push(`modified ${modCount} files but tests were not run.`);
}

// check: did tests pass?
if (session.verification.tests_run && session.verification.tests_passed === false) {
  reasons.push('tests are failing. fix and re-run before completing.');
}

// check: was build run? (only if 3+ files modified)
if (!session.verification.build_run && modCount >= 3) {
  reasons.push('modified 3+ files but build was not verified.');
}

// check: did build pass?
if (session.verification.build_run && session.verification.build_passed === false) {
  reasons.push('build is failing. check errors before completing.');
}

if (reasons.length === 0) process.exit(0);

// mark current file count as blocked
updateState('session.json', (s) => {
  s.stop_blocked_at_file_count = modCount;
  return s;
});

const message = `[Maestro] verification required before completing:\n- ${reasons.join('\n- ')}\n\nrun tests and build, then try again.`;
process.stderr.write(message);
process.exit(2);
