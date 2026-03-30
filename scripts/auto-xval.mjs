import { readStdin } from './lib/stdin.mjs';
import { readState } from './lib/state.mjs';

const input = await readStdin();
if (!input) process.exit(0);

// this is advisory only — never blocks
const session = readState('session.json');
if (!session) process.exit(0);

const modCount = session.modified_files?.length || 0;
const threshold = parseInt(process.env.MAESTRO_XVAL_THRESHOLD || '5', 10);

// skip if few changes or already consulted external models
if (modCount < threshold || session.external_models_consulted) process.exit(0);

const output = {
  systemMessage: `[Maestro] ${modCount}개 파일이 수정되었지만 외부 모델을 확인하지 않았습니다. codex-bridge 또는 gemini-bridge 에이전트로 교차 검증을 고려하세요.`
};
process.stdout.write(JSON.stringify(output));
