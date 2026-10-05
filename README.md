# cache-timer

Counts down Claude Code's one-hour prompt cache, above the prompt.

- **Auto on / off**: compact, or ask for a status check, 2, 5 or 10 minutes before it runs out.
- **Compact now** and **Handoff** buttons.
- `/timer` hides or shows it.

## Install

Clone to `~/.claude/mods/cache-timer`, then add to `env` in `~/.claude/settings.json`:

```json
"CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/cache-timer",
"CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"
```

New sessions pick it up.
