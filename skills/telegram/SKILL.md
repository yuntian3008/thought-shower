---
name: telegram
description: "Set up the Telegram bridge for Claude Code sessions. Guides through bot configuration, group discovery, and config setup. For starting/stopping the bridge, use /thought-shower:telegram-on and /thought-shower:telegram-off."
---

# Telegram Bridge Setup

Set up the file-based Telegram bridge for Claude Code sessions.

## Architecture

- **Daemon** — background Bun process that polls Telegram `getUpdates` and writes to per-session inbox JSONL files
- **Monitor** — `tail -f` on the inbox file delivers messages to Claude Code in real-time
- **MCP tool** — `send_telegram` sends replies back to the Telegram topic
- **CLI** — `scripts/telegram-bridge/cli.ts` for setup, session init, daemon management

Data lives at `~/.claude/thought-shower/telegram-bridge/` (persists across plugin reinstalls).

## First-Time Setup

1. Create a Telegram supergroup with Topics enabled
2. Add bot as admin with "Manage Topics" permission
3. Disable privacy mode via @BotFather → /mybots → Bot Settings → Group Privacy → Turn off
4. Discover group ID:
   ```bash
   bun ~/wp/plugins/thought-shower/scripts/telegram-bridge/cli.ts discover --token "<BOT_TOKEN>"
   ```
   Send a message in the group — the script finds the group ID.
5. Save config:
   ```bash
   bun ~/wp/plugins/thought-shower/scripts/telegram-bridge/cli.ts setup --token "<TOKEN>" --group <GROUP_ID> --user <YOUR_TELEGRAM_USER_ID>
   ```

## Commands

| Command | What it does |
|---|---|
| `/thought-shower:telegram-on` | Start receiving — daemon + Monitor + trim inbox |
| `/thought-shower:telegram-off` | Stop receiving — kill Monitor, daemon keeps running |

## CLI Reference

```bash
CLI=~/wp/plugins/thought-shower/scripts/telegram-bridge/cli.ts

bun $CLI setup --token <T> --group <G> --user <U>   # Save config
bun $CLI discover --token <T>                         # Find group ID
bun $CLI init --name <session>                        # Create/reuse topic
bun $CLI send <text>                                  # Send message
bun $CLI sessions                                     # List sessions
bun $CLI daemon start|stop|status                     # Manage daemon
```

## Troubleshooting

- **409 Conflict** — another process is polling with the same bot token. Disable the official Telegram plugin in settings.json (`"telegram@claude-plugins-official": false`) and kill stale processes: `pkill -f "server.ts"` (the official plugin's MCP server).
- **No messages arriving** — check that BotFather privacy mode is off and the bot is an admin in the group.
