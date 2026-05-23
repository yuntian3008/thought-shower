# Canonical Homes

Where `/thought-shower:learn` routes session learnings in this repo.
Edit rows to customize routing. Remove a row to disable that destination.

| Type | Path | When | Format |
|---|---|---|---|
| gotchas | auto | Scope = a single folder or file (folder-specific quirk that only matters when working inside that folder) | Append `- YYYY-MM-DD: <lesson> (commit <short-hash>)` to nearest `<folder>/AGENTS.md ## Gotchas`. Create the `## Gotchas` section if missing. |
| memory | auto | Personal preference, cross-project insight, user correction, or workflow rule that should persist across sessions and projects | Write to the agent's built-in memory system (Claude Code auto-memory under `~/.claude/projects/<...>/memory/`). One file per memory; update `MEMORY.md` index. |
| rules | `.agents/rules/` | Cross-project codebase convention or coding rule (e.g. naming, security boundary, testing pattern, formatting) that applies everywhere in this repo | Append a bullet or new section to the matching topic file in `.agents/rules/` (e.g. `testing.md`, `naming-conventions.md`, `code-style.md`, `security.md`, `clean-code.md`). If no matching topic file exists, create one with a single `# <Topic>` header and the lesson. |
| pitfalls | `references/pitfalls.md` | Hard-won lesson with a clear symptom + root cause + fix, especially one a future reviewer (Codex / CodeRabbit / coderabbit-shepherd) would benefit from. Often involves tool quirks, polling bugs, silent failures, or non-obvious infrastructure traps | Append a new `## <N>. <Title>` section with `**Symptom:**`, `**Root cause:**`, `**Fix:**` paragraphs. Inline code samples allowed. Increment the section number from the existing highest. |
