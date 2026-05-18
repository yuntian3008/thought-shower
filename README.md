# thought-shower

A personal Claude Code plugin — commands, pipelines, and skills bundled together as one software engineer's workflow. The first piece is a 6-stage shipping pipeline that walks a feature branch from "I have an idea" to "ready to merge". More workflow pieces (commands, skills, pipelines) will land as the workflow evolves.

> Status: **v0.1.0 — early.** The shipping pipeline is designed end-to-end but not yet battle-tested. Expect rough edges on first run, and expect new pieces to arrive over time. Issues and PRs welcome.

## What's in the box today

- **Shipping pipeline** (`/start` + `/ship`) — six stages from blank branch to ready-to-merge. Detailed below.
- **`review-turn` skill** — shared review-feedback discipline used by every reviewer turn.
- **`visualize-as-html` skill** — produce a self-contained HTML artifact when a rendered page beats markdown.

```
1. Branch setup     2. Finishing          3. Codex review
4. CodeRabbit       5. Ready-to-merge     6. Merge handoff
```

Each pipeline stage has a clear exit condition. The plugin holds your hand only where discipline matters (no performative agreement on review feedback, verify-before-claim on every check) and gets out of the way otherwise.

## Install

This plugin is not yet on the official Claude Code marketplace. Install locally:

```bash
git clone https://github.com/yuntian3008/thought-shower.git
claude --plugin-dir ./thought-shower
```

Or symlink into your local plugins directory and use it across sessions:

```bash
git clone https://github.com/yuntian3008/thought-shower.git ~/.claude/plugins/local/thought-shower
# in any Claude Code session:
/reload-plugins
```

After install, verify the required dependencies (see below) are installed.

## Required dependencies

The plugin runs a preflight check on every command and fails fast if any are missing:

