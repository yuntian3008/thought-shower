# HTML-Effectiveness Pattern Catalog

20 self-contained HTML artifact patterns curated by Thariq Shihipar. Each row is a use case + the upstream file URL. Fetch the raw file via `WebFetch` when you want to mimic structure.

**Repo:** <https://github.com/ThariqS/html-effectiveness>
**Raw URL prefix:** `https://raw.githubusercontent.com/ThariqS/html-effectiveness/main/`

## Exploration & Planning

| # | Pattern | Use when | File |
|---|---|---|---|
| 1 | Three code approaches | Comparing implementation options side-by-side with trade-offs | `01-exploration-code-approaches.html` |
| 2 | Visual design directions | Showing multiple layout/palette options for live reactive feedback | `02-exploration-visual-designs.html` |
| 16 | Implementation plan | Milestones + data-flow + inline mockups + risk + timeline | `16-implementation-plan.html` |

## Code Review & Understanding

| # | Pattern | Use when | File |
|---|---|---|---|
| 3 | Annotated pull request | Diff with margin notes, severity tags, jump links | `03-code-review-pr.html` |
| 4 | Module map | Package as boxes + arrows, highlighting hot paths and entry points | `04-code-understanding.html` |
| 17 | PR writeup for reviewers | Motivation + before/after + file-by-file tour with rationale | `17-pr-writeup.html` |

## Design

| # | Pattern | Use when | File |
|---|---|---|---|
| 5 | Living design system | Color / type / spacing tokens rendered as copyable swatches | `05-design-system.html` |
| 6 | Component variants | All sizes / states / intents of one component on one sheet | `06-component-variants.html` |

## Prototyping

| # | Pattern | Use when | File |
|---|---|---|---|
| 7 | Animation sandbox | Isolated transition with adjustable duration + easing sliders | `07-prototype-animation.html` |
| 8 | Clickable flow | Four linked screens with enough fidelity to test interaction | `08-prototype-interaction.html` |

## Decks

| # | Pattern | Use when | File |
|---|---|---|---|
| 9 | Arrow-key slide deck | Single-HTML presentation, arrow-key navigable | `09-slide-deck.html` |

## Illustrations & Diagrams

| # | Pattern | Use when | File |
|---|---|---|---|
| 10 | SVG figure sheet | Blog-post diagrams as inline vectors, tweakable + extractable | `10-svg-illustrations.html` |
| 13 | Annotated flowchart | Pipeline with clickable steps showing details, timings, failures | `13-flowchart-diagram.html` |

## Reports

| # | Pattern | Use when | File |
|---|---|---|---|
| 11 | Weekly status | Shipping updates, slipped items, charts — Monday-morning ready | `11-status-report.html` |
| 12 | Incident timeline | Post-mortem with minute-by-minute sequence, log excerpts, checklists | `12-incident-report.html` |

## Research & Learning

| # | Pattern | Use when | File |
|---|---|---|---|
| 14 | Feature explainer | TL;DR box, collapsible request paths, tabbed configs, FAQ | `14-research-feature-explainer.html` |
| 15 | Concept explainer | Interactive visualization + comparison table + hover-linked glossary | `15-research-concept-explainer.html` |

## Custom Editing Interfaces

| # | Pattern | Use when | File |
|---|---|---|---|
| 18 | Triage board | Drag many tickets across columns, export final ordering as markdown | `18-editor-triage-board.html` |
| 19 | Feature flag editor | Grouped toggles + dependency warnings + "copy diff" export | `19-editor-feature-flags.html` |
| 20 | Prompt tuner | Editable template with live variable rendering across sample inputs | `20-editor-prompt-tuner.html` |

## How to use this catalog

1. Match the user's ask to a row above. If two patterns fit, pick the simpler one.
2. To borrow structure from the upstream example:
   ```
   WebFetch("https://raw.githubusercontent.com/ThariqS/html-effectiveness/main/<file>",
            "Extract HTML structure, CSS approach, and inline JS patterns I should reuse.")
   ```
3. Fetch at most one example per session — they share a common visual language.
4. If none of the 20 patterns fit, compose. The catalog is a starting point, not a constraint.
