# cache-timer

A Claude Code mod that shows how long the prompt cache has left, and can act before it runs out.

## What it does

- **A countdown above the prompt.** A bar drains over the cache's hour, shown while Claude is idle. On desktop a small flame rides the bar and cools into an ice cube as time runs out. In the terminal it is a text bar.
- **Auto.** Switch it on and choose what happens shortly before the cache goes cold: compact the chat, or ask Claude for a short status check, which keeps the cache warm for another hour. It can act 2, 5 or 10 minutes before the end, and acts once per idle stretch.
- **Compact now** and **Handoff** buttons.
- **Real step details.** Claude's step line shows the file, search words or command of the step that is running.
- **`/timer`** hides the bar, and shows it again. The choice is remembered.

## Install

1. Put this folder at `~/.claude/mods/cache-timer`.
2. Add two entries to the `env` block of `~/.claude/settings.json`:

   ```json
   "CLAUDE_CODE_PLUGIN_DIRS": "/Users/you/.claude/mods/cache-timer",
   "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"
   ```

3. Start a new session. The bar appears after Claude's first reply.

## Limits

- It assumes a one-hour cache, which is what a Claude subscription gets. On usage credits or an API key the cache lasts five minutes, and a mod cannot tell which applies. Change `CACHE_MINUTES` in `hooks/register.tsx` to match.
- A compact cannot be undone. With Auto set to compact, it happens while you are away.

## Checking it

```bash
claude plugin validate .
claude plugin test .
```
