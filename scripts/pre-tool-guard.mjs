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

// dangerous bash patterns
if (toolName === 'Bash') {
  const cmd = toolInput.command || '';

  if (/git\s+add\s+(-A|\.)\s*$/i.test(cmd)) {
    warnings.push('[Maestro] git add -A는 위험합니다. git status로 먼저 확인하세요.');
  }
  if (/git\s+push\s+.*--force/i.test(cmd) || /git\s+push\s+-f\b/i.test(cmd)) {
    warnings.push('[Maestro] force push 감지. 원격 브랜치를 덮어쓸 수 있습니다.');
  }
  if (/git\s+reset\s+--hard/i.test(cmd)) {
    warnings.push('[Maestro] git reset --hard 감지. 커밋되지 않은 변경이 모두 사라집니다.');
  }
  if (/git\s+checkout\s+\.\s*$/i.test(cmd) || /git\s+restore\s+\.\s*$/i.test(cmd)) {
    warnings.push('[Maestro] 모든 변경 취소 명령 감지. 작업 중인 변경이 사라질 수 있습니다.');
  }
  if (/rm\s+-rf?\s+/i.test(cmd) && !/node_modules|dist|build|\.maestro|\.next|target/i.test(cmd)) {
    warnings.push('[Maestro] rm -rf 감지. 정말 삭제할 대상이 맞는지 확인하세요.');
  }
  if (/\benv\b|\bprintenv\b|echo\s+\$\w*(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/i.test(cmd)) {
    warnings.push('[Maestro] 환경변수/시크릿 노출 가능성. 출력이 컨텍스트에 포함됩니다.');
  }
  if (/--no-verify/i.test(cmd)) {
    warnings.push('[Maestro] --no-verify 감지. git hook을 건너뛰면 검증이 누락됩니다.');
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
