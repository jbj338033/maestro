import { readStdin } from './lib/stdin.mjs';
import { updateState, readState } from './lib/state.mjs';

const input = await readStdin();
if (!input) process.exit(0);

const toolName = input.tool_name || '';
const toolInput = input.tool_input || {};

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

  // detect test/build runs
  if (toolName === 'Bash') {
    const cmd = toolInput.command || '';
    if (/\b(test|spec|jest|vitest|mocha|pytest|cargo\s+test|flutter\s+test|pnpm\s+test|npm\s+test)\b/i.test(cmd)) {
      s.verification.tests_run = true;
    }
    if (/\b(build|compile|tsc|cargo\s+build|flutter\s+build|pnpm\s+build|npm\s+run\s+build)\b/i.test(cmd)) {
      s.verification.build_run = true;
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

if (reminders.length > 0) {
  const output = { systemMessage: reminders.join('\n') };
  process.stdout.write(JSON.stringify(output));
}
