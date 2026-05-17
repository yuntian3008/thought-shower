# through-shower

A 6-stage pipeline plugin for shipping feature branches: base-branch setup → brainstorming → finishing → Codex review → CodeRabbit review → merge handoff. Personal-use plugin; wraps `superpowers` + `codex` + `send-slack-message`.

## Install

Symlink the source repo into Claude Code's local plugins directory:

```bash
ln -s ~/wp/plugins/through-shower ~/.claude/plugins/local/through-shower
```

Or test ad-hoc:

```bash
claude --plugin-dir ~/wp/plugins/through-shower
```

After install, run `/reload-plugins` inside Claude Code to pick up changes.

## Required dependencies

The plugin runs a preflight check on every command and fails fast if any are missing:

| Dep | What it provides |
| --- | --- |
| `superpowers` (skills: `brainstorming`, `brainstorming-lite`, `finishing-a-development-branch`, `receiving-code-review`) | Stage 1 design loop, Stage 2 PR creation, the technical-rigor frame for both review turns |
| `codex` (agent: `codex:codex-rescue`) | Stage 3 Codex review |
| `send-slack-message` (user-level skill) | Stage 6 Slack ping (optional path) |

`gh` must be authenticated. CodeRabbit must be installed on the target repo (Stage 4 hard-requires it).

## Pipeline

| Stage | What happens | Owner |
| --- | --- | --- |
| 1. Branch setup | Pick base branch, infer type+slug from description, `git switch -c <type>/<slug> <base>`, invoke `superpowers:brainstorming(-lite)` | `/start` |
| 2. Finishing | `superpowers:finishing-a-development-branch`; auto-derive PR title+body from branch+commits; create draft PR | `/ship` |
| 3. Codex turn | `codex:codex-rescue` once → `review-turn` skill → user fixes → ask "re-run on new HEAD?" | `/ship` |
| 4. CodeRabbit turn | Parent: base-flip + CR-existence polls (Monitor + bash). Subagent: thread loop, `review-turn` per thread, GraphQL resolve mutation. Returns `{status: 'all_resolved' \| 'head_changed' \| 'failed'}` | `/ship` + `coderabbit-shepherd` agent |
| 5. Ready-to-merge | Verify `state==OPEN`, `isDraft==false`, `baseRef==dev`, all checks green | `/ship` |
| 6. Merge handoff | Ask user: `[Slack ping Mike] [End]` | `/ship` |

## Commands

| Command | Use |
| --- | --- |
| `/through-shower:start [--lite] <description>` | Stage 1 only. `--lite` swaps to `brainstorming-lite`. |
| `/through-shower:ship` | Stages 2–6 from current branch. Idempotent — safe to re-run. |
| `/through-shower:through-shower <description>` | Auto-chains `/start` then `/ship` in one session. For trivially small features only. |
| `/through-shower:status` | Read-only report: branch, PR, draft state, CR review state, threads, checks. Inferred next stage. |
| `/through-shower:resume` | Detect stage → print → ask "continue?". |

## Conventions baked in

- Auto-infer branch type from description's first verb: `add`/`build`→`feat`, `fix`→`fix`, `remove`/`delete`/`cleanup`→`chore`, `rename`/`move`/`extract`→`refactor`, `update docs`→`docs`. Default `feat`.
- Default base branch: `dev` (asks first; offers alternatives).
- Refuse to operate on a dirty working tree.
- On non-default branch + clean tree, ask "continue or fresh?".
- Strict `===` / `[ "$x" = "y" ]` equality in all shell.
- Codex runs once by default; re-run is an explicit prompt at end of turn.
- Stage 4 hard-requires CodeRabbit. 30-min timeout if no review posts.
- Stage 6 is opt-in: nothing is auto-merged or auto-pinged without confirmation.

## Layout

```
through-shower/
├── .claude-plugin/plugin.json
├── README.md
├── commands/{start,ship,through-shower,status,resume}.md
├── skills/review-turn/SKILL.md
├── agents/coderabbit-shepherd.md
├── scripts/{cr-fresh-review,cr-threads}.sh
└── references/pitfalls.md
```

## Pitfalls

The agent reads `references/pitfalls.md` on demand. Highlights:

- `gh api --jq` does NOT accept `--arg`; inline shell expansion only.
- Never `2>/dev/null` a poll command — silent failure is the worst class of bug here.
- Subagents cannot spawn other subagents; the `coderabbit-shepherd` agent has no `Agent` tool.
- Always `KillShell` every background poll before the agent returns.

## Source

`~/wp/plugins/through-shower/` (personal git repo, not published).
