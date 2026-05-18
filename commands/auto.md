---
description: Auto-chain alias. Runs /through-shower:start then /through-shower:ship in one session. Same body as /through-shower:through-shower. Use only for trivially small features.
---

# /through-shower:auto $ARGUMENTS

Auto-chain alias for `/through-shower:through-shower`. The shorter name also sorts first alphabetically in the slash-command picker, so it surfaces above `resume` / `ship` / `start` / `status` when you type `/through`.

**Use only for trivially small features.** Brainstorming + execution + review + merge in one sitting. For multi-day features, use `/start` and `/ship` separately.

## Steps

1. Invoke `/through-shower:start $ARGUMENTS` (the `--lite` flag, if present in `$ARGUMENTS`, is forwarded).
2. When `/start` returns control (brainstorming + execution finish), check the working tree:
   - At least one commit exists ahead of the recorded base — else stop and report `No code committed; nothing to ship.`
3. Invoke `/through-shower:ship`.

That's it — both subcommands handle their own preflight, idempotency, and prompts.

## When NOT to use this

- Feature requires multi-session execution.
- You want a checkpoint between brainstorming and shipping.
- Brainstorming output suggests the scope needs decomposition.
