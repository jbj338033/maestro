import { getGuardLevel } from './risk.mjs';

const INTENTS = {
  bugfix: {
    keywords: /\b(fix|bug|error|broken|crash|issue|debug|revert|regression|hotfix|wrong|fail)\b/i,
    tools: { Read: 0.3, Bash: 0.2, Grep: 0.2 },
    config: {
      guard_level_override: 'strict',
      suggested_agents: ['researcher'],
      verification_requirements: ['tests'],
      context_message: 'bugfix mode: read first, fix focused, verify with tests'
    }
  },
  feature: {
    keywords: /\b(add|create|new|implement|feature|build|introduce|scaffold|setup)\b/i,
    tools: { Write: 0.3, Edit: 0.2 },
    config: {
      guard_level_override: 'standard',
      suggested_agents: ['researcher', 'critic'],
      verification_requirements: ['tests', 'build'],
      context_message: 'feature mode: create mission, implement, verify'
    }
  },
  refactor: {
    keywords: /\b(refactor|clean|reorganize|restructure|simplify|extract|rename|move|dedup)\b/i,
    tools: { Read: 0.2, Edit: 0.3 },
    config: {
      guard_level_override: 'maximum',
      suggested_agents: ['critic', 'verifier'],
      verification_requirements: ['tests', 'build', 'xval'],
      context_message: 'refactor mode: maximum guards, cross-validate'
    }
  },
  migration: {
    keywords: /\b(update|upgrade|migrate|bump|version|deprecated|breaking|compat)\b/i,
    tools: { Bash: 0.3 },
    config: {
      guard_level_override: 'strict',
      suggested_agents: ['researcher'],
      verification_requirements: ['tests', 'build'],
      context_message: 'migration mode: read docs first, verify compatibility'
    }
  },
  testing: {
    keywords: /\b(test|coverage|spec|assert|mock|stub|fixture|tdd)\b/i,
    tools: { Write: 0.2, Bash: 0.3 },
    config: {
      guard_level_override: 'minimal',
      suggested_agents: [],
      verification_requirements: ['tests'],
      context_message: 'testing mode: focus on coverage and edge cases'
    }
  },
  review: {
    keywords: /\b(review|audit|check|inspect|analyze|assess|evaluate|examine)\b/i,
    tools: { Read: 0.5 },
    config: {
      guard_level_override: 'minimal',
      suggested_agents: ['critic'],
      verification_requirements: [],
      context_message: 'review mode: read and analyze, suggest improvements'
    }
  }
};

export function detectIntent(text) {
  if (!text) return { intent: 'general', confidence: 0, scores: {} };

  const scores = {};
  for (const [name, def] of Object.entries(INTENTS)) {
    const matches = text.match(def.keywords);
    scores[name] = matches ? Math.min(matches.length * 0.3, 1.0) : 0;
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (best[0][1] < 0.3) return { intent: 'general', confidence: 0, scores };

  const [second] = best[1] || [null, 0];
  if (second && best[0][1] - best[1][1] < 0.1) {
    return { intent: 'general', confidence: 0, scores };
  }

  return { intent: best[0][0], confidence: best[0][1], scores };
}

export function detectIntentFromTool(toolName, toolInput) {
  const scores = {};
  for (const [name, def] of Object.entries(INTENTS)) {
    let score = def.tools[toolName] || 0;

    const inputStr = typeof toolInput === 'string'
      ? toolInput
      : JSON.stringify(toolInput || '');
    const matches = inputStr.match(def.keywords);
    if (matches) score += Math.min(matches.length * 0.2, 0.6);

    if (toolName === 'Read' && toolInput?.file_path) {
      const fp = toolInput.file_path;
      if (/error|log|crash|bug/i.test(fp) && name === 'bugfix') score += 0.3;
      if (/test|spec/i.test(fp) && name === 'testing') score += 0.3;
      if (/readme|doc|guide/i.test(fp) && name === 'review') score += 0.2;
    }

    if (toolName === 'Write' && toolInput?.file_path) {
      if (name === 'feature') score += 0.2;
    }

    scores[name] = Math.min(score, 1.0);
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (best[0][1] < 0.3) return { intent: 'general', confidence: 0, scores };

  return { intent: best[0][0], confidence: best[0][1], scores };
}

export function configureSession(intent) {
  const def = INTENTS[intent];
  if (!def) {
    return {
      guard_level_override: 'standard',
      suggested_agents: [],
      verification_requirements: ['tests'],
      context_message: null
    };
  }
  return { ...def.config };
}
