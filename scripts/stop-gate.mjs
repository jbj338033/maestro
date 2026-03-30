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
  reasons.push(`${modCount}개 파일을 수정했지만 테스트를 실행하지 않았습니다.`);
}

// check: did tests pass?
if (session.verification.tests_run && session.verification.tests_passed === false) {
  reasons.push('테스트가 실패한 상태입니다. 수정 후 다시 실행하세요.');
}

// check: was build run? (only if 3+ files modified)
if (!session.verification.build_run && modCount >= 3) {
  reasons.push('3개 이상 파일을 수정했지만 빌드를 확인하지 않았습니다.');
}

// check: did build pass?
if (session.verification.build_run && session.verification.build_passed === false) {
  reasons.push('빌드가 실패한 상태입니다. 에러를 확인하세요.');
}

if (reasons.length === 0) process.exit(0);

// mark current file count as blocked
updateState('session.json', (s) => {
  s.stop_blocked_at_file_count = modCount;
  return s;
});

const message = `[Maestro] 완료 전 검증이 필요합니다:\n- ${reasons.join('\n- ')}\n\n테스트와 빌드를 실행한 후 다시 시도하세요.`;
process.stderr.write(message);
process.exit(2);
