import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

function getDataDir() {
  const dir = process.env.CLAUDE_PLUGIN_DATA
    || join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.maestro');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function readJson(filename, defaultValue = null) {
  try {
    const filepath = join(getDataDir(), filename);
    if (!existsSync(filepath)) return defaultValue;
    return JSON.parse(readFileSync(filepath, 'utf8'));
  } catch { return defaultValue; }
}

function writeJson(filename, data) {
  const dir = getDataDir();
  const filepath = join(dir, filename);
  const parentDir = dirname(filepath);
  if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true });
  const tmp = filepath + '.' + randomBytes(4).toString('hex') + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  renameSync(tmp, filepath);
}

const server = new Server(
  { name: 'maestro', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: 'state_read',
    description: 'Read current Maestro session state (goals, progress, verification status)',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Specific key to read. Omit for full state.' }
      }
    }
  },
  {
    name: 'state_write',
    description: 'Update Maestro session state',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key to update' },
        value: { description: 'Value to set' }
      },
      required: ['key', 'value']
    }
  },
  {
    name: 'mission_read',
    description: 'Read current mission objective and acceptance criteria',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'mission_update',
    description: 'Mark an acceptance criterion as verified or unverified',
    inputSchema: {
      type: 'object',
      properties: {
        criteria_id: { type: 'number', description: 'Criterion ID to update' },
        verified: { type: 'boolean', description: 'Whether criterion is verified' }
      },
      required: ['criteria_id', 'verified']
    }
  },
  {
    name: 'memory_read',
    description: 'Read cross-session memory (conventions, decisions, patterns learned from past sessions)',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['conventions', 'decisions', 'patterns'],
          description: 'Memory type to read'
        }
      },
      required: ['type']
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'state_read': {
        const state = readJson('session.json', {});
        if (args?.key) {
          return { content: [{ type: 'text', text: JSON.stringify(state[args.key] ?? null, null, 2) }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify(state, null, 2) }] };
      }

      case 'state_write': {
        const state = readJson('session.json', {});
        state[args.key] = args.value;
        const dir = getDataDir();
        const filepath = join(dir, 'session.json');
        writeFileSync(filepath, JSON.stringify(state, null, 2), 'utf8');
        return { content: [{ type: 'text', text: `Updated state.${args.key}` }] };
      }

      case 'mission_read': {
        const mission = readJson('mission.json');
        if (!mission) {
          return { content: [{ type: 'text', text: 'No active mission.' }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify(mission, null, 2) }] };
      }

      case 'mission_update': {
        const mission = readJson('mission.json');
        if (!mission) {
          return { content: [{ type: 'text', text: 'No active mission.' }], isError: true };
        }
        const criteria = mission.acceptance_criteria.find(c => c.id === args.criteria_id);
        if (!criteria) {
          return { content: [{ type: 'text', text: `Criterion ${args.criteria_id} not found.` }], isError: true };
        }
        criteria.verified = args.verified;
        const dir = getDataDir();
        writeFileSync(join(dir, 'mission.json'), JSON.stringify(mission, null, 2), 'utf8');
        const met = mission.acceptance_criteria.filter(c => c.verified).length;
        const total = mission.acceptance_criteria.length;
        return { content: [{ type: 'text', text: `Criterion ${args.criteria_id} → ${args.verified ? 'VERIFIED' : 'UNVERIFIED'}. Progress: ${met}/${total}` }] };
      }

      case 'memory_read': {
        const memory = readJson(`memory/${args.type}.json`, { entries: [] });
        if (memory.entries.length === 0) {
          return { content: [{ type: 'text', text: `No ${args.type} memories yet.` }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify(memory.entries.slice(-20), null, 2) }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
