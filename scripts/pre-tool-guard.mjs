import { readStdin } from './lib/stdin.mjs';
import { readState } from './lib/state.mjs';

const input = await readStdin();
if (!input) process.exit(0);

const toolName = input.tool_name || '';
const toolInput = input.tool_input || {};

const session = readState('session.json');
if (!session) process.exit(0);

const counts = session.tool_counts || { read: 0, write: 0, bash: 0, other: 0 };
const warnings = [];

const isWrite = ['Write', 'Edit'].includes(toolName);

// warn on first write without any reads
if (isWrite && counts.read === 0) {
  warnings.push('[Maestro] 아직 파일을 읽지 않았는데 쓰기를 시도합니다. 관련 파일을 먼저 읽으세요.');
}

// warn on high write:read ratio
if (isWrite && counts.write > 0 && counts.read > 0) {
  const ratio = counts.write / counts.read;
  if (ratio >= 3) {
    warnings.push(`[Maestro] Write:Read 비율이 ${ratio.toFixed(1)}:1입니다. 읽기를 더 하고 검증하세요.`);
  }
}

// dangerous pattern warnings
if (toolName === 'Bash') {
  const cmd = toolInput.command || '';
  if (/git\s+add\s+(-A|\.)\s*$/i.test(cmd)) {
    warnings.push('[Maestro] git add -A는 위험합니다. git status로 먼저 확인하세요.');
  }
  if (/rm\s+-rf?\s+/i.test(cmd) && !/node_modules|dist|build|\.maestro/i.test(cmd)) {
    warnings.push('[Maestro] rm -rf 감지. 정말 삭제할 대상이 맞는지 확인하세요.');
  }
}

if (warnings.length > 0) {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: warnings.join('\n')
    }
  };
  process.stdout.write(JSON.stringify(output));
}
