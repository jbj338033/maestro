import { readStdin } from './lib/stdin.mjs';
import { readState, updateState } from './lib/state.mjs';
import { readMission } from './lib/mission.mjs';

const input = await readStdin();
if (!input) process.exit(0);

// respect Claude Code contract: if stop_hook_active, never block
if (input.stop_hook_active) process.exit(0);

const session = readState('session.json');
if (!session) process.exit(0);

// if no files were modified, no need to block
const modCount = session.modified_files?.length || 0;
if (modCount === 0) process.exit(0);

// check if already blocked once this session
if (session.stop_blocked_once) process.exit(0);

const reasons = [];

// check: were tests run?
if (!session.verification.tests_run) {
  reasons.push(`${modCount}개 파일을 수정했지만 테스트를 실행하지 않았습니다.`);
}

// check: was build run? (only if project likely has a build step)
if (!session.verification.build_run && modCount >= 3) {
  reasons.push('3개 이상 파일을 수정했지만 빌드를 확인하지 않았습니다.');
}

if (reasons.length === 0) process.exit(0);

// mark that we've blocked once
updateState('session.json', (s) => {
  s.stop_blocked_once = true;
  return s;
});

// block with exit 2
const message = `[Maestro] 완료 전 검증이 필요합니다:\n- ${reasons.join('\n- ')}\n\n테스트와 빌드를 실행한 후 다시 시도하세요.`;
process.stderr.write(message);
process.exit(2);
