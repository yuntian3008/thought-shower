---
name: telegram
description: "Set up the Telegram bridge for Claude Code sessions. Guides through bot configuration and group discovery. For starting/stopping, use /thought-shower:telegram-on and /thought-shower:telegram-off."
---

# Telegram Bridge Setup

Set up the file-based Telegram bridge for Claude Code sessions.

## Architecture

- **Daemon** — background Bun process that polls Telegram `getUpdates` and writes to per-session inbox JSONL files (auto-trimmed to 100 lines)
- **Monitor** — `tail -f` on the inbox file delivers messages to Claude Code in real-time
- **MCP tools** — `send_telegram`, `telegram_daemon`, `telegram_init` for native integration
- **CLI** — `scripts/telegram-bridge/cli.ts` for one-time setup and discovery

Data lives at `~/.claude/thought-shower/telegram-bridge/` (persists across plugin reinstalls).

## First-Time Setup

1. Create a Telegram supergroup with Topics enabled
2. Add bot as admin with "Manage Topics" permission
3. Disable privacy mode via @BotFather → /mybots → Bot Settings → Group Privacy → Turn off
4. Find the plugin's CLI script:
   ```bash
   CLI=$(find ~/.claude/plugins -path "*/thought-shower/scripts/telegram-bridge/cli.ts" -print -quit 2>/dev/null)
   ```
5. Discover group ID:
   ```bash
   bun "$CLI" discover --token "<BOT_TOKEN>"
   ```
   Send a message in the group — the script finds the group ID.
6. Save config:
   ```bash
   bun "$CLI" setup --token "<TOKEN>" --group <GROUP_ID> --user <YOUR_TELEGRAM_USER_ID>
   ```

## Commands

| Command | What it does |
|---|---|
| `/thought-shower:telegram-on` | Start receiving — daemon + init + Monitor |
| `/thought-shower:telegram-off` | Stop receiving — kill Monitor, daemon keeps running |

## MCP Tools

| Tool | What it does |
|---|---|
| `send_telegram` | Send a message to the active session's topic |
| `telegram_daemon` | Start, stop, or check daemon status |
| `telegram_init` | Create or reuse a topic for a session name |

## Troubleshooting

- **409 Conflict** — another process is polling with the same bot token. Disable the official Telegram plugin (`"telegram@claude-plugins-official": false` in settings.json) and kill stale processes.
- **No messages arriving** — check that BotFather privacy mode is off and the bot is an admin in the group.
