---
description: Stage 1 of thought-shower. Pick a base branch, create a feature branch from a description (auto-inferred type+slug), then invoke superpowers:brainstorming. Pass --lite as the first arg to use brainstorming-lite instead.
---

# /thought-shower:start [--lite] $ARGUMENTS

Run **Stage 1** of the thought-shower pipeline: branch setup + brainstorming kickoff.

## Preflight (fail fast)

Before doing anything else, verify required dependencies are loaded. If ANY are missing, stop and report:

```
thought-shower preflight failed. Missing: <list>
Install: superpowers, codex
```

Required:
- skill `superpowers:brainstorming`
- skill `thought-shower:brainstorming-lite` (only if `--lite`)
- skill `superpowers:finishing-a-development-branch`
- skill `superpowers:receiving-code-review`
- agent `thought-shower:codex-reviewer`

`gh` must also be authenticated (`gh auth status`).

## Argument parsing

`$ARGUMENTS` may start with `--lite`. If so:
- Set `LITE=1` and strip the flag.
- Use `thought-shower:brainstorming-lite` in step 7.

The remaining text is `<description>`. If empty, ask the user "What's this feature about?" and use their reply.

## Steps

### 1. Working-tree check (refuse-on-dirty)

Run `git status --porcelain`. If output is non-empty, **stop** and tell the user:

```
Working tree has uncommitted changes. Commit or stash before /start.
<git status output>
```

Do NOT auto-stash. The user decides.

### 2. Mid-flow detection

Determine the default branch (`gh repo view --json defaultBranchRef -q .defaultBranchRef.name`, fall back to `dev`).

Run `git branch --show-current`. If current branch != default branch:

Ask the user:

```
You're on `<current-branch>`. Continue brainstorming on this branch, or create a fresh one off the default branch?
```

Options: `continue` (skip to step 6, recorded base = `git rev-parse --abbrev-ref @{upstream}` if set, else default) | `fresh` (proceed to step 3).

If current branch == default branch, proceed to step 3 silently.

### 3. Pick base branch

Ask one question:

```
Which base branch? [dev (default) | main | other]
```

Default = `dev`. Record the answer as `BASE`.

### 4. Infer type + slug from description

From `<description>`, infer the Conventional Commits type by looking at the first verb (case-insensitive):

| Verb prefix | Type |
| --- | --- |
| add, build, create, introduce, support, expose | feat |
| fix, repair, resolve, correct, patch | fix |
| remove, delete, drop, cleanup, prune | chore |
| rename, move, extract, refactor, split, consolidate | refactor |
| update docs, document, doc | docs |
| test, cover, spec | test |
| perf, optimize, speed up | perf |
| ci, build, release | ci or build (pick whichever fits) |

Default if no verb matches: `feat`.

Slug = remaining words (after removing the verb), lowercased, kebab-cased, max 4 words. Strip articles (`a`, `an`, `the`).

Show the inferred branch name and ask **only if ambiguous** (no verb matched, multi-verb, or slug ends up empty):

```
Inferred branch: `<type>/<slug>`. Use this, or type a different branch name?
```

If unambiguous, just proceed.

### 5. Create the branch

```bash
git switch -c <type>/<slug> "$BASE"
```

If the branch name is already taken, append a numeric suffix (`-2`, `-3`, …) and retry.

### 6. Hold context

Record in conversation context (do NOT write to memory):
- `RECORDED_BASE = $BASE` (or detected upstream for the mid-flow case)
- `FEATURE_BRANCH = <branch>`

### 7. Invoke brainstorming

Use the `Skill` tool:
- If `LITE=1`: invoke `thought-shower:brainstorming-lite`.
- Else: invoke `superpowers:brainstorming`.

Pass `<description>` as the topic. Do not auto-chain into `/ship` — that's a separate command.

## On completion

Print a one-line confirmation:
```
Stage 1 done. Branch: <type>/<slug> (base: <BASE>). When code is committed, run /thought-shower:ship.
```
