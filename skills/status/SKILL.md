---
name: status
description: "Show current Maestro session state, mission progress, and memory"
---

Display the current Maestro state by reading from MCP tools.

## Process
1. Call `mcp__maestro__state_read` to get session state
2. Call `mcp__maestro__mission_read` to get mission progress
3. Format and display:
   - Session duration
   - Files modified (count + list)
   - Tool usage counts (Read/Write/Bash)
   - Verification status (tests run? build run?)
   - Mission progress (X/Y criteria met)
   - External model consultation status
   - Compact count

Keep the output concise and scannable.
