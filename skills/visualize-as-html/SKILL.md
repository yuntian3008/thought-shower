---
name: visualize-as-html
description: Produces a self-contained .html artifact when the user asks to visualize, explain, present, compare, dashboard, prototype, or sketch out something that would be richer as a rendered page than as markdown. Trigger terms — visualize, render, show, dashboard, slides, deck, comparison, status report, incident timeline, design exploration, prototype, flowchart, module map, explainer, mockup, walkthrough. Pulls patterns from the html-effectiveness catalog (https://github.com/ThariqS/html-effectiveness).
---

# visualize-as-html

Generate a single self-contained HTML file, drop it in `/tmp`, open it in the browser.

## When to use

Pick this skill when the user's ask is *exploratory*, *comparative*, *presentational*, or *spatial* — anything where the layout itself carries information.

| User says | Pick this skill |
|---|---|
| "Compare these three approaches" | yes — pattern 1 (three code approaches) |
| "Show me a dashboard of …" | yes — pattern 11 (status report) or 18 (triage board) |
| "Walk me through how X works" | yes — pattern 14/15 (feature/concept explainer) |
| "Sketch a design for …" | yes — pattern 2 (visual design directions) |
| "Build me a flowchart of the deploy pipeline" | yes — pattern 13 (flowchart) |
| "Write a status update for Monday" | yes — pattern 11 |
| "Draft a post-mortem for last night" | yes — pattern 12 (incident timeline) |
| "Implementation plan for …" | yes — pattern 16 |
| "Fix this bug" / "Run this command" / "What does this code do (quick)" | NO — plain answer or code edit |

When in doubt: if the answer is more than ~3 short paragraphs AND has structure (comparison, timeline, hierarchy, dashboard, multi-step), prefer HTML.

## Workflow

```
1. Pick pattern  →  2. Fetch example (optional)  →  3. Generate HTML  →  4. Save  →  5. Open
```

### 1. Pick a pattern

Read [references/patterns.md](references/patterns.md) and pick the closest match from the 20 patterns. If two patterns fit, pick the simpler one. If none fit, compose — the patterns aren't exhaustive.

State the pick to the user in one line before generating: `Using pattern #11 (status report) for this.`

### 2. Fetch the upstream example (optional, recommended for first-use in session)

To mimic the catalog's voice and structure, pull the raw HTML of the closest pattern:

```bash
# Pattern URLs are listed in references/patterns.md
WebFetch("https://raw.githubusercontent.com/ThariqS/html-effectiveness/main/<NN-name>.html",
         "Extract the HTML structure, CSS approach, and any key inline JS patterns.")
```

Do this **at most once per session** — the patterns share a common look. Skip if you already fetched another pattern this session.

### 3. Generate the HTML

Start from [references/template.html](references/template.html) as a skeleton. Then add pattern-specific structure.

**Hard constraints — do not break:**

- **Single file.** All CSS in one `<style>` block. All JS in one `<script>` block. All SVG inline. No `<link href="...cdn...">`, no `<script src="...cdn...">`.
- **Offline.** The file must render correctly with the network unplugged.
- **System fonts only** — `font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;`. No `@import` from Google Fonts.
- **Semantic HTML** — `<header>`, `<main>`, `<section>`, `<article>`, `<nav>`, `<aside>`, `<footer>` where they cost nothing.
- **Width caps, not fixed widths.** `max-width: 72rem; margin: 0 auto;` for the page container. Body content reflows down to ~360px wide.
- **Dark-mode honest** — use `@media (prefers-color-scheme: dark)` to swap the palette. Don't ship a third-rate dark mode; if you can't, skip it and document why in an HTML comment.
- **No analytics, no trackers, no fingerprinting JS.** Ever.

**Style defaults** (override only with reason):

- Background `#fafafa` / dark `#0b0d10`
- Text `#1f2328` / dark `#e6edf3`
- Accent `#2563eb` / dark `#7aa2f7`
- Border `#e5e7eb` / dark `#30363d`
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px

### 4. Save to a temp file

```bash
TMPFILE=$(mktemp -t "viz-<short-slug>-XXXXXX.html")
# write file via Write tool: file_path = $TMPFILE
```

Use a `<short-slug>` derived from the topic (kebab-case, ≤24 chars): `viz-deploy-flowchart-AbCdEf.html`.

### 5. Open in the browser

```bash
case "$(uname -s)" in
  Darwin) open "$TMPFILE" ;;
  Linux)  xdg-open "$TMPFILE" ;;
  *)      echo "Open manually: $TMPFILE" ;;
esac
```

Then report to the user:

```
Visualization ready (pattern: <N — name>).
Path: /tmp/viz-<slug>-XXXXXX.html
Opened in your default browser.
```

## Re-runs

If the user asks for a tweak ("make the timeline column wider", "swap to dark palette only"), edit the existing file in place — don't regenerate from scratch. The path stays the same; the browser tab can be reloaded with cmd-R.

If the user asks for a fundamentally different view, generate a new file. Don't append to the old one.

## Anti-patterns

- ❌ Generating an HTML file for a 2-paragraph answer. Just answer in chat.
- ❌ Linking to a CDN "just for one icon." Inline the SVG.
- ❌ Hard-coding pixel widths for the main container.
- ❌ Using `<div>` soup when `<section>` / `<article>` would say the same thing.
- ❌ A "loading spinner" for static content.
- ❌ Trackers, analytics, telemetry, `gtag`, `_paq`, or any third-party script.

## References

- [patterns.md](references/patterns.md) — full catalog of the 20 upstream patterns + URLs.
- [template.html](references/template.html) — minimal self-contained skeleton.
- Upstream: <https://github.com/ThariqS/html-effectiveness>
