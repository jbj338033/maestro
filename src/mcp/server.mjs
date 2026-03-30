import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';

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
  { name: 'maestro', version: '2.0.0' },
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
    name: 'memory_search',
    description: 'Search cross-session memory by keyword. Returns matching entries across all or a specific memory type.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword to search for (case-insensitive substring match)' },
        type: {
          type: 'string',
          enum: ['conventions', 'decisions', 'patterns'],
          description: 'Memory type to search. Omit to search all.'
        }
      },
      required: ['query']
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
  },
  // v2: checkpoint tools
  {
    name: 'checkpoint_create',
    description: 'Create a checkpoint of current git + session state. Use before risky operations.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Checkpoint name (e.g. "before-refactor")' },
        description: { type: 'string', description: 'Optional description' }
      },
      required: ['name']
    }
  },
  {
    name: 'checkpoint_list',
    description: 'List all available checkpoints',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'checkpoint_restore',
    description: 'Restore to a previous checkpoint (rolls back git + session state)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Checkpoint ID to restore' }
      },
      required: ['id']
    }
  },
  // v2: heal tool
  {
    name: 'heal_suggest',
    description: 'Analyze error output and suggest fixes based on past experience',
    inputSchema: {
      type: 'object',
      properties: {
        error_output: { type: 'string', description: 'Error output to analyze' }
      },
      required: ['error_output']
    }
  },
  // v2: proof tool
  {
    name: 'proof_report',
    description: 'Generate test coverage proof report for current changes',
    inputSchema: { type: 'object', properties: {} }
  },
  // v2: global memory tools
  {
    name: 'global_memory_read',
    description: 'Read cross-project global memory (conventions learned across multiple projects)',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['conventions', 'tech-profiles', 'anti-patterns'] }
      }
    }
  },
  {
    name: 'global_memory_write',
    description: 'Add an entry to global cross-project memory',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['conventions', 'anti-patterns'] },
        entry: { type: 'object', description: 'Memory entry' },
        technologies: { type: 'array', items: { type: 'string' } }
      },
      required: ['type', 'entry']
    }
  },
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

      case 'memory_search': {
        const q = (args.query || '').toLowerCase();
        if (!q) {
          return { content: [{ type: 'text', text: 'query is required' }], isError: true };
        }
        const types = args?.type ? [args.type] : ['conventions', 'decisions', 'patterns'];
        const results = {};
        for (const t of types) {
          const memory = readJson(`memory/${t}.json`, { entries: [] });
          const matches = memory.entries.filter(e => {
            const str = JSON.stringify(e).toLowerCase();
            return str.includes(q);
          });
          if (matches.length > 0) results[t] = matches;
        }
        if (Object.keys(results).length === 0) {
          return { content: [{ type: 'text', text: `No results for "${args.query}".` }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
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

      case 'checkpoint_create': {
        const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
        let git_ref = null, git_type = null;
        try {
          const stash = execFileSync('git', ['stash', 'create'], { cwd, timeout: 5000, encoding: 'utf8' }).trim();
          if (stash) { git_ref = stash; git_type = 'stash'; }
          else { git_ref = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, timeout: 5000, encoding: 'utf8' }).trim(); git_type = 'commit'; }
        } catch {}
        const cpId = `cp_${Date.now()}_${randomBytes(3).toString('hex')}`;
        writeJson(`checkpoints/${cpId}.json`, {
          id: cpId, name: args.name, description: args.description || '', created_at: new Date().toISOString(),
          git_ref, git_type, session_snapshot: readJson('session.json'), mission_snapshot: readJson('mission.json'),
        });
        return { content: [{ type: 'text', text: `Checkpoint "${args.name}" created (${cpId})${git_ref ? ` at ${git_ref.slice(0, 8)}` : ''}` }] };
      }

      case 'checkpoint_list': {
        const cpDir = join(getDataDir(), 'checkpoints');
        if (!existsSync(cpDir)) return { content: [{ type: 'text', text: 'No checkpoints.' }] };
        const cps = readdirSync(cpDir).filter(f => f.endsWith('.json')).map(f => {
          try { return JSON.parse(readFileSync(join(cpDir, f), 'utf8')); } catch { return null; }
        }).filter(Boolean).sort((a, b) => b.created_at.localeCompare(a.created_at));
        const text = cps.map(c => `${c.id} | ${c.name} | ${c.created_at}`).join('\n');
        return { content: [{ type: 'text', text: text || 'No checkpoints.' }] };
      }

      case 'checkpoint_restore': {
        const cp = readJson(`checkpoints/${args.id}.json`);
        if (!cp) return { content: [{ type: 'text', text: 'Checkpoint not found.' }], isError: true };
        const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
        try {
          if (cp.git_type === 'stash') execFileSync('git', ['stash', 'apply', cp.git_ref], { cwd, timeout: 10000 });
          else if (cp.git_type === 'commit') execFileSync('git', ['checkout', cp.git_ref, '--', '.'], { cwd, timeout: 10000 });
        } catch (e) {
          return { content: [{ type: 'text', text: `Git restore failed: ${e.message}` }], isError: true };
        }
        if (cp.session_snapshot) {
          const cur = readJson('session.json', {});
          writeJson('session.json', { ...cp.session_snapshot, session_id: cur.session_id, started_at: cur.started_at });
        }
        if (cp.mission_snapshot) writeJson('mission.json', cp.mission_snapshot);
        return { content: [{ type: 'text', text: `Restored to checkpoint "${cp.name}"` }] };
      }

      case 'heal_suggest': {
        const healRe = [
          { re: /(.+\.tsx?)\((\d+),\d+\): error (TS\d+): (.+)/g, fmt: m => `TS ${m[3]} in ${m[1]}:${m[2]}: ${m[4]}` },
          { re: /^error:?\s*(.+)/gim, fmt: m => m[1] },
        ];
        const errs = [];
        for (const p of healRe) {
          p.re.lastIndex = 0;
          let m; while ((m = p.re.exec(args.error_output)) !== null && errs.length < 5) errs.push(p.fmt(m));
        }
        const errDb = readJson('memory/errors.json', { entries: [] });
        const fixes = errDb.entries.slice(-5).map(e => `  - ${e.error_type}: fixed in ${e.fix_files?.join(', ')}`);
        let healText = errs.length ? `Errors found:\n${errs.map(e => `  - ${e}`).join('\n')}` : 'No structured errors detected.';
        if (fixes.length) healText += `\n\nKnown fixes:\n${fixes.join('\n')}`;
        return { content: [{ type: 'text', text: healText }] };
      }

      case 'proof_report': {
        const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
        let diff = '';
        try { diff = execFileSync('git', ['diff', 'HEAD'], { cwd, timeout: 5000, encoding: 'utf8' }); } catch {}
        if (!diff) return { content: [{ type: 'text', text: 'No changes detected (no git diff).' }] };
        return { content: [{ type: 'text', text: `Git diff available (${diff.length} bytes). Use stop gate for full proof analysis.` }] };
      }

      case 'global_memory_read': {
        const gDir = join(homedir(), '.maestro', 'global');
        if (!existsSync(gDir)) return { content: [{ type: 'text', text: 'No global memory yet.' }] };
        const gType = args?.type || 'conventions';
        const gPath = join(gDir, `${gType}.json`);
        if (!existsSync(gPath)) return { content: [{ type: 'text', text: `No ${gType} in global memory.` }] };
        try {
          const gData = JSON.parse(readFileSync(gPath, 'utf8'));
          return { content: [{ type: 'text', text: JSON.stringify(gData.entries?.slice(-20) || gData, null, 2) }] };
        } catch { return { content: [{ type: 'text', text: 'Error reading global memory.' }], isError: true }; }
      }

      case 'global_memory_write': {
        const gDir = join(homedir(), '.maestro', 'global');
        if (!existsSync(gDir)) mkdirSync(gDir, { recursive: true });
        const gPath = join(gDir, `${args.type}.json`);
        let gData = { entries: [] };
        try { if (existsSync(gPath)) gData = JSON.parse(readFileSync(gPath, 'utf8')); } catch {}
        gData.entries.push({ ...args.entry, technologies: args.technologies, added_at: new Date().toISOString() });
        if (gData.entries.length > 200) gData.entries = gData.entries.slice(-200);
        const gTmp = gPath + '.' + randomBytes(4).toString('hex') + '.tmp';
        writeFileSync(gTmp, JSON.stringify(gData, null, 2), 'utf8');
        renameSync(gTmp, gPath);
        return { content: [{ type: 'text', text: `Added to global ${args.type}. Total: ${gData.entries.length}` }] };
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
