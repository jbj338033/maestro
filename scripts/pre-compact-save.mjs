import { readStdin } from './lib/stdin.mjs';
import { readState, writeState, updateState } from './lib/state.mjs';
import { readMission } from './lib/mission.mjs';

const input = await readStdin();
if (!input) process.exit(0);

const session = readState('session.json');
const mission = readMission();

// build summary for context injection after compaction
const parts = [];

if (mission && mission.objective) {
  const metCount = mission.acceptance_criteria.filter(c => c.verified).length;
  const totalCount = mission.acceptance_criteria.length;
  parts.push(`미션: ${mission.objective}`);
  parts.push(`수용 기준: ${metCount}/${totalCount} 충족`);

  const unmet = mission.acceptance_criteria.filter(c => !c.verified);
  if (unmet.length > 0) {
    parts.push('미충족 기준:');
    unmet.forEach(c => parts.push(`  - ${c.description}`));
  }
}

if (session) {
  const modCount = session.modified_files?.length || 0;
  if (modCount > 0) {
    parts.push(`수정된 파일 (${modCount}개): ${session.modified_files.slice(0, 10).join(', ')}${modCount > 10 ? '...' : ''}`);
  }
  parts.push(`검증 상태: 테스트 ${session.verification.tests_run ? '실행됨' : '미실행'}, 빌드 ${session.verification.build_run ? '실행됨' : '미실행'}`);
}

const summary = parts.join('\n');

// save compact state
writeState('compact-state.json', {
  session,
  mission,
  summary,
  saved_at: new Date().toISOString()
});

// increment compact count
if (session) {
  updateState('session.json', (s) => {
    s.compact_count = (s.compact_count || 0) + 1;
    return s;
  });
}

// inject summary into context so it survives compaction
if (summary) {
  const output = { systemMessage: `[Maestro] 컨텍스트 압축 전 상태 저장됨:\n${summary}` };
  process.stdout.write(JSON.stringify(output));
}
