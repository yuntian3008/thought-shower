---
name: learn
description: "Extract non-obvious learnings from the current session and route each one to its canonical home as declared in the project's CANONICAL.md. If CANONICAL.md is missing, scaffold one interactively. Triggers on: learn, capture learnings, distill session, accumulate knowledge."
user_invocable: true
---

# `/learn`

Scan the current session transcript for non-obvious learnings, match each against the routing table in `CANONICAL.md`, gate on dedupe + evidence, then present a batch for the user to approve.

## Step 0 — Load routing table

Read `./CANONICAL.md` from the project root.

**If the file exists:** parse the first markdown table. Each row has four columns:

| Column | Meaning |
|---|---|
| Type | Short label for this destination (e.g. `rules`, `adr`, `gotchas`) |
| Path | Directory path relative to project root, or `auto` for destinations that resolve dynamically |
| When | Describes which learnings belong here — used to match candidates |
| Format | How to write the entry into this destination |

Build `ROUTING_TABLE` — a list of `{type, path, when, format}` entries, preserving table order. Unknown or malformed rows are silently skipped.

**If the file is missing:** run the scaffolding flow, then exit.

### Scaffolding flow

1. Print: `No CANONICAL.md found. Let's set one up.`

2. Two destinations are always included (do not ask):

   | Type | Path | When | Format |
   |---|---|---|---|
   | gotchas | auto | Scope = a single folder or file (folder-specific quirk) | Append `- YYYY-MM-DD: <lesson> (commit <short-hash>)` to nearest `<folder>/AGENTS.md ## Gotchas`. Create section if missing. |
   | memory | auto | Personal preference or cross-project insight | New file with frontmatter (name, description, type) in user memory dir. Update MEMORY.md index. |

3. Ask the user which additional destinations to enable (multi-select):

   ```
   Which additional destinations should /learn route to?
   (gotchas and memory are always enabled)

   ☐ rules (.claude/rules/)
   ☐ adr (docs/adr/)
   ☐ runbooks (docs/runbooks/)
   ```

4. For each selected destination, add its row using these defaults:

   | Type | Path | When | Format |
   |---|---|---|---|
   | rules | .claude/rules/ | Cross-cutting code rule that matches an existing rule file | Bullet under the most relevant existing section. No new files without user approval. |
   | adr | docs/adr/ | "Picked X over Y because Z" — an architectural decision | New file from docs/adr/template.md if it exists; otherwise MADR short format. NNNN = next free number. |
   | runbooks | docs/runbooks/ | Step-by-step operational procedure | Create new or append. Match the style of existing runbooks. |

5. Write `./CANONICAL.md` with the assembled table:

   ```markdown
   # Canonical Homes

   Where `/learn` routes session learnings in this repo.
   Edit rows to customize routing. Remove a row to disable that destination.

   | Type | Path | When | Format |
   |---|---|---|---|
   | ... assembled rows ... |
   ```

6. Print: `Created CANONICAL.md. Re-run /learn to extract learnings.`

7. Exit — do not extract learnings on the scaffolding run.

## Step 1 — Extract candidates

Scan the current session transcript for non-obvious discoveries:

- Tool calls that produced unexpected results
- File edits driven by user corrections ("don't do X", "use Y instead")
- Multi-attempt fixes where the first approach failed
- Misleading errors with non-obvious root causes
- Commands / configs / flags not documented in any AGENTS.md, rule, or README

Keep a candidate only if it matches **at least one INCLUDE** and **zero EXCLUDE**:

**INCLUDE:**

- Hidden relationships between files / modules (must change together)
- Execution paths that differ from how the code reads
- Misleading error messages with the actual root cause
- Tool / API quirks and workarounds
- Non-obvious config, env vars, flags
- User explicit corrections ("don't do X" / "always do Y")

**EXCLUDE:**

- Already documented in CLAUDE.md / AGENTS.md / any path listed in CANONICAL.md
- Standard language / framework behavior
- Session-specific one-offs (not a repeating pattern)
- Hypotheses without commit hash or file:line evidence

## Step 2 — Classify destination

For each candidate, walk `ROUTING_TABLE` top-down. Compare the candidate against each row's `When` description. First match wins.

If no row matches, mark the candidate as SKIP.

## Step 3 — Hard gates

Apply both gates per candidate. If either fails, set the default action to `skip`.

**Dedupe:** read the destination file. If similar content already exists, mark `[DUP]`.

**Evidence:** each candidate must carry a commit hash or file:line reference from this session. Otherwise mark `[NO-EVIDENCE]`.

## Step 4 — Present batch

```
Found N candidate learnings:

[1] READY
    Lesson: <one-line summary>
    Destination: <type> → <path> (<section if applicable>)
    Evidence: <commit-hash> — <commit subject>     OR     <file:line>

[2] DUP
    Lesson: <one-line summary>
    Destination: <type> → <path> (already documented at <line/section>)
    Default: skip

[3] NO-EVIDENCE
    Lesson: <one-line summary>
    Reason: no commit / file:line ref in this session
    Default: skip

Reply with:
- "ok"                    → apply all defaults (READY → write, DUP/NO-EVIDENCE → skip)
- per-item override:
    "1 reject"            (drop a READY candidate)
    "2 dest=<type>"       (re-route to a different destination from the table)
    "3 force"             (write despite DUP or NO-EVIDENCE)
```

If `N == 0`, print `No non-obvious learnings detected.` and exit.

## Step 5 — Apply + commit

Wait for the user's reply. Apply overrides on top of defaults. For each candidate to be written, follow the matched row's `Format` instructions.

Commit per destination file using Conventional Commits.

Memory writes happen outside the repo — no commit.

If a write fails, log it, continue with the rest, and report what succeeded vs failed at the end.

## Edge cases

- **Long session (transcript >200k tokens):** scan only the most recent window; print a warning.
- **User rejects entire batch:** no commits, exit clean.
- **ADR conflict:** if a row's type is `adr`, grep existing ADR titles for keyword overlap before routing. If a likely conflict is detected, mark `[CONFLICT]` and skip auto-route.
- **Memory write fails:** skip that entry, continue with others.
- **Empty routing table:** print `CANONICAL.md has no valid routing rows.` and exit.
