import { readStdin } from './lib/stdin.mjs';
import { readState, updateState } from './lib/state.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { assessFileRisk, getGuardLevel, getCircularEditThreshold } from './lib/risk.mjs';
import { predictNextFiles } from './lib/predict.mjs';
import { detectIntentFromTool, configureSession } from './lib/intent.mjs';

const input = await readStdin();
if (!input) process.exit(0);

const toolName = input.tool_name || '';
const toolInput = input.tool_input || {};

const session = readState('session.json');
if (!session) process.exit(0);

const counts = session.tool_counts || { read: 0, write: 0, bash: 0, other: 0 };
const warnings = [];
let additionalContext = null;

const isWrite = ['Write', 'Edit'].includes(toolName);
const isRead = toolName === 'Read';

// --- INTENT: detect on first tool use ---
if (!session.intent_detected) {
  try {
    const result = detectIntentFromTool(toolName, toolInput);
    if (result.confidence > 0) {
      const config = configureSession(result.intent);
      updateState('session.json', (s) => {
        s.intent_detected = true;
        s.intent = result.intent;
        s.intent_confidence = result.confidence;
        s.guard_level = config.guard_level_override;
        s.suggested_agents = config.suggested_agents;
        return s;
      });
      warnings.push(`[Maestro] detected intent: ${result.intent}. ${config.context_message}`);
      if (config.suggested_agents.length > 0) {
        warnings.push(`[Maestro] suggested agents: ${config.suggested_agents.join(', ')}`);
      }
    } else {
      updateState('session.json', (s) => {
        s.intent_detected = true;
        s.intent = 'general';
        return s;
      });
    }
  } catch {}
}

// --- GUARD: write without read ---
if (isWrite && counts.read === 0) {
  warnings.push('[Maestro] attempting to write without reading any files first. read related files before writing.');
}

// --- GUARD: high write:read ratio ---
if (isWrite && counts.write > 0 && counts.read > 0) {
  const ratio = counts.write / counts.read;
  if (ratio >= 3) {
    warnings.push(`[Maestro] write:read ratio is ${ratio.toFixed(1)}:1. read more files and verify before continuing.`);
  }
}

// --- GUARD: adaptive circular edit detection ---
if (isWrite && toolInput.file_path) {
  const fp = toolInput.file_path;
  const riskProfiles = readState('memory/risk-profiles.json', { directories: {} });
  const guardLevel = getGuardLevel(fp, riskProfiles);
  const threshold = getCircularEditThreshold(guardLevel);
  const edits = session.consecutive_edits || {};
  const count = (edits[fp] || 0) + 1;

  if (count >= threshold) {
    const risk = assessFileRisk(fp);
    warnings.push(`[Maestro] ${count} consecutive edits to ${fp} (risk: ${risk.level}). consider reading the file to verify.`);
  }

  updateState('session.json', (s) => {
    if (!s.consecutive_edits) s.consecutive_edits = {};
    s.consecutive_edits[fp] = count;
    return s;
  });

  // --- GUARD: high-risk file without reading tests ---
  const risk = assessFileRisk(fp);
  if (risk.score >= 3) {
    const readFiles = session.read_files || [];
    const nameNoExt = basename(fp).replace(/\.[^.]+$/, '');
    const hasReadTests = readFiles.some(f => f.includes(nameNoExt) && /test|spec/i.test(f));
    if (!hasReadTests) {
      warnings.push(`[Maestro] writing to ${risk.level}-risk file without reading related tests.`);
    }
  }
}

// --- GUARD: reset consecutive edits on read ---
if (isRead && toolInput.file_path) {
  const fp = toolInput.file_path;
  const edits = session.consecutive_edits || {};
  if (edits[fp]) {
    updateState('session.json', (s) => {
      if (s.consecutive_edits) delete s.consecutive_edits[fp];
      return s;
    });
  }
}

// --- AMPLIFY: directory context injection ---
if (isRead && toolInput.file_path) {
  const dir = dirname(toolInput.file_path);
  const injectedDirs = session.injected_dirs || [];

  if (!injectedDirs.includes(dir)) {
    const contextFiles = ['README.md', 'ARCHITECTURE.md', 'readme.md'];
    for (const name of contextFiles) {
      const contextPath = join(dir, name);
      if (existsSync(contextPath)) {
        try {
          const content = readFileSync(contextPath, 'utf8');
          const trimmed = content.length > 2000 ? content.slice(0, 2000) + '\n...(truncated)' : content;
          additionalContext = `[Maestro] directory context from ${name}:\n${trimmed}`;
        } catch {}
        break;
      }
    }

    updateState('session.json', (s) => {
      if (!s.injected_dirs) s.injected_dirs = [];
      s.injected_dirs.push(dir);
      return s;
    });
  }
}

// --- AMPLIFY: predictive context ---
if ((isRead || isWrite) && toolInput.file_path) {
  try {
    const predictions = predictNextFiles(
      toolInput.file_path,
      session.read_files || [],
      session.modified_files || [],
    );
    if (predictions.length > 0) {
      const label = isRead ? 'related files you may need' : 'files that usually change with this one';
      const lines = predictions.map(p => `  - ${p.path} (${p.reason})`);
      const ctx = `[Maestro] ${label}:\n${lines.join('\n')}`;
      additionalContext = additionalContext ? additionalContext + '\n\n' + ctx : ctx;
    }
  } catch {}
}

// --- GUARD: dangerous bash patterns ---
if (toolName === 'Bash') {
  const cmd = toolInput.command || '';

  if (/git\s+add\s+(-A|\.)\s*$/i.test(cmd)) {
    warnings.push('[Maestro] git add -A is dangerous. run git status first to review changes.');
  }
  if (/git\s+push\s+.*--force/i.test(cmd) || /git\s+push\s+-f\b/i.test(cmd)) {
    warnings.push('[Maestro] force push detected. this may overwrite remote branch history.');
  }
  if (/git\s+reset\s+--hard/i.test(cmd)) {
    warnings.push('[Maestro] git reset --hard detected. all uncommitted changes will be lost.');
  }
  if (/git\s+checkout\s+\.\s*$/i.test(cmd) || /git\s+restore\s+\.\s*$/i.test(cmd)) {
    warnings.push('[Maestro] discard-all detected. in-progress changes may be lost.');
  }
  if (/rm\s+-rf?\s+/i.test(cmd) && !/node_modules|dist|build|\.maestro|\.next|target/i.test(cmd)) {
    warnings.push('[Maestro] rm -rf detected. verify the target is correct.');
  }
  if (/\benv\b|\bprintenv\b|echo\s+\$\w*(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/i.test(cmd)) {
    warnings.push('[Maestro] possible secret/env exposure. output will be included in context.');
  }
  if (/--no-verify/i.test(cmd)) {
    warnings.push('[Maestro] --no-verify detected. skipping git hooks bypasses validation.');
  }
}

// build output
const output = {};
const contextParts = [];

if (warnings.length > 0) contextParts.push(warnings.join('\n'));
if (additionalContext) contextParts.push(additionalContext);

if (contextParts.length > 0) {
  output.hookSpecificOutput = {
    hookEventName: 'PreToolUse',
    additionalContext: contextParts.join('\n\n')
  };
  process.stdout.write(JSON.stringify(output));
}
