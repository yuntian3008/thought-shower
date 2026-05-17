---
name: review-turn
description: Use when receiving feedback from any code reviewer (Codex, CodeRabbit, manual reviewer) on a pull request to evaluate findings technically and present per-item recommendations to the user. Wraps superpowers:receiving-code-review with reviewer-aware framing. Auto-invoke whenever a reviewer's findings need to be triaged.
---

# Review Turn

A unified pattern for processing code-review feedback regardless of reviewer (Codex, CodeRabbit, human reviewer comment, or any future tool).

## When to invoke

- A reviewer just produced findings (text, JSON, or GraphQL nodes).
- The findings need triage — the user must decide per item what to do.
- The next action depends on per-item user decisions.

If the input is empty (no findings) or already-resolved, exit immediately and report `no items to triage`.

## Inputs (caller passes these)

- `reviewer`: a label like `"codex"`, `"coderabbit"`, `"manual"`. Used in the report header.
- `findings`: the raw output. May be free-form text (Codex) or structured (CR threads with `path`, `line`, `body`, `threadId`).
- (optional) `context`: PR number, HEAD SHA, base branch — used to phrase recommendations.

## The core pattern

```
1. PARSE the findings into atomic items: { id, file:line, severity, summary, body, link? }
2. APPLY superpowers:receiving-code-review discipline to each item:
   - VERIFY against codebase reality (does the file:line still exist? is the concern accurate?)
   - EVALUATE technical merit (is it a bug, a style preference, or a misunderstanding?)
   - DECIDE recommendation: fix | decline | defer | clarify
3. GROUP by severity (critical → high → medium → low → nit)
4. PRESENT to the user, per-item:
     [item N/M]  <severity>  <file:line>  <summary>
     Reviewer:       <body excerpt>
     Verified:       <yes|no — with detail>
     Recommendation: <fix|decline|defer|clarify> — <one-sentence reason>
   Then ask: "Decision? [fix | decline | defer | other (free text)]"
5. COLLECT decisions. Return them to the caller as { items: [{id, decision, replyText?}] }
```

## Discipline anchors (from superpowers:receiving-code-review)

Invoke the `Skill` tool to load `superpowers:receiving-code-review` and follow it. Highlights:

- **No performative agreement.** Never "you're absolutely right!" or "great point!". Acknowledge with technical content or push back with reasoning.
- **Verify before agreeing.** If the reviewer cites a line, read the file. If they cite a behavior, trace it. Don't accept on the reviewer's authority alone.
- **Push back when wrong.** If the recommendation is technically incorrect for this codebase, surface that in the recommendation field with reasoning. The user decides whether to argue with the reviewer.
- **One item at a time.** Don't batch decisions; the user may need to think.

## Recommendation values

| Value | Meaning | Caller's next step |
| --- | --- | --- |
| `fix` | The finding is valid; recommend changing the code | Caller waits for user to push commits |
| `decline` | The finding is wrong or doesn't apply | Caller composes a short decline reply (CR thread) or notes it (Codex) |
| `defer` | Valid but out of scope for this PR | Caller composes a "deferred to follow-up" reply |
| `clarify` | Findings are ambiguous; need reviewer to elaborate | Caller flags this — Codex won't elaborate; CR can be re-prompted via reply |
| `other` | User typed free-text reasoning | Caller uses the user's text verbatim as the reply |

## Reviewer-specific framing

### Codex (`reviewer: "codex"`)

- Findings come as free-form prose. Parse by severity headers (`### Critical`, `### High`, etc.). Strip Codex preamble.
- No threads to resolve — Codex output is one-shot. Decisions don't translate to GitHub mutations; they translate to user actions (push fix, ignore, etc.).
- After presenting all items, ask the user a single follow-up: "Push fixes for the 'fix' items, then return to /ship."

### CodeRabbit (`reviewer: "coderabbit"`)

- Findings come as thread nodes from the `cr-threads.sh` script. Each item has `threadId` for resolve/reply mutations.
- Filter out non-actionable items: outside-diff and "nitpick" items in the review body do NOT count as actionable. Only inline review-thread comments count.
- Outdated threads (`isOutdated: true`) get special treatment: surface to user with "OK to ignore? [yes/no]" — only resolve after explicit yes.
- Decisions DO translate to GitHub mutations. The caller (`coderabbit-shepherd` agent) posts replies + runs `resolveReviewThread`.

### Manual / other (`reviewer: "manual"` or unknown)

- Default: treat like CodeRabbit but skip auto-resolve. User handles resolution on GitHub.

## Output

Return to the caller:

```json
{
  "reviewer": "codex|coderabbit|...",
  "totalItems": <int>,
  "decisions": [
    { "id": "<item-id>", "decision": "fix|decline|defer|clarify|other", "replyText": "<optional>" }
  ],
  "needsHeadRecheck": <true if any decision is 'fix' AND reviewer is CR>
}
```

`needsHeadRecheck=true` tells the CR caller "wait for user push, then re-poll".

## Forbidden

- Auto-posting replies on behalf of the user without their explicit decision per item.
- Marking a thread resolved without either (a) user said `decline`/`defer`/`other`, or (b) user pushed a fix and 2 minutes elapsed.
- Skipping the verify step. Even on apparent nits — verify the file/line still exists.
