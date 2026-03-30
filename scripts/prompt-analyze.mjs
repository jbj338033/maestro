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

if (/test|테스트/i.test(prompt)) criteria.push('relevant tests must pass');
if (/build|빌드/i.test(prompt)) criteria.push('build must succeed');
criteria.push('implementation matches the request');
if (complexity === 'high') criteria.push('no regressions in existing functionality');

createMission(objective, criteria, [], complexity);

const output = {
  systemMessage: `[Maestro] mission auto-generated (complexity: ${complexity}).\nobjective: ${objective}\n${criteria.length} acceptance criteria. use mcp__maestro__mission_read to review.`
};
process.stdout.write(JSON.stringify(output));
