---
name: prompt
description: "Generate raw prompt material as input for brainstorming. Takes a task, explores just enough context to write a well-scoped prompt, and saves it to .prompts/. For large tasks, splits into multiple prompts. Triggers on: write a prompt, prompt for brainstorming, prep a brainstorm, create prompt material."
user_invocable: true
---

# `/prompt`

Turn a task into one or more ready-to-paste prompt strings for `/brainstorming` or `/brainstorming-lite`.

## Step 0 — Understand the task

Read the user's message (or skill args) to extract the task.

If no task is provided, ask:

```
What task do you want a brainstorming prompt for?
```

Then wait.

## Step 1 — Light context scan

Spend ≤ 5 tool calls gathering context that makes the prompt better:

- Read relevant CLAUDE.md / AGENTS.md near the likely affected area
- Check existing code structure (ls, quick grep) if the task names specific files or modules
- Look at recent git log if the task relates to ongoing work

Gather just enough to give brainstorming a running start.

## Step 2 — Scope check

Evaluate whether the task is a single brainstorming session or should be split.

**Split signals:**

- Task has high complexity — many moving parts, edge cases, or unknowns
- Task involves multiple non-trivial problems that each need their own brainstorming focus
- A single brainstorming session would be overwhelmed trying to cover everything

**Single signals:**

- Task is straightforward even if it touches multiple files or services
- All parts share enough context that splitting would lose important connections

If splitting, tell the user:

```
This task has N independent parts. I'll generate a prompt for each:
1. <part-1 summary>
2. <part-2 summary>
...
```

Wait for the user to confirm or adjust the split before proceeding.

## Step 3 — Ask destination

```
Where should I save the prompt file(s)?
Default: .prompts/
```

Offer `.prompts/` as the recommended option. Also offer the current directory and `docs/local/` as alternatives.

Create the destination directory if it does not exist.

## Step 4 — Write the prompt(s)

For each prompt, write a plain text file. The content is a well-written paragraph or two — a raw prompt string that someone can paste directly into `/brainstorming` or `/brainstorming-lite`.

**What a good prompt includes:**

- What to build / change and why
- Which part of the codebase it touches (packages, files, modules)
- Known constraints or requirements the user stated
- Relevant context from the light scan (existing patterns, conventions, related code)
- Anything the user should decide during brainstorming (open questions, tradeoffs to explore)

**What a good prompt does NOT include:**

- Implementation details or code snippets
- Design decisions
- Headers, sections, or markdown formatting
- Filler phrases ("In this task we will..." / "The goal is to...")

**Filename:** `<task-slug>.md` in kebab-case, derived from the task description. For multi-prompt splits, use `<task-slug>-<part>.md`.

**Length:** 100–300 words per prompt.

## Step 5 — Report

Print what was created:

```
Created N prompt(s):
  <path/to/prompt-1.md>
  <path/to/prompt-2.md>

Paste into /brainstorming or /brainstorming-lite when ready.
```

## Edge cases

- **Task is trivially small** (rename a variable, fix a typo): tell the user this doesn't need brainstorming — just do it.
- **Task is vague** ("improve the app"): ask one clarifying question to narrow scope. If still vague after one round, write the prompt with the vagueness called out explicitly so brainstorming can address it.
- **Destination already has a file with the same name**: append a numeric suffix (`-2`, `-3`).
