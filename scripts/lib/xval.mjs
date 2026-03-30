import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TIMEOUT = parseInt(process.env.MAESTRO_XVAL_TIMEOUT || '120000', 10);

/**
 * run Codex CLI with a prompt
 * @returns {{ success: boolean, output: string, duration_ms: number }}
 */
export async function runCodex(prompt) {
  const start = Date.now();
  try {
    const { stdout } = await execFileAsync('codex', ['-q', '--approval-mode', 'full-auto', prompt], {
      timeout: TIMEOUT,
      encoding: 'utf8',
      env: { ...process.env }
    });
    return { success: true, output: stdout.trim(), duration_ms: Date.now() - start };
  } catch (err) {
    return { success: false, output: err.message, duration_ms: Date.now() - start };
  }
}

/**
 * run Gemini CLI with a prompt
 * @returns {{ success: boolean, output: string, duration_ms: number }}
 */
export async function runGemini(prompt) {
  const start = Date.now();
  try {
    const { stdout } = await execFileAsync('gemini', ['-p', prompt], {
      timeout: TIMEOUT,
      encoding: 'utf8',
      env: { ...process.env }
    });
    return { success: true, output: stdout.trim(), duration_ms: Date.now() - start };
  } catch (err) {
    return { success: false, output: err.message, duration_ms: Date.now() - start };
  }
}

/**
 * run both in parallel, return combined results
 * gracefully handles one provider being unavailable
 */
export async function runCrossValidation(prompt) {
  const [codex, gemini] = await Promise.allSettled([
    runCodex(prompt),
    runGemini(prompt)
  ]);

  return {
    codex: codex.status === 'fulfilled' ? codex.value : { success: false, output: 'unavailable', duration_ms: 0 },
    gemini: gemini.status === 'fulfilled' ? gemini.value : { success: false, output: 'unavailable', duration_ms: 0 },
    timestamp: new Date().toISOString()
  };
}

/** check if codex/gemini CLIs are available */
export async function checkAvailability() {
  const check = async (cmd) => {
    try {
      await execFileAsync('which', [cmd], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  };
  return {
    codex: await check('codex'),
    gemini: await check('gemini')
  };
}
