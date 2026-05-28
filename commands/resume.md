---
description: Detect the current pipeline stage from git + GitHub state, print it, and ask the user to confirm before running the next step. Use when picking up a feature after a gap (days, sessions).
---

# /thought-shower:resume

Detect → print → ask "continue?".

## Steps

### 1. Run /status logic

Invoke the body of `/thought-shower:status`. Capture the inferred next stage.

### 2. Print and ask

Show the user:

```
thought-shower resume

Current state:
  Branch:    <branch>
  PR:        <#number or none>
  CR:        <state>

Inferred next stage: <Stage X — short description>

Continue from this stage? [yes | no | run /status only]
```

### 3. Branch on user reply

| Reply | Action |
| --- | --- |
| `yes` | Invoke the relevant sub-flow: Stage 1 → call `/thought-shower:start` (no description, ask user); Stage 2+ → call `/thought-shower:ship` |
| `no` | Stop. Print `OK. Run /thought-shower:start or /thought-shower:ship manually when ready.` |
| `run /status only` | Print full /status report and stop |

### 4. Special cases

- **Stage 6 detected** → report `PR is ready to merge. Run /thought-shower:ship for the handoff summary.`
- **Codex stage uncertain** → if next-stage is "Stage 3 or later", tell the user: `Codex run state unknown — /ship will re-run Codex review.`
- **Stage detection fails** → print the failure and stop.
