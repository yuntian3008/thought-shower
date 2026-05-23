---
name: telegram-on
description: "Start receiving Telegram messages for this session. Starts the daemon if needed, creates a topic for the current worktree, and opens a Monitor."
---

# Telegram On

Start receiving Telegram messages in this Claude Code session.

## Steps

1. **Check daemon** — call MCP tool `telegram_daemon` with `action: "status"`. If not running, call with `action: "start"`.

2. **Derive session name** — run `basename $(git rev-parse --show-toplevel)` to get the worktree name. Sanitize: replace non-alphanumeric chars except `-` and `_` with `_`. **Remember this name — pass it as `session` to every MCP tool call below.**

3. **Init session** — call MCP tool `telegram_init` with `name: <session-name>`.

4. **Check for existing Monitor** — run `pgrep -f "tail -f.*<session-name>.jsonl"`. If found, tell the user: "Telegram Monitor is already running for this worktree." and stop here.

5. **Ensure inbox file exists** — run `touch ~/.claude/thought-shower/telegram-bridge/inbox/<session-name>.jsonl`.

6. **Start Monitor** — use the Monitor tool (persistent) on: `tail -f ~/.claude/thought-shower/telegram-bridge/inbox/<session-name>.jsonl`

7. **Handle incoming messages** — each Monitor notification is a JSON line:
   ```json
   {"from":"Thien","text":"message here","ts":1716388800,"messageId":42}
   ```
   First, call MCP tool `telegram_seen` with `messageId` and `session: <session-name>`. Then read the message in the context of the current project and respond helpfully.

   If the JSON line includes an optional `media: {type, path, mime, size, filename}` field, read the file at `media.path` (use the `Read` tool — it handles images, PDFs, and text) before responding. The local file is auto-deleted 7 days after receipt.

8. **Send replies** — call MCP tool `send_telegram` with the reply text and `session: <session-name>`. Telegram has a 4096 character limit per message. Keep replies concise. If the answer is long, split it into multiple `send_telegram` calls yourself — each one a self-contained section with complete formatting.

9. **Ask questions** — when you need the user's input, call MCP tool `ask_telegram` with `question`, `options`, and `session: <session-name>`. The tool blocks until the user responds. The user can tap a button OR type a free-text reply if none of the options fit. Return value is `{ answer, index }` — `index` is the button index (0-based), or `-1` when the user typed a free-text reply (with `answer` holding the typed text).

## While the Monitor is running

**The user is on Telegram, not in this terminal.** Until they explicitly say they're back at the keyboard, assume every reply they send comes from their phone and they are NOT watching the Claude Code terminal.

This changes which tools you may use:

| Need | ✅ Use | ❌ Don't use |
| --- | --- | --- |
| Ask a question / get a decision | `ask_telegram` | `AskUserQuestion` (UI is invisible on Telegram) |
| Status update, progress, results | `send_telegram` | Plain text output to terminal only |
| Long answer (>4096 chars) | Multiple `send_telegram` calls, each a self-contained section | One giant terminal dump |

Plain terminal output still happens (tool calls, thinking, etc.) but the user won't see it. Anything they need to read or respond to must go through `send_telegram` / `ask_telegram` with the session name from step 2.

If `AskUserQuestion` slips out by reflex, the user will be confused — they see no question, just silence. Catch this before the tool call, not after.
