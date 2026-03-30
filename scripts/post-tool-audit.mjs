import { readStdin } from './lib/stdin.mjs';
import { updateState } from './lib/state.mjs';

const input = await readStdin();
if (!input) process.exit(0);

const toolName = input.tool_name || '';
const toolInput = input.tool_input || {};
const toolResponse = input.tool_response;

// categorize tool
let category = 'other';
if (['Read', 'Glob', 'Grep'].includes(toolName)) category = 'read';
else if (['Write', 'Edit'].includes(toolName)) category = 'write';
else if (toolName === 'Bash') category = 'bash';

// update session state
const session = updateState('session.json', (s) => {
  if (!s || !s.tool_counts) return s;

  s.tool_counts[category] = (s.tool_counts[category] || 0) + 1;

  // track modified files
  if (category === 'write' && toolInput.file_path) {
    if (!s.modified_files.includes(toolInput.file_path)) {
      s.modified_files.push(toolInput.file_path);
    }
  }

  // track read files
  if (category === 'read' && toolInput.file_path) {
    if (!s.read_files.includes(toolInput.file_path)) {
      s.read_files.push(toolInput.file_path);
    }
  }

  // detect test/build runs from bash commands
  if (toolName === 'Bash') {
    const cmd = toolInput.command || '';
    const isTestCmd = /\b(test|spec|jest|vitest|mocha|pytest|cargo\s+test|flutter\s+test|pnpm\s+test|npm\s+test|bun\s+test)\b/i.test(cmd);
    const isBuildCmd = /\b(build|compile|tsc|cargo\s+build|flutter\s+build|pnpm\s+build|npm\s+run\s+build|bun\s+build|next\s+build)\b/i.test(cmd);

    // detect pass/fail from tool_response
    const responseStr = typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse || '');
    const hasError = /error|failed|failure|FAIL|ERR!/i.test(responseStr) && !/0 errors|0 failed/i.test(responseStr);

    if (isTestCmd) {
      s.verification.tests_run = true;
      s.verification.tests_passed = !hasError;
      // reset stop gate so it can re-block if tests fail
      if (hasError) s.stop_blocked_once = false;
    }
    if (isBuildCmd) {
      s.verification.build_run = true;
      s.verification.build_passed = !hasError;
      if (hasError) s.stop_blocked_once = false;
    }
  }

  return s;
}, {});

if (!session) process.exit(0);

// generate reminders based on thresholds
const modCount = session.modified_files?.length || 0;
const reminders = [];

if (modCount === 5) {
  reminders.push(`[Maestro] ${modCount}개 파일이 수정되었습니다. 테스트를 실행하고, codex-bridge 또는 gemini-bridge로 교차 검증을 고려하세요.`);
}

if (modCount === 10) {
  reminders.push(`[Maestro] ${modCount}개 파일이 수정되었습니다. critic 에이전트로 심층 리뷰를 강력히 추천합니다.`);
}

// remind about failed tests/builds
const v = session.verification;
if (v.tests_passed === false) {
  reminders.push('[Maestro] 테스트가 실패했습니다. 수정 후 다시 실행하세요.');
}
if (v.build_passed === false) {
  reminders.push('[Maestro] 빌드가 실패했습니다. 에러를 확인하세요.');
}

if (reminders.length > 0) {
  const output = { systemMessage: reminders.join('\n') };
  process.stdout.write(JSON.stringify(output));
}
