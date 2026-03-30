#!/usr/bin/env node
/**
 * Maestro HUD — Statusline for Claude Code
 *
 * stdin:  JSON from Claude Code (model, context_window, rate_limits, cost, workspace, ...)
 * stdout: ANSI-colored single line
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// --- ANSI colors ---
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';

function color(text, c) { return `${c}${text}${RESET}`; }

function pctColor(pct) {
  if (pct >= 85) return RED;
  if (pct >= 70) return YELLOW;
  return GREEN;
}

function modelColor(id) {
  if (!id) return CYAN;
  if (/opus/i.test(id)) return MAGENTA;
  if (/sonnet/i.test(id)) return YELLOW;
  if (/haiku/i.test(id)) return GREEN;
  return CYAN;
}

// --- helpers ---
function readJson(filepath) {
  try {
    if (!existsSync(filepath)) return null;
    return JSON.parse(readFileSync(filepath, 'utf8'));
  } catch { return null; }
}

function readStdinSync() {
  try { return JSON.parse(readFileSync('/dev/stdin', 'utf8')); }
  catch { return {}; }
}

function fmtDuration(ms) {
  if (!ms || ms < 0) return '0m';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}

function fmtCost(usd) {
  if (!usd || usd <= 0) return null;
  if (usd < 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function fmtResetTime(epochSec) {
  if (!epochSec) return '';
  const ms = epochSec * 1000 - Date.now();
  if (ms <= 0) return '';
  return fmtDuration(ms);
}

function fmtPct(label, pct, resetAt) {
  if (pct == null) return null;
  const p = Math.round(pct);
  const reset = fmtResetTime(resetAt);
  const text = reset ? `${label}:${p}%(${reset})` : `${label}:${p}%`;
  return color(text, pctColor(p));
}

// --- main ---
function main() {
  const stdin = readStdinSync();
  const cwd = stdin?.workspace?.current_dir || stdin?.cwd || process.cwd();
  const dataDir = join(cwd, '.maestro');

  const session = readJson(join(dataDir, 'session.json'));
  const mission = readJson(join(dataDir, 'mission.json'));
  const subagents = readJson(join(dataDir, 'subagents.json'));

  const parts = [];

  // --- label ---
  parts.push(color('[Maestro]', CYAN + BOLD));

  // --- model ---
  const modelName = stdin?.model?.display_name;
  const modelId = stdin?.model?.id;
  if (modelName) {
    parts.push(color(modelName, modelColor(modelId)));
  }

  // --- rate limits ---
  const rl = stdin?.rate_limits;
  if (rl) {
    const rateParts = [];
    if (rl.five_hour) rateParts.push(fmtPct('5h', rl.five_hour.used_percentage, rl.five_hour.resets_at));
    if (rl.seven_day) rateParts.push(fmtPct('7d', rl.seven_day.used_percentage, rl.seven_day.resets_at));
    const valid = rateParts.filter(Boolean);
    if (valid.length) parts.push(valid.join(' '));
  }

  // --- session duration + cost ---
  const duration = stdin?.cost?.total_duration_ms;
  const costUsd = stdin?.cost?.total_cost_usd;
  const timeParts = [];
  if (duration) timeParts.push(color(fmtDuration(duration), DIM));
  const costStr = fmtCost(costUsd);
  if (costStr) timeParts.push(color(costStr, DIM));
  if (timeParts.length) parts.push(timeParts.join(' '));

  // --- files + R:W ratio (maestro-specific) ---
  if (session) {
    const mod = session.modified_files?.length || 0;
    const tc = session.tool_counts || {};
    const r = tc.read || 0;
    const w = tc.write || 0;
    if (mod > 0 || w > 0) {
      const ratio = w > 0 ? `${Math.round(r / w)}:1` : '-';
      parts.push(`${mod}f R:W=${ratio}`);
    }
  }

  // --- verification: T(est) B(uild) ---
  if (session?.verification) {
    const v = session.verification;
    const t = v.tests_run
      ? (v.tests_passed === false ? color('T✗', RED) : color('T✓', GREEN))
      : color('T-', DIM);
    const b = v.build_run
      ? (v.build_passed === false ? color('B✗', RED) : color('B✓', GREEN))
      : color('B-', DIM);
    parts.push(`${t} ${b}`);
  }

  // --- guard level ---
  if (session?.guard_level && session.guard_level !== 'standard') {
    const guardColor = { minimal: DIM, strict: YELLOW, maximum: RED }[session.guard_level] || DIM;
    parts.push(color(`G:${session.guard_level}`, guardColor));
  }

  // --- intent ---
  if (session?.intent && session.intent !== 'general') {
    parts.push(color(session.intent, CYAN));
  }

  // --- mission progress ---
  if (mission?.acceptance_criteria?.length > 0) {
    const total = mission.acceptance_criteria.length;
    const done = mission.acceptance_criteria.filter(c => c.verified).length;
    const mc = done === total ? GREEN : (done > 0 ? YELLOW : DIM);
    parts.push(color(`mission:${done}/${total}`, mc));
  }

  // --- active subagents ---
  if (subagents?.agents) {
    const running = subagents.agents.filter(a => a.status === 'running').length;
    if (running > 0) parts.push(color(`🤖${running}`, BLUE));
  }

  // --- lines changed ---
  const added = stdin?.cost?.total_lines_added;
  const removed = stdin?.cost?.total_lines_removed;
  if (added || removed) {
    const lineParts = [];
    if (added) lineParts.push(color(`+${added}`, GREEN));
    if (removed) lineParts.push(color(`-${removed}`, RED));
    parts.push(lineParts.join('/'));
  }

  // --- context window ---
  const ctxPct = stdin?.context_window?.used_percentage;
  if (ctxPct != null) {
    const p = Math.round(ctxPct);
    parts.push(color(`ctx:${p}%`, pctColor(p)));
  }

  console.log(parts.join(' | '));
}

main();
