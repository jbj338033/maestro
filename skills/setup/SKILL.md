---
name: setup
description: "Set up Maestro — install HUD wrapper, register statusline, verify environment"
---

Run Maestro setup: install the HUD wrapper, register the statusline, verify environment, and check prerequisites.

## Process

### 1. Check prerequisites
Run these in parallel:
- `node -v` — verify Node.js >= 22
- `which codex` — check codex CLI (optional)
- `which gemini` — check gemini CLI (optional)

### 2. Install HUD wrapper
Create `~/.claude/hud/maestro-hud.mjs` — a stable entry point that finds the statusline script regardless of plugin version or dev mode.

```javascript
#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

async function main() {
  const home = homedir();
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(home, ".claude");

  // 1. Dev mode: MAESTRO_DEV=1 uses repo path
  if (process.env.MAESTRO_DEV === "1") {
    const devPaths = [
      join(home, "workspace/jbj338033/maestro/scripts/statusline.mjs"),
      join(home, "Workspace/maestro/scripts/statusline.mjs"),
    ];
    for (const p of devPaths) {
      if (existsSync(p)) {
        await import(pathToFileURL(p).href);
        return;
      }
    }
  }

  // 2. Plugin cache (production)
  const cacheBase = join(configDir, "plugins", "cache", "maestro", "maestro");
  if (existsSync(cacheBase)) {
    try {
      const versions = readdirSync(cacheBase)
        .filter(v => existsSync(join(cacheBase, v, "scripts/statusline.mjs")))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .reverse();
      if (versions.length > 0) {
        await import(pathToFileURL(join(cacheBase, versions[0], "scripts/statusline.mjs")).href);
        return;
      }
    } catch { /* continue */ }
  }

  // 3. Fallback
  console.log("[Maestro] HUD not found. Run /maestro:setup");
}

main();
```

Write this file to `~/.claude/hud/maestro-hud.mjs`. Create the `~/.claude/hud/` directory if it doesn't exist.

### 3. Register statusline
Read `~/.claude/settings.json` and update the `statusLine` field:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node $HOME/.claude/hud/maestro-hud.mjs"
  }
}
```

**Rules:**
- If no statusline is set → add it directly
- If Maestro HUD is already set → skip, inform user it's already configured
- If another statusline exists (e.g., OMC) → **ask the user** before replacing. Show what's currently set and confirm.

Use the Edit tool to update `~/.claude/settings.json`. Do NOT overwrite the entire file.

### 4. Verify
Test the HUD by running: `echo '{"model":{"id":"test","display_name":"Test"}}' | node ~/.claude/hud/maestro-hud.mjs`

### 5. Report
```
Maestro setup complete.
  Node.js:    v24.x ✓
  Codex CLI:  available ✓ / not found (optional)
  Gemini CLI: available ✓ / not found (optional)
  HUD:        installed at ~/.claude/hud/maestro-hud.mjs ✓
  Statusline: registered in settings.json ✓
```
