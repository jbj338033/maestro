import { readStdin } from './lib/stdin.mjs';
import { readState } from './lib/state.mjs';

const input = await readStdin();
if (!input) process.exit(0);

const compactState = readState('compact-state.json');
if (!compactState || !compactState.summary) process.exit(0);

const output = {
  systemMessage: `[Maestro] 컨텍스트 압축 후 복원됨:\n${compactState.summary}\n\n현재 상태를 확인하려면 mcp__maestro__state_read 또는 mcp__maestro__mission_read를 사용하세요.`
};
process.stdout.write(JSON.stringify(output));
