import { readStdin } from './lib/stdin.mjs';
import { updateState } from './lib/state.mjs';

const input = await readStdin();
if (!input) process.exit(0);

const eventName = input.hook_event_name || '';
const agentId = input.agent_id || 'unknown';
const agentType = input.agent_type || 'unknown';

updateState('subagents.json', (state) => {
  if (!state || !state.agents) {
    state = { agents: [] };
  }

  if (eventName === 'SubagentStart') {
    state.agents.push({
      id: agentId,
      type: agentType,
      started_at: new Date().toISOString(),
      status: 'running'
    });
  } else if (eventName === 'SubagentStop') {
    const agent = state.agents.find(a => a.id === agentId);
    if (agent) {
      agent.status = 'completed';
      agent.completed_at = new Date().toISOString();
    }
  }

  return state;
}, { agents: [] });
