import { readStdin } from './lib/stdin.mjs';
import { writeState, readState } from './lib/state.mjs';
import { getAllMemory } from './lib/memory.mjs';

const input = await readStdin();
if (!input) process.exit(0);

const sessionId = input.session_id || 'unknown';

// initialize session state
writeState('session.json', {
  version: 1,
  session_id: sessionId,
  started_at: new Date().toISOString(),
  modified_files: [],
  read_files: [],
  tool_counts: { read: 0, write: 0, bash: 0, other: 0 },
  verification: {
    tests_run: false,
    tests_passed: null,
    build_run: false,
    build_passed: null
  },
  external_models_consulted: false,
  stop_blocked_once: false,
  compact_count: 0
});

// build context injection
const parts = [];

// restore compact state if exists
const compactState = readState('compact-state.json');
if (compactState && compactState.summary) {
  parts.push(`[Maestro] 이전 작업 상태 복원됨:\n${compactState.summary}`);
}

// load cross-session memory
const memory = getAllMemory();
const conventionCount = memory.conventions.entries.length;
const decisionCount = memory.decisions.entries.length;
if (conventionCount > 0 || decisionCount > 0) {
  parts.push(`[Maestro] 세션 간 기억 로드됨: 컨벤션 ${conventionCount}개, 결정 ${decisionCount}개. mcp__maestro__memory_read로 확인 가능.`);
}

if (parts.length > 0) {
  const output = { systemMessage: parts.join('\n\n') };
  process.stdout.write(JSON.stringify(output));
}
