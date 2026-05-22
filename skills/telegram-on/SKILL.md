---
name: telegram-on
description: "Start receiving Telegram messages for this session. Starts the daemon if needed, creates a topic for the current worktree, and opens a Monitor."
---

# Telegram On

Start receiving Telegram messages in this Claude Code session.

## Steps

1. **Check daemon** — call MCP tool `telegram_daemon` with `action: "status"`. If not running, call with `action: "start"`.

2. **Derive session name** — run `basename $(git rev-parse --show-toplevel)` to get the worktree name. Sanitize: replace non-alphanumeric chars except `-` and `_` with `_`.

3. **Init session** — call MCP tool `telegram_init` with `name: <session-name>`.

4. **Check for existing Monitor** — run `pgrep -f "tail -f.*<session-name>.jsonl"`. If found, tell the user: "Telegram Monitor is already running for this worktree." and stop here.

5. **Ensure inbox file exists** — run `touch ~/.claude/thought-shower/telegram-bridge/inbox/<session-name>.jsonl`.

6. **Start Monitor** — use the Monitor tool (persistent) on: `tail -f ~/.claude/thought-shower/telegram-bridge/inbox/<session-name>.jsonl`

7. **Handle incoming messages** — each Monitor notification is a JSON line:
   ```json
   {"from":"Thien","text":"message here","ts":1716388800,"messageId":42}
   ```
   Read the message in the context of the current project and respond helpfully.

8. **Send replies** — call MCP tool `send_telegram` with the reply text.
