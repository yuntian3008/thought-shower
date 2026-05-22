# CLAUDE.md

This file guides Claude Code (claude.ai/code) extending this plugin.

## Your job here

You're helping evolve **thought-shower**, a personal Claude Code plugin that bundles one engineer's software-engineering workflow — slash commands, skills, subagents, and an MCP bridge — into one installable unit. Each new piece should make a real SWE task faster or more disciplined (less context-switching, fewer dropped checks, better review hygiene). If a proposed addition doesn't pay for its complexity along that axis, push back.

The current centerpiece is the **6-stage shipping pipeline** (`/start` → `/ship`). Future pieces will be more pipelines, more commands, and more skills covering other SWE chores.

## The Four Principles in Detail

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.


## Plugin layout

```
.claude-plugin/plugin.json   # Manifest + hard deps (superpowers, codex)
.mcp.json                    # MCP server registration (Telegram bridge)
commands/*.md                # Slash commands → /thought-shower:<name>
skills/*/SKILL.md            # Skills (auto- or user-invocable per frontmatter)
agents/*.md                  # Subagents (single-shot delegated tasks)
scripts/                     # Bundled assets — bash + Telegram bridge TS
mcp-server.ts                # MCP server entry (Bun) for Telegram bridge
.agents/rules/               # Canonical project rules (Bun, naming, security, …)
.claude/rules                # Symlink → ../.agents/rules
references/pitfalls.md       # Hard-won lessons (read by coderabbit-shepherd)
README.md                    # Public docs — kept in sync (see Maintenance)
```

## What's already shipping

### Shipping pipeline (6 stages)

| Command | Stage |
|---|---|
| `/thought-shower:start [--lite] <desc>` | 1. Branch setup + brainstorming |
| `/thought-shower:ship` | 2. Finishing → 3. Codex review → 4. CodeRabbit review → 5. Ready-to-merge → 6. Merge handoff |
| `/thought-shower:thought-shower <desc>` | Chains `/start` + `/ship` for trivially small features |
| `/thought-shower:status` | Read-only state report; infers next stage |
| `/thought-shower:resume` | Detects current stage, asks "continue?" |

### Skills

- `brainstorming-lite` — full brainstorming discipline minus written spec
- `prompt` — generate raw prompt material to `.prompts/`
- `learn` — extract session learnings, route via `CANONICAL.md`
- `review-turn` — shared review-feedback discipline (used by Codex + CodeRabbit turns)
- `visualize-as-html` — self-contained HTML artifact for visualizations
- `telegram` / `telegram-on` / `telegram-off` — Telegram bridge controls

### Telegram bridge (MCP server)

`mcp-server.ts` exposes MCP tools (`send_telegram`, `ask_telegram`, `telegram_init`, `telegram_daemon`, `telegram_seen`) backed by a long-running daemon (`scripts/telegram-bridge/daemon.ts`). State lives at `~/.claude/thought-shower/telegram-bridge/` — outside the plugin cache so it survives updates. Sessions are keyed by worktree basename.

### Subagent

`agents/coderabbit-shepherd.md` runs Stage 4's thread-resolution loop. Returns `{status: 'all_resolved' | 'head_changed' | 'failed'}` to the parent `/ship`.

## Extending the plugin — rules of the road

- **Hard-required deps.** New code may rely on `superpowers:*` and `codex:*` skills/agents (declared in `.claude-plugin/plugin.json`). If you need a NEW external plugin, add it to `dependencies` AND to the README's `Required dependencies` table — the pipeline preflight check fails fast on missing deps, and silent dep additions break installs.
- **Bundled-script paths use `${CLAUDE_PLUGIN_ROOT}`.** Never hard-code `~/.claude/plugins/cache/...`; updates change the path. Example: `"${CLAUDE_PLUGIN_ROOT}/scripts/cr-fresh-review.sh"`.
- **Idempotency by default.** `/ship` is safe to re-run; new long-running commands should follow the same pattern. Detect prior progress via git/GitHub state, not local flag files.
- **Refuse-on-dirty.** Any command that mutates branches/PRs runs `git status --porcelain` first and stops on output. Never auto-stash.
- **Strict equality only.** `===` in TypeScript, `[ "$x" = "y" ]` in shell. No loose `==`. Reject non-numeric output from poll commands explicitly.
- **No `2>/dev/null` on poll commands.** Silent failure is the worst class of bug; let `Monitor` see real errors. See `references/pitfalls.md`.
- **Subagents can't spawn subagents.** When designing a new subagent, don't grant it `Agent`; the parent must orchestrate.
- **Reuse `review-turn`** for every reviewer integration (Codex, CodeRabbit, future Gemini, etc.). It wraps `superpowers:receiving-code-review` with verify-each-finding and per-item recommendations — don't reinvent the review flow.
- **Project rules are canonical at `.agents/rules/`** (symlinked from `.claude/rules`). Edit canonical source. When adding a `.codex/rules` or `.cursor/rules`, symlink to the same canonical.
- **MCP state lives in `~/.claude/thought-shower/...`** not inside the plugin cache. Anything the user shouldn't lose on `/plugin update` goes there.

## Auto-maintain AGENTS.md and README.md

After modifying source files, update the matching docs in the SAME change:

- **AGENTS.md** — review the `AGENTS.md` in the same directory as the changed files.
  - If it exists: update content to reflect the change (new/renamed/removed files, changed responsibilities, updated patterns).
  - If it doesn't exist: create one describing the directory's purpose, key files, patterns, conventions, and relationships with other modules.
  - Keep concise — it's a guide for AI agents working in that directory.

- **README.md** — the public-facing source of truth. Update the matching section when changing:
  - `commands/*.md` (new/renamed/removed command, or signature change) → `Commands` table
  - `skills/*/SKILL.md` (new skill, description rewrite, removal) → `Skills` section
  - `agents/*.md` (added/removed) → `Shipping pipeline` table
  - `.claude-plugin/plugin.json` (deps changed) → `Required dependencies` table
  - Pipeline stage behavior in `commands/start.md` or `commands/ship.md` → `Shipping pipeline` table
  - Top-level file layout → `Layout` block

Don't ship a PR where AGENTS.md or README.md drifts from source.

## Run / dev

Runtime is **Bun** (not Node). No test or build scripts wired up yet — if you add tests, follow `.agents/rules/testing.md` (Bun mock gotchas in particular).

```bash
bun install
bun run start            # = bun run mcp-server.ts (MCP server on stdio, for debugging)
bunx tsc --noEmit        # type-check
```
