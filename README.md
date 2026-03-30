<h1 align="center">
  <code>maestro</code>
</h1>

<p align="center">
  <strong>Thoroughness-first plugin for Claude Code</strong><br/>
  Hooks, agents, and MCP tools that enforce verification before completion.
</p>

<p align="center">
  <a href="#install">Install</a> · <a href="#how-it-works">How it works</a> · <a href="#agents">Agents</a> · <a href="#skills">Skills</a> · <a href="#mcp-tools">MCP Tools</a>
</p>

---

## Why

Claude Code is powerful but permissive — it will happily declare "done" without running tests, skip reading files before editing, or ignore the build entirely. Maestro adds structural enforcement so that shortcuts can't slip through.

- **Stop gate** blocks completion when tests or builds haven't been run
- **Read:Write ratio** warns when you're writing more than reading
- **Mission system** auto-generates acceptance criteria for complex tasks
- **Context persistence** survives compaction so you never lose progress
- **Cross-model validation** bridges to Codex and Gemini for second opinions

## Install

```sh
claude plugin add jbj338033/maestro
```

Requires Node.js >= 22 and Claude Code with plugin support.

## How it works

Maestro hooks into every stage of the Claude Code lifecycle:

| Hook | What it does |
|------|-------------|
| **SessionStart** | Initializes session state, restores previous context, loads cross-session memory |
| **UserPromptSubmit** | Detects complex tasks and auto-generates missions with acceptance criteria |
| **PreToolUse** | Warns on dangerous patterns (`git add -A`, `rm -rf`) and tracks Read:Write ratio |
| **PostToolUse** | Counts tool usage, tracks modified files, detects test/build runs |
| **Stop** | Blocks completion if tests weren't run after file changes |
| **Stop (agent)** | Verifies mission acceptance criteria against actual code |
| **PreCompact** | Saves goals, progress, and mission state before context compression |
| **PostCompact** | Restores saved state after compression |
| **SubagentStart/Stop** | Tracks active subagents |
| **SessionEnd** | Saves session history and learns file modification patterns |

## Agents

Six specialized agents with enforced boundaries:

| Agent | Model | Writes? | Purpose |
|-------|-------|---------|---------|
| **researcher** | Sonnet | No | Read-only codebase exploration before implementation |
| **verifier** | Sonnet | No | Evidence-based verification — every claim needs `command → output` proof |
| **critic** | Opus | No | Deep review from security, maintainability, and performance perspectives |
| **codex-bridge** | Sonnet | Yes | Delegates tasks to OpenAI Codex CLI |
| **gemini-bridge** | Sonnet | Yes | Delegates tasks to Google Gemini CLI |
| **synthesizer** | Opus | No | Reconciles outputs from multiple models into unified recommendations |

## Skills

| Skill | Usage | Description |
|-------|-------|-------------|
| **ask** | `/maestro:ask <codex\|gemini> "question"` | Query an external model |
| **status** | `/maestro:status` | Show session state, mission progress, verification status |

## MCP Tools

The Maestro MCP server exposes persistent state across the session:

| Tool | Description |
|------|-------------|
| `state_read` | Read session state (goals, progress, tool counts, verification status) |
| `state_write` | Update session state |
| `mission_read` | Read current mission objective and acceptance criteria |
| `mission_update` | Mark acceptance criteria as verified or unverified |
| `memory_read` | Read cross-session memory (conventions, decisions, patterns) |

## Architecture

```
maestro/
├── .claude-plugin/     # Plugin metadata
├── .mcp.json           # MCP server registration
├── agents/             # Subagent definitions (6 agents)
├── hooks/              # Hook event configuration
├── scripts/            # Hook implementations
│   ├── lib/            # Shared utilities (state, mission, memory, stdin)
│   ├── session-start.mjs
│   ├── prompt-analyze.mjs
│   ├── pre-tool-guard.mjs
│   ├── post-tool-audit.mjs
│   ├── stop-gate.mjs
│   ├── pre-compact-save.mjs
│   ├── post-compact-restore.mjs
│   ├── auto-xval.mjs
│   ├── subagent-track.mjs
│   ├── session-end.mjs
│   └── run.cjs         # ESM loader wrapper
├── skills/             # Slash command skills
├── src/mcp/            # MCP server (stdio transport)
└── CLAUDE.md           # Thoroughness protocol injected into context
```

## How the stop gate works

```
Files modified? ──No──→ ✅ Allow
       │
      Yes
       │
Tests run? ──Yes──→ ✅ Allow
       │
       No
       │
    ❌ Block
    "테스트와 빌드를 실행한 후 다시 시도하세요."
```

The gate blocks once per session — after you run tests and retry, it passes through.

## License

MIT
