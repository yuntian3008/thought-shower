---
name: learn
description: "Extract non-obvious learnings from the current session and route each one to its canonical home — rules, ADRs, runbooks, AGENTS.md gotchas, or the user's memory directory. Auto-detects which destinations exist in the current repo. Use when the user wants to capture session learnings, distill knowledge, or accumulate gotchas after finishing a task. Triggers on: learn, capture learnings, distill session, accumulate knowledge."
user_invocable: true
---

# `/learn`

Scan the current session transcript for non-obvious learnings, classify each one's destination, gate them on dedupe + evidence, then present a batch for the user to approve. Apply approved candidates and commit per destination file.

## Step 0 — Detect available destinations

Before extracting, scan the current working directory for destination dirs that exist. Build `AVAILABLE_DESTINATIONS` from what's present:

```bash
# Always available
AGENTS_MD=true    # any repo can have <folder>/AGENTS.md
MEMORY=true       # user memory dir always exists

# Conditionally available — check existence
RULES=$([ -d .claude/rules ] && echo true || echo false)
ADR=$([ -d docs/adr ] && echo true || echo false)
RUNBOOKS=$([ -d docs/runbooks ] && echo true || echo false)
```

Only route learnings to destinations that are `true`. When presenting candidates, skip unavailable destination types silently — don't suggest creating directories.

## Step 1 — Extract candidates

Scan the current session transcript for non-obvious discoveries:

- Tool calls that produced unexpected results
- File edits driven by user corrections ("don't do X", "use Y instead")
- Multi-attempt fixes where the first approach failed
- Misleading errors with non-obvious root causes
- Commands / configs / flags that were not in any AGENTS.md, rule, or README

Apply the filter. Keep a candidate only if it matches **at least one INCLUDE** and **zero EXCLUDE**:

**INCLUDE:**

- Hidden relationships between files / modules (must change together)
- Execution paths that differ from how the code reads
- Misleading error messages with the actual root cause
- Tool / API quirks and workarounds
- Non-obvious config, env vars, flags
- User explicit corrections ("don't do X" / "always do Y")

**EXCLUDE:**

- Already documented in `CLAUDE.md` / `AGENTS.md` / `.claude/rules/` / `docs/adr/` / `docs/runbooks/`
- Standard language / framework behavior
- Session-specific one-offs (not a repeating pattern)
- Hypotheses without commit hash or file:line evidence

## Step 2 — Classify destination

Walk this decision tree top-down. The first match wins. **Skip any row whose destination is unavailable (Step 0).**

| Lesson signature                                       | Destination                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| Scope = a single folder / file (folder-specific quirk) | `<closest-folder>/AGENTS.md` `## Gotchas` section                          |
| "Picked X over Y because Z" (architectural decision)   | `docs/adr/NNNN-<slug>.md` — new file, NNNN = next free number              |
| Step-by-step operational procedure                     | `docs/runbooks/<name>.md` — new or append                                  |
| Cross-cutting code rule, matches an existing rule area | `.claude/rules/<area>.md` — append                                         |
| Personal preference / cross-project insight            | `~/.claude/projects/.../memory/<type>_<name>.md` + `MEMORY.md` index entry |
| Doesn't match cleanly                                  | SKIP — do not create new files just to home a lesson                       |

When `RULES=true`, list files under `.claude/rules/` at invocation time and match the lesson to the area whose filename best fits. Do not create a new `.claude/rules/<file>.md` without explicit user approval.

## Step 3 — Hard gates

Apply both gates per candidate. If either fails, mark the candidate accordingly and set the default action to `skip`.

**Dedupe:** read the destination file. For folder `AGENTS.md`, grep only the `## Gotchas` section. If similar content already exists, mark `[DUP]`.

**Evidence:** each candidate must carry a commit hash or file:line reference from this session. Otherwise mark `[NO-EVIDENCE]`.

## Step 4 — Present batch

Print one batch in this format:

```
Found N candidate learnings:

[1] READY
    Lesson: <one-line summary>
    Destination: <path> (<section if applicable>)
    Evidence: <commit-hash> — <commit subject>     OR     <file:line>

[2] DUP
    Lesson: <one-line summary>
    Destination: <path> (already documented at <line/section>)
    Default: skip

[3] NO-EVIDENCE
    Lesson: <one-line summary>
    Reason: no commit / file:line ref in this session
    Default: skip

Reply with:
- "ok"                    → apply all defaults (READY → write, DUP/NO-EVIDENCE → skip)
- per-item override:
    "1 reject"            (drop a READY candidate)
    "2 dest=docs/adr/"    (re-route to a different destination)
    "3 force"             (write despite DUP)
    "4 dest=memory:reference_<name>.md"  (route to memory)
```

If `N == 0`, print `No non-obvious learnings detected.` and exit.

## Step 5 — Apply + commit

Wait for the user's reply. Apply overrides on top of defaults. For each candidate to be written:

| Destination                       | Format                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/rules/<area>.md`         | Bullet under the most relevant existing section. New subsection only if no existing section fits.                                                                         |
| `docs/adr/NNNN-<slug>.md`         | New file from `docs/adr/template.md` if it exists; otherwise use MADR short format. NNNN = next free number (scan existing files).                                        |
| `docs/runbooks/<name>.md`         | Create new or append. Match the style of existing runbooks.                                                                                                               |
| `<folder>/AGENTS.md` `## Gotchas` | Append `- YYYY-MM-DD: <one-line lesson> (commit <short-hash>)`. Create the `## Gotchas` section at the bottom if missing. Do not edit other sections.                     |
| Memory file                       | New file with frontmatter (`name`, `description`, `type`) matching the format used in `~/.claude/projects/.../memory/`. Update `MEMORY.md` index with a one-line pointer. |

Commit per destination file using Conventional Commits. Examples:

- `docs(rules): add idempotency note to database.md`
- `docs(adr): add ADR-0017 cancellation semantics`
- `docs(agents): note onTerminate skip in chat-turn`

Memory writes happen outside the repo — no commit.

If a write fails, log it, continue with the rest, and report what succeeded vs failed at the end.

## Edge cases

- **Long session (transcript >200k tokens):** scan only the most recent window; print a warning.
- **User rejects entire batch:** no commits, exit clean.
- **ADR conflict:** before proposing an ADR destination, grep existing ADR titles for keyword overlap. If a likely conflict is detected, mark `[CONFLICT-ADR-NNNN]` and skip auto-route.
- **Memory write fails:** skip that entry, continue with others.
- **No destinations available (bare repo):** only AGENTS.md gotchas and memory are available. Route there or skip.
