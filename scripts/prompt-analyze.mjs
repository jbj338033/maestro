import { readStdin } from './lib/stdin.mjs';
import { readState } from './lib/state.mjs';
import { readMission, createMission } from './lib/mission.mjs';

const input = await readStdin();
if (!input) process.exit(0);

const prompt = input.user_prompt || '';
if (!prompt || prompt.length < 10) process.exit(0);

// skip if mission already exists
const existing = readMission();
if (existing && existing.objective) process.exit(0);

// detect complex tasks via keyword heuristics
const complexitySignals = [
  /리팩토링|refactor/i,
  /구현해|implement|만들어|build/i,
  /마이그레이션|migrat/i,
  /새로운?\s*(기능|feature|모듈|module)/i,
  /전체|전부|모든|all\s+files/i,
  /아키텍처|architect/i,
  /최적화|optimiz/i,
  /테스트.*추가|add.*test/i,
];

const matchCount = complexitySignals.filter(r => r.test(prompt)).length;

// also check if multiple files are mentioned
const filePatterns = prompt.match(/\b[\w/.-]+\.(ts|js|rs|swift|tsx|jsx|py|go|md)\b/gi);
const fileCount = filePatterns ? new Set(filePatterns).size : 0;

const isComplex = matchCount >= 1 || fileCount >= 3 || prompt.length > 300;

if (!isComplex) process.exit(0);

// determine complexity level
const complexity = (matchCount >= 2 || fileCount >= 5) ? 'high' : 'medium';

// auto-generate mission draft
const objective = prompt.slice(0, 200);
const criteria = [];

if (/test|테스트/i.test(prompt)) criteria.push('관련 테스트가 통과해야 함');
if (/build|빌드/i.test(prompt)) criteria.push('빌드가 성공해야 함');
criteria.push('구현이 요청 사항과 일치해야 함');
if (complexity === 'high') criteria.push('기존 기능에 대한 회귀가 없어야 함');

createMission(objective, criteria, [], complexity);

const output = {
  systemMessage: `[Maestro] 미션이 자동 생성되었습니다 (complexity: ${complexity}).\n목표: ${objective}\n수용 기준 ${criteria.length}개. mcp__maestro__mission_read로 확인하세요.`
};
process.stdout.write(JSON.stringify(output));
