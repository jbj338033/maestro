const RISK = { MINIMAL: 0, LOW: 1, STANDARD: 2, HIGH: 3, CRITICAL: 4 };

const CRITICAL_PATTERNS = [
  /\.env($|\.\w+$)/,
  /secret/i,
  /credential/i,
  /\/keys\//,
  /private[_-]?key/i,
];

const HIGH_PATTERNS = [
  /\/auth\//,
  /\/payment\//,
  /\/security\//,
  /\/admin\//,
  /\/migrations\//,
  /middleware\.\w+$/,
  /Dockerfile/,
  /\.github\//,
  /\.gitlab-ci/,
];

const LOW_PATTERNS = [
  /\/tests?\//,
  /\/__tests__\//,
  /\.test\.\w+$/,
  /\.spec\.\w+$/,
  /\/docs\//,
  /\/examples\//,
];

const MINIMAL_PATTERNS = [
  /\.md$/,
  /\.txt$/,
  /^CHANGELOG/i,
  /^LICENSE/i,
  /^README/i,
];

const SOURCE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|swift|c|cpp|h|rb)$/;

export function assessFileRisk(filePath) {
  const reasons = [];
  let score = -1;

  for (const p of CRITICAL_PATTERNS) {
    if (p.test(filePath)) {
      reasons.push(`matches ${p}`);
      score = RISK.CRITICAL;
    }
  }
  if (score >= 0) return { level: 'CRITICAL', score, reasons };

  for (const p of HIGH_PATTERNS) {
    if (p.test(filePath)) {
      reasons.push(`matches ${p}`);
      score = RISK.HIGH;
    }
  }
  if (score >= 0) return { level: 'HIGH', score, reasons };

  for (const p of LOW_PATTERNS) {
    if (p.test(filePath)) {
      reasons.push(`matches ${p}`);
      score = RISK.LOW;
    }
  }
  if (score >= 0) return { level: 'LOW', score, reasons };

  const base = filePath.split('/').pop() || '';

  for (const p of MINIMAL_PATTERNS) {
    if (p.test(base) || p.test(filePath)) {
      reasons.push(`matches ${p}`);
      return { level: 'MINIMAL', score: RISK.MINIMAL, reasons };
    }
  }

  if (SOURCE_EXTENSIONS.test(filePath)) {
    return { level: 'STANDARD', score: RISK.STANDARD, reasons: ['source code file'] };
  }

  return { level: 'STANDARD', score: RISK.STANDARD, reasons: ['default'] };
}

const SCORE_TO_GUARD = ['minimal', 'minimal', 'standard', 'strict', 'maximum'];

export function getGuardLevel(filePath, riskProfiles = null) {
  const { score } = assessFileRisk(filePath);
  let level = score;

  if (riskProfiles?.directories) {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    for (const [dirPath, profile] of Object.entries(riskProfiles.directories)) {
      if (dir.includes(dirPath) && (profile.forgot_tests_count > 2 || profile.circular_edit_count > 2)) {
        level = Math.min(level + 1, RISK.CRITICAL);
        break;
      }
    }
  }

  return SCORE_TO_GUARD[level];
}

export function getCircularEditThreshold(guardLevel) {
  const thresholds = { minimal: 6, standard: 3, strict: 2, maximum: 1 };
  return thresholds[guardLevel] ?? 3;
}

export function getRequiredVerifications(guardLevel) {
  const verifications = {
    minimal: [],
    standard: ['tests'],
    strict: ['tests', 'build'],
    maximum: ['tests', 'build', 'xval'],
  };
  return verifications[guardLevel] ?? ['tests'];
}
