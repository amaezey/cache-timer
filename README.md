# cache-timer

Claude Code mod. Prompt-cache countdown above the prompt.

## Functions

- Countdown: 60 min bar, shown while idle
- Hide / show: `/timer`
- Auto: on / off
- Auto action: compact, or status check
- Auto timing: 2, 5 or 10 min before the end
- Compact now: button
- Handoff: button. Requires the compound-engineering plugin (`ce-handoff`)

## Install

- Clone to: `~/.claude/mods/cache-timer`
- Add to `env` in `~/.claude/settings.json`:

```json
"CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/cache-timer",
"CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"
```

- Restart open sessions
