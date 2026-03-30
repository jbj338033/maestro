import { readStdin } from './lib/stdin.mjs';
import { readState, updateState } from './lib/state.mjs';
import { getGuardLevel, getRequiredVerifications } from './lib/risk.mjs';

const input = await readStdin();
if (!input) process.exit(0);

if (input.stop_hook_active) process.exit(0);

const session = readState('session.json');
if (!session) process.exit(0);

const modCount = session.modified_files?.length || 0;
if (modCount === 0) process.exit(0);

const lastBlockedAt = session.stop_blocked_at_file_count || 0;
if (modCount <= lastBlockedAt) process.exit(0);

// determine max guard level across all modified files
const riskProfiles = readState('memory/risk-profiles.json', { directories: {} });
const levelOrder = ['minimal', 'standard', 'strict', 'maximum'];
let maxGuardLevel = 'standard';

for (const fp of session.modified_files) {
  const gl = getGuardLevel(fp, riskProfiles);
  if (levelOrder.indexOf(gl) > levelOrder.indexOf(maxGuardLevel)) {
    maxGuardLevel = gl;
  }
}

// intent-based guard level can raise the bar
const intentGuard = session.guard_level || 'standard';
if (levelOrder.indexOf(intentGuard) > levelOrder.indexOf(maxGuardLevel)) {
  maxGuardLevel = intentGuard;
}

const required = getRequiredVerifications(maxGuardLevel);
const reasons = [];

if (required.includes('tests') && !session.verification.tests_run) {
  reasons.push(`modified ${modCount} files (guard: ${maxGuardLevel}) but tests were not run.`);
}
if (session.verification.tests_run && session.verification.tests_passed === false) {
  reasons.push('tests are failing. fix and re-run before completing.');
}
if (required.includes('build') && !session.verification.build_run) {
  reasons.push(`guard level ${maxGuardLevel} requires build verification.`);
}
if (session.verification.build_run && session.verification.build_passed === false) {
  reasons.push('build is failing. check errors before completing.');
}
if (required.includes('xval') && !session.external_models_consulted) {
  reasons.push(`guard level ${maxGuardLevel} requires cross-validation with external models.`);
}

// --- PROOF: verify test coverage for changed functions ---
if (session.verification.tests_run && session.verification.tests_passed) {
  try {
    const { getGitDiff, getChangedFunctions, findTestsForFile, checkTestCoverage, generateProofReport } = await import('./lib/proof.mjs');
    const cwd = input.cwd || process.cwd();
    const diff = getGitDiff(cwd);

    if (diff) {
      const changedFns = getChangedFunctions(diff);
      if (changedFns.length > 0) {
        const sourceFiles = [...new Set(changedFns.map(f => f.file))];
        const allTestFiles = sourceFiles.flatMap(f => findTestsForFile(f));
        const coverage = checkTestCoverage(changedFns, allTestFiles);
        const { untestedFunctions, coverageRatio } = generateProofReport(coverage);

        updateState('session.json', (s) => {
          s.proof_report = { coverageRatio, untestedFunctions, generated_at: new Date().toISOString() };
          return s;
        });

        const threshold = parseFloat(process.env.MAESTRO_PROOF_THRESHOLD || '0.5');
        if (coverageRatio < threshold && untestedFunctions.length > 0) {
          reasons.push(
            `test coverage gap: ${untestedFunctions.length} changed functions lack test coverage:\n` +
            untestedFunctions.map(f => `    - ${f}`).join('\n') +
            `\n  coverage: ${Math.round(coverageRatio * 100)}% (threshold: ${Math.round(threshold * 100)}%)`
          );
        }
      }
    }
  } catch {}
}

if (reasons.length === 0) process.exit(0);

updateState('session.json', (s) => {
  s.stop_blocked_at_file_count = modCount;
  return s;
});

const message = `[Maestro] verification required before completing:\n- ${reasons.join('\n- ')}\n\nrun tests and build, then try again.`;
process.stderr.write(message);
process.exit(2);
