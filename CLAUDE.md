# Maestro — Intelligent Harness Protocol

You are operating under the Maestro protocol. This is structural, not optional.

## Three Pillars

### AMPLIFY — You start every session smarter

Maestro automatically injects context at session start:
- **Project scan**: language, framework, structure, scripts, entry points
- **Past conventions**: learned rules from previous sessions
- **Past decisions**: what was decided and why
- **Learned commands**: which test/build commands work for this project

When you read files in a new directory, Maestro auto-injects README.md or ARCHITECTURE.md from that directory. You don't need to search for them.

### GUARD — Mistakes are caught automatically

- **Read before Write**: warns when writing without reading first
- **Circular edit detection**: warns after 3+ consecutive edits to the same file without re-reading
- **Test file reminders**: when you modify `foo.ts`, reminds you if `foo.test.ts` exists
- **Verification reset**: `tests_passed` resets when new files are modified after tests pass
- **Stop gate**: blocks completion if tests/build weren't run after file changes
- **Dangerous patterns**: warns on `git add -A`, force push, `reset --hard`, `rm -rf`, `--no-verify`, secret exposure
- **Mission verification**: agent hook verifies acceptance criteria before allowing completion

### LEARN — Every session makes the next one better

Maestro auto-captures without any manual action:
- Package installs → remembered as decisions
- Test/build commands → remembered for next session injection
- Config changes → remembered as decisions
- File co-modification patterns → remembered for awareness
- Read:Write ratios → tracked across sessions

## Core Rules

1. **Read before Write.** Read the file and at least 2 related files before modifying. The hook warns if you write without reading.

2. **Verify before done.** Run tests with actual output. Run build if 3+ files modified. The Stop hook blocks without evidence.

3. **Missions for complex work.** For refactors, new features, or 5+ file changes, create a mission:
   ```
   mcp__maestro__mission_create({
     objective: "what you're building",
     criteria: ["tests pass", "build succeeds", "no regressions"]
   })
   ```
   The Stop hook agent verifies each criterion. Do NOT create missions for simple tasks.

4. **Context survives compaction.** PreCompact saves goals, progress, notes, and decisions. After compaction, use `mcp__maestro__state_read` to check current state.

## When to Use External Models

Use `codex-bridge` and `gemini-bridge` agents when:
- **5+ files modified**: second opinion before completing
- **Math/logic problems**: delegate to gemini-bridge
- **Code implementation**: delegate to codex-bridge
- **Conflicting approaches**: run both, then use synthesizer
- **You're unsure**: another model catches blind spots

Skip for trivial tasks (typo fixes, single-line changes).

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

## Agent Roster

| Agent | Model | Writes? | When |
|-------|-------|---------|------|
| researcher | Sonnet | No | before implementing, to understand codebase |
| verifier | Sonnet | No | after implementing, to confirm with evidence |
| critic | Opus | No | significant changes or architecture decisions |
| codex-bridge | Sonnet | Yes | second opinion, code tasks |
| gemini-bridge | Sonnet | Yes | math/logic tasks |
| synthesizer | Opus | No | merging multiple model outputs |
