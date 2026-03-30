<h1 align="center">
  <code>maestro</code>
</h1>

<p align="center">
  <strong>Intelligent harness for Claude Code</strong><br/>
  Amplify, guard, and learn — automatically.
</p>

<p align="center">
  <a href="#install">Install</a> · <a href="#how-it-works">How it works</a> · <a href="#agents">Agents</a> · <a href="#skills">Skills</a> · <a href="#mcp-tools">MCP Tools</a>
</p>

---

## Why

Claude Code is powerful but has no memory between sessions, no project awareness at start, and no structural enforcement of quality. Maestro fixes all three — automatically, with zero configuration.

- **AMPLIFY** — Scans your project at session start and injects structure, conventions, and past decisions into context
- **GUARD** — Blocks completion without tests, warns on dangerous patterns, detects circular edits
- **LEARN** — Auto-captures decisions, commands, and patterns. Every session makes the next one smarter

## Install

```sh
claude plugin add jbj338033/maestro
```

Requires Node.js >= 22 and Claude Code with plugin support.

## How it works

### AMPLIFY — Smarter from the first message

| Feature | How |
|---------|-----|
| **Project scan** | SessionStart scans `package.json`, `Cargo.toml`, directory tree → injects language, framework, scripts, entry points |
| **Memory injection** | Past conventions and decisions are injected as actual content, not just counts |
| **Learned commands** | Test/build commands from past sessions are surfaced automatically |
| **Directory context** | When you first read a file in a directory, its README.md is auto-injected |

### GUARD — Mistakes caught automatically

| Feature | How |
|---------|-----|
| **Stop gate** | Blocks completion if tests weren't run after file changes |
| **Verification reset** | `tests_passed` resets when new files are modified after passing |
| **Circular edit detection** | Warns after 3+ consecutive edits without re-reading |
| **Test file reminder** | Reminds you when `foo.test.ts` exists for a modified `foo.ts` |
| **Dangerous patterns** | `git add -A`, force push, `--hard`, `rm -rf`, `--no-verify`, secret exposure |
| **Mission verification** | Agent verifies acceptance criteria before allowing completion |

### LEARN — Gets smarter over time

| Captured | When | Used |
|----------|------|------|
| Package installs | `npm/pnpm install X` | Remembered as decisions |
| Test commands | `pnpm test`, `cargo test`, etc. | Injected at next session start |
| Build commands | `pnpm build`, `next build`, etc. | Injected at next session start |
| Config changes | Edits to `tsconfig.json`, etc. | Remembered as decisions |
| File co-modification | Which directories change together | Pattern awareness |

## Hooks

| Hook | What it does |
|------|-------------|
| **SessionStart** | Project scan + memory injection + compact state restore |
| **PreToolUse** | Dangerous pattern warnings + directory context injection + circular edit detection |
| **PostToolUse** | File tracking + test/build detection + auto-capture decisions + test file reminders |
| **Stop** | Verification gate + cross-validation reminder + mission criteria verification |
| **PreCompact** | Save state + notes + decisions before compression |
| **PostCompact** | Restore state after compression |
| **SubagentStart/Stop** | Track active subagents |
| **SessionEnd** | Save history + learn patterns + cleanup subagents |

## Agents

| Agent | Model | Writes? | Purpose |
|-------|-------|---------|---------|
| **researcher** | Sonnet | No | Read-only codebase exploration |
| **verifier** | Sonnet | No | Evidence-based verification |
| **critic** | Opus | No | Security, performance, maintainability review |
| **codex-bridge** | Sonnet | Yes | Delegates to OpenAI Codex CLI |
| **gemini-bridge** | Sonnet | Yes | Delegates to Google Gemini CLI |
| **synthesizer** | Opus | No | Reconciles multi-model outputs |

## Skills

| Skill | Usage | Description |
|-------|-------|-------------|
| **ask** | `/maestro:ask <codex\|gemini> "question"` | Query an external model |
| **status** | `/maestro:status` | Show session state, mission progress |
| **setup** | `/maestro:setup` | Install HUD statusline, verify environment |

## MCP Tools

| Tool | Description |
|------|-------------|
| `state_read` | Read session state |
| `state_write` | Update session state |
| `mission_create` | Create mission with acceptance criteria |
| `mission_read` | Read current mission |
| `mission_update` | Mark criteria verified/unverified |
| `memory_read` | Read cross-session memory |
| `memory_write` | Add to cross-session memory |
| `memory_search` | Search memory by keyword |
| `history_list` | List past session history |

## Architecture

```
maestro/
├── .claude-plugin/     # Plugin metadata
├── .mcp.json           # MCP server registration
├── agents/             # 6 subagent definitions
├── hooks/              # Hook event configuration
├── scripts/
│   ├── lib/
│   │   ├── codebase.mjs  # Project scanner (AMPLIFY)
│   │   ├── state.mjs     # Atomic JSON state
│   │   ├── mission.mjs   # Mission CRUD
│   │   ├── memory.mjs    # Cross-session memory
│   │   ├── stdin.mjs     # Timeout-protected stdin
│   │   └── xval.mjs      # Codex/Gemini CLI bridges
│   ├── session-start.mjs   # AMPLIFY: scan + inject
│   ├── pre-tool-guard.mjs  # GUARD + AMPLIFY: warnings + dir context
│   ├── post-tool-audit.mjs # GUARD + LEARN: track + capture
│   ├── stop-gate.mjs       # GUARD: verification gate
│   ├── auto-xval.mjs       # GUARD: cross-validation reminder
│   ├── pre-compact-save.mjs
│   ├── post-compact-restore.mjs
│   ├── subagent-track.mjs
│   ├── session-end.mjs     # LEARN: patterns + cleanup
│   ├── statusline.mjs      # HUD
│   └── run.cjs             # ESM loader wrapper
├── skills/             # Slash command skills
├── src/mcp/            # MCP server (stdio)
└── CLAUDE.md           # Protocol injected into context
```

## License

MIT
