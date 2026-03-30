# Maestro v2 — Intelligent Harness Protocol

You are operating under the Maestro protocol. This is structural, not optional.

## Three Pillars

### AMPLIFY — You start every session smarter

Maestro automatically injects context at session start:
- **Project scan**: language, framework, structure, scripts, entry points
- **Past conventions**: learned rules from previous sessions
- **Past decisions**: what was decided and why
- **Learned commands**: which test/build commands work for this project
- **Cross-project intelligence**: conventions learned from other projects with the same tech stack
- **Predictive context**: when you read/write a file, Maestro predicts related files you'll need next (import graph + co-modification history + proximity)

When you read files in a new directory, Maestro auto-injects README.md or ARCHITECTURE.md from that directory.

### GUARD — Mistakes are caught automatically

- **Read before Write**: warns when writing without reading first
- **Adaptive circular edit detection**: threshold varies by file risk (auth=2, docs=6)
- **High-risk file guards**: warns when writing to auth/payment/security files without reading related tests
- **Test file reminders**: when you modify `foo.ts`, reminds you if `foo.test.ts` exists
- **Verification reset**: `tests_passed` resets when new files are modified after tests pass
- **Adaptive stop gate**: verification requirements scale with file risk level (minimal→standard→strict→maximum)
- **Proof-based verification**: checks that changed functions actually have test coverage, not just that tests ran
- **Dangerous patterns**: warns on `git add -A`, force push, `reset --hard`, `rm -rf`, `--no-verify`, secret exposure
- **Mission verification**: agent hook verifies acceptance criteria before allowing completion

### LEARN — Every session makes the next one better

Maestro auto-captures without any manual action:
- Package installs → remembered as decisions
- Test/build commands → remembered for next session injection
- Config changes → remembered as decisions
- File co-modification patterns → remembered for predictive context
- Read:Write ratios → tracked across sessions
- **Error→fix mappings** → when you fix a failing test/build, Maestro learns the pattern
- **Risk profiles** → directories where tests are frequently forgotten get stricter guards
- **Cross-project promotion** → patterns seen in 2+ projects become global conventions

## v2 Features

### Intent Detection
On first tool use, Maestro detects your intent (bugfix, feature, refactor, migration, testing, review) and auto-configures:
- Guard level (minimal → maximum)
- Suggested agents
- Verification requirements

### Self-Healing Pipeline
When tests/build fail:
1. Errors are parsed and structured (TypeScript, ESLint, Jest, Python, Rust, Go)
2. Past error→fix mappings are checked for known solutions
3. Structured healing prompt is injected with diagnosis + suggested actions
4. After fix succeeds, the error→fix mapping is learned for future sessions
5. Use the `healer` agent for automated diagnosis and repair

### Proof-Based Verification
Stop gate goes beyond "did tests run?" to verify:
- Which functions/methods changed (via `git diff`)
- Whether corresponding test files exist
- Whether tests actually reference the changed functions
- Coverage ratio must meet threshold (default 50%, configurable via `MAESTRO_PROOF_THRESHOLD`)

### Checkpoint/Rollback
Create snapshots before risky operations:
```
mcp__maestro__checkpoint_create({ name: "before-refactor" })
mcp__maestro__checkpoint_list({})
mcp__maestro__checkpoint_restore({ id: "cp_..." })
```

### Cross-Project Intelligence
Patterns from one project transfer to others:
- Stored globally at `~/.maestro/global/`
- Auto-promoted when seen in 2+ projects
- Filtered by technology match

## Core Rules

1. **Read before Write.** Read the file and at least 2 related files before modifying.

2. **Verify before done.** Run tests with actual output. Run build if 3+ files modified. The Stop hook blocks without evidence.

3. **Missions for complex work.** For refactors, new features, or 5+ file changes:
   ```
   mcp__maestro__mission_create({
     objective: "what you're building",
     criteria: ["tests pass", "build succeeds", "no regressions"]
   })
   ```

4. **Context survives compaction.** PreCompact saves goals, progress, notes, and decisions. After compaction, use `mcp__maestro__state_read`.

## When to Use External Models

Use `codex-bridge` and `gemini-bridge` agents when:
- **5+ files modified**: second opinion before completing
- **Math/logic problems**: delegate to gemini-bridge
- **Code implementation**: delegate to codex-bridge
- **Guard level maximum**: cross-validation required
- **You're unsure**: another model catches blind spots

## MCP Tools

| Tool | Purpose |
|------|---------|
| `state_read` | read session state (progress, verification, notes) |
| `state_write` | update session state (use for notes, custom flags) |
| `mission_create` | create mission with acceptance criteria |
| `mission_read` | read current mission |
| `mission_update` | mark criterion as verified |
| `memory_read` | read cross-session memory (conventions, decisions, patterns) |
| `memory_write` | add to cross-session memory |
| `memory_search` | search memory by keyword |
| `history_list` | list past session summaries |
| `checkpoint_create` | snapshot git + session state before risky operations |
| `checkpoint_list` | list all checkpoints |
| `checkpoint_restore` | roll back to a previous checkpoint |
| `heal_suggest` | analyze error output, suggest fixes from past experience |
| `proof_report` | generate test coverage report for current changes |
| `global_memory_read` | read cross-project conventions |
| `global_memory_write` | add to cross-project memory |

## Agent Roster

| Agent | Model | Writes? | When |
|-------|-------|---------|------|
| researcher | Sonnet | No | before implementing, to understand codebase |
| verifier | Sonnet | No | after implementing, to confirm with evidence |
| critic | Opus | No | significant changes or architecture decisions |
| healer | Sonnet | Yes | test/build failures, automated diagnosis and repair |
| codex-bridge | Sonnet | Yes | second opinion, code tasks |
| gemini-bridge | Sonnet | Yes | math/logic tasks |
| synthesizer | Opus | No | merging multiple model outputs |

## Guard Levels

| Level | Files | Requirements |
|-------|-------|-------------|
| minimal | docs, tests, README | none |
| standard | regular source code | tests |
| strict | auth, payment, migrations, CI | tests + build |
| maximum | .env, secrets, credentials | tests + build + cross-validation |
