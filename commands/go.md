---
description: Short alias for /through-shower:through-shower. Auto-chains /start then /ship in one session. See /through-shower:through-shower for the full description.
---

# /through-shower:go $ARGUMENTS

Alias for `/through-shower:through-shower`. Identical behavior — added because `/through-shower:g` is one keystroke and resolves unambiguously in the autocomplete picker.

## Steps

Execute the body of `/through-shower:through-shower` verbatim with the same `$ARGUMENTS`:

1. Invoke `/through-shower:start $ARGUMENTS` (the `--lite` flag, if present in `$ARGUMENTS`, is forwarded).
2. When `/start` returns control (brainstorming + execution finish), check the working tree:
   - At least one commit exists ahead of the recorded base — else stop and report `No code committed; nothing to ship.`
3. Invoke `/through-shower:ship`.

## When NOT to use this

Same as `/through-shower:through-shower` — see that command for the full caveat list. Short version: only for trivially small features that fit in one sitting.
