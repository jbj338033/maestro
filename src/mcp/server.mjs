import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
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
          description: 'Memory type to read. Omit to read all.'
        }
      }
    }
  },
  {
    name: 'memory_write',
    description: 'Add an entry to cross-session memory',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['conventions', 'decisions', 'patterns'],
          description: 'Memory type to write to'
        },
        entry: {
          type: 'object',
          description: 'Memory entry object (arbitrary key-value pairs)'
        }
      },
      required: ['type', 'entry']
    }
  },
  {
    name: 'history_list',
    description: 'List recent session history entries',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max entries to return (default: 10)' }
      }
    }
  },
  {
    name: 'mission_create',
    description: 'Create a new mission with objective and acceptance criteria',
    inputSchema: {
      type: 'object',
      properties: {
        objective: { type: 'string', description: 'Mission objective' },
        criteria: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of acceptance criteria descriptions'
        },
        complexity: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Task complexity level (default: medium)'
        }
      },
      required: ['objective', 'criteria']
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
        writeJson('session.json', state);
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
        writeJson('mission.json', mission);
        const met = mission.acceptance_criteria.filter(c => c.verified).length;
        const total = mission.acceptance_criteria.length;
        return { content: [{ type: 'text', text: `Criterion ${args.criteria_id} → ${args.verified ? 'VERIFIED' : 'UNVERIFIED'}. Progress: ${met}/${total}` }] };
      }

      case 'mission_create': {
        const existing = readJson('mission.json');
        if (existing?.objective) {
          return { content: [{ type: 'text', text: `Mission already exists: "${existing.objective}". Clear it first via state_write.` }], isError: true };
        }
        const mission = {
          version: 1,
          objective: args.objective,
          acceptance_criteria: (args.criteria || []).map((desc, i) => ({
            id: i, description: desc, verified: false
          })),
          constraints: [],
          created_at: new Date().toISOString(),
          complexity: args.complexity || 'medium'
        };
        writeJson('mission.json', mission);
        return { content: [{ type: 'text', text: `Mission created: "${args.objective}" with ${mission.acceptance_criteria.length} criteria.` }] };
      }

      case 'memory_read': {
        if (args?.type) {
          const memory = readJson(`memory/${args.type}.json`, { entries: [] });
          if (memory.entries.length === 0) {
            return { content: [{ type: 'text', text: `No ${args.type} memories yet.` }] };
          }
          return { content: [{ type: 'text', text: JSON.stringify(memory.entries.slice(-20), null, 2) }] };
        }
        const all = {};
        for (const t of ['conventions', 'decisions', 'patterns']) {
          all[t] = readJson(`memory/${t}.json`, { entries: [] }).entries.slice(-20);
        }
        return { content: [{ type: 'text', text: JSON.stringify(all, null, 2) }] };
      }

      case 'history_list': {
        const dir = join(getDataDir(), 'history');
        if (!existsSync(dir)) {
          return { content: [{ type: 'text', text: 'No session history yet.' }] };
        }
        const files = readdirSync(dir)
          .filter(f => f.endsWith('.json'))
          .sort()
          .reverse()
          .slice(0, args?.limit || 10);
        const entries = files.map(f => {
          try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); }
          catch { return null; }
        }).filter(Boolean);
        if (entries.length === 0) {
          return { content: [{ type: 'text', text: 'No session history yet.' }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify(entries, null, 2) }] };
      }

      case 'memory_write': {
        const memory = readJson(`memory/${args.type}.json`, { entries: [] });
        memory.entries.push({ ...args.entry, added_at: new Date().toISOString() });
        if (memory.entries.length > 100) {
          memory.entries = memory.entries.slice(-100);
        }
        writeJson(`memory/${args.type}.json`, memory);
        return { content: [{ type: 'text', text: `Added entry to ${args.type} memory. Total: ${memory.entries.length}` }] };
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
