---
name: telegram-off
description: "Stop receiving Telegram messages in this session. Kills the Monitor but keeps the daemon running for other sessions."
---

# Telegram Off

Stop receiving Telegram messages in this session.

## Steps

1. **Derive session name** — run `basename $(git rev-parse --show-toplevel)`. Sanitize: replace non-alphanumeric chars except `-` and `_` with `_`.

2. **Kill Monitor** — run `pkill -f "tail -f.*<session-name>.jsonl"`.

3. **Confirm** — tell the user: "Telegram Monitor stopped. Daemon is still running — new messages are saved to the inbox. Run /thought-shower:telegram-on to reconnect."
