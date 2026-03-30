import { readStdin } from './lib/stdin.mjs';
import { readState } from './lib/state.mjs';

const input = await readStdin();
if (!input) process.exit(0);

const compactState = readState('compact-state.json');
if (!compactState || !compactState.summary) process.exit(0);

const output = {
  systemMessage: `[Maestro] state restored after compaction:\n${compactState.summary}\n\nuse mcp__maestro__state_read or mcp__maestro__mission_read to inspect current state.`
};
process.stdout.write(JSON.stringify(output));