| Dep | Provides | Install |
| --- | --- | --- |
| [`superpowers`](https://github.com/anthropic-experimental/superpowers) | `brainstorming`, `brainstorming-lite`, `finishing-a-development-branch`, `receiving-code-review` | `/plugin install superpowers` |
| [`codex`](https://github.com/openai/codex) | `codex:codex-rescue` agent (Stage 3) | `/plugin install codex` |

`gh` must be authenticated (`gh auth status`). CodeRabbit must be installed on the target repo — Stage 4 hard-requires it and will time out at 30 min if no review posts.

## Configuration

No user settings to configure. The plugin is hands-off at Stage 6 — it prints a "ready to merge" summary and stops. Send notifications and merge on your own.

## Commands

| Command | Use |
| --- | --- |
| `/thought-shower:start [--lite] <description>` | Stage 1 only. Picks base branch, infers `<type>/<slug>`, creates the branch, invokes `superpowers:brainstorming` (or `brainstorming-lite` with `--lite`). |
| `/thought-shower:ship` | Stages 2–6 from the current branch. Idempotent — safe to re-run after pushing fixes. |
| `/thought-shower:thought-shower <description>` | Auto-chains `/start` then `/ship` in one session. For trivially small features only. |
| `/thought-shower:status` | Read-only state report: branch, PR, draft state, CR review state, threads, checks. Infers the next stage. |
| `/thought-shower:resume` | Detects current stage from git + GitHub, prints it, asks "continue?". |

## Shipping pipeline

The current centerpiece. Future versions may add other pipelines for other workflows.

| Stage | What happens | Owner |
| --- | --- | --- |
| 1. Branch setup | Pick base branch (default `dev`), infer type+slug from description, `git switch -c <type>/<slug> <base>`, invoke `superpowers:brainstorming(-lite)`. Refuses on dirty tree. | `/start` |
| 2. Finishing | `superpowers:finishing-a-development-branch`; auto-derives PR title+body from branch name + commits; creates draft PR. | `/ship` |
| 3. Codex turn | Dispatches `codex:codex-rescue` once → `review-turn` skill triages findings → user fixes → asks "re-run on new HEAD, or move to CR?" → on move-on, posts a summary comment on the PR documenting the round (findings, per-item decisions, fix commits) so CodeRabbit and human reviewers can see what Codex did. | `/ship` |
| 4. CodeRabbit turn | **Parent:** base-flip + CR-existence polls (Monitor + bash). **Subagent (`coderabbit-shepherd`):** thread-resolution loop, `review-turn` per thread, GraphQL resolve mutation. Returns `{status: 'all_resolved' \| 'head_changed' \| 'failed'}`. | `/ship` + `coderabbit-shepherd` |
| 5. Ready-to-merge | Verifies `state==OPEN`, `isDraft==false`, `baseRef==dev`, all checks green. | `/ship` |
| 6. Merge handoff | Prints a "ready to merge" summary (title, URL, status) and stops. Never auto-merges. Notifications and merge are the user's responsibility. | `/ship` |

## Skills

### `review-turn`

The plugin's core abstraction. Auto-invokes whenever any reviewer (Codex, CodeRabbit, manual) returns feedback. Wraps `superpowers:receiving-code-review` to enforce:

- Verify each finding against codebase reality before agreeing.
- No performative agreement (no "you're absolutely right!").
- Recommend per-item: `fix` / `decline` / `defer` / `clarify` / `other`.
- Present grouped by severity, collect user decisions, return them to the caller.

Reused by both the Codex turn (Stage 3) and the CodeRabbit subagent (Stage 4).

### `visualize-as-html`

General-purpose viz skill. Auto-invokes when the user asks to *visualize*, *compare*, *present*, *dashboard*, *sketch*, or *walk through* something that would be richer as a rendered page than as markdown. Produces a single self-contained `.html` file in `/tmp`, opens it in the default browser.

Patterns come from [ThariqS/html-effectiveness](https://github.com/ThariqS/html-effectiveness) — 20 curated artifact types (status reports, incident timelines, flowcharts, implementation plans, comparison sheets, etc.). The skill picks the closest pattern, optionally fetches the upstream example for structural reference, then generates a self-contained file (inline CSS + JS + SVG, no CDN, no trackers, system fonts only, dark-mode honest).

Independent of the `/start` → `/ship` pipeline — use it any time. Example asks: *"Visualize the deploy pipeline as a flowchart"*, *"Draft a Monday status update for this branch"*, *"Compare these three caching strategies side-by-side"*.

## Conventions baked in

- Auto-infer branch type from the description's first verb: `add`/`build` → `feat`, `fix` → `fix`, `remove`/`delete` → `chore`, `rename`/`extract` → `refactor`, `update docs` → `docs`. Default `feat`.
- Refuse to operate on a dirty working tree (both `/start` and `/ship`).
- On non-default branch + clean tree, asks "continue or fresh?".
- Strict equality everywhere (`===` in TypeScript / `[ "$x" = "y" ]` in shell).
- Codex runs once by default; re-run is an explicit prompt at end of turn.
- CodeRabbit is hard-required at Stage 4; 30-min timeout if no review posts.
- Stage 6 is hands-off: prints a summary and stops. Nothing is auto-merged. Notifications and merge are the user's responsibility.

## Layout

```
thought-shower/
├── .claude-plugin/plugin.json
├── README.md
├── commands/{start,ship,thought-shower,status,resume}.md
├── skills/review-turn/SKILL.md
├── skills/visualize-as-html/{SKILL.md, references/{patterns.md, template.html}}
├── agents/coderabbit-shepherd.md
├── scripts/{cr-fresh-review,cr-threads}.sh
└── references/pitfalls.md
```

Scripts are bundled assets — always invoked via `"${CLAUDE_PLUGIN_ROOT}/scripts/..."` so plugin updates don't break references.

## Pitfalls

The `coderabbit-shepherd` agent reads `references/pitfalls.md` on demand. Highlights:

- `gh api --jq` does NOT accept `--arg`; inline shell expansion only.
- Never `2>/dev/null` a poll command — silent failure is the worst class of bug here.
- Subagents cannot spawn other subagents; the `coderabbit-shepherd` agent has no `Agent` tool.
- Always `KillShell` every background poll before the agent returns.

## Why "thought-shower"?

British idiom for a brainstorm — the kind that washes ideas onto the page. The plugin started as a PR-shipping pipeline; the name now covers the broader personal-workflow toolkit built around it.

## Status & roadmap

v0.1.0 bundles the shipping pipeline and two skills. Likely directions for future versions:

- More software-engineering workflow pieces (commands, pipelines, skills) added as the personal workflow evolves.
- First-run verification of the shipping pipeline against a real PR.
- Optional `--skip-codex` flag on `/ship` for trivial PRs.
- Optional alternative reviewers (e.g., Gemini, internal LLM reviewers) plug into the `review-turn` skill.
- Pagination for inner comments inside CR threads (rare edge case, see `references/pitfalls.md` #9).

Issues and PRs welcome.
