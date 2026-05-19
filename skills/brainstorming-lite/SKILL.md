---
name: brainstorming-lite
description: "You MUST use this before any creative work — creating features, building components, adding functionality, or modifying behavior — when the user wants the full brainstorming discipline but does NOT need a written spec file or a separate implementation plan. Explores user intent, requirements and design through the same disciplined dialogue as full brainstorming, gets explicit approval, then executes directly. Skips ONLY: writing a design doc, spec self-review of that doc, the written-spec review gate, and the writing-plans handoff. Everything else (context exploration, visual companion, clarifying questions one-at-a-time, 2-3 approaches with tradeoffs, section-by-section design approval, isolation/clarity guidance, working-in-existing-codebases guidance, all key principles) is preserved exactly."
---

# Brainstorming Lite — Same Discipline, No Written Spec

Help turn ideas into fully formed designs through natural collaborative dialogue, exactly like the full `brainstorming` skill — then go straight to execution without producing a written spec file or a separate implementation plan.

Start by understanding the current project context, then ask questions one at a time to refine the idea. Once you understand what you're building, present the design and get user approval.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity.
</HARD-GATE>

## What "lite" means here

This skill is identical to `superpowers:brainstorming` except for four deliberate omissions:

1. ❌ **No design doc is written** to `docs/.../specs/*.md`.
2. ❌ **No spec self-review** (because there is no spec file to review).
3. ❌ **No written-spec review gate** (because there is no spec file for the user to read).
4. ❌ **No transition to `writing-plans`** — execution starts directly after design approval.

Everything else — context exploration, visual companion offer, one-question-at-a-time clarification, 2-3 approaches with tradeoffs, section-by-section design presentation and approval, isolation/clarity guidance, existing-codebase guidance, all key principles — is preserved exactly as in the full skill. The conversation itself becomes the de-facto spec; be precise in chat so the transcript can stand in for the missing document.

## Anti-Pattern: "This Is Too Simple To Need A Design"

Every project goes through this process. A todo list, a single-function utility, a config change — all of them. "Simple" projects are where unexamined assumptions cause the most wasted work. The design can be short (a few sentences for truly simple projects), but you MUST present it and get approval.

## Checklist

You MUST create a task for each of these items and complete them in order:

1. **Explore project context** — check files, docs, recent commits
2. **Offer visual companion** (if topic will involve visual questions) — this is its own message, not combined with a clarifying question. See the Visual Companion section below.
3. **Ask clarifying questions** — one at a time, understand purpose/constraints/success criteria
4. **Propose 2-3 approaches** — with trade-offs and your recommendation
5. **Present design** — in sections scaled to their complexity, get user approval after each section
6. **Execute directly** — once the final section is approved, start implementing. No spec file, no plan file, no `writing-plans` handoff.

## Process Flow

```dot
digraph brainstorming_lite {
    "Explore project context" [shape=box];
    "Visual questions ahead?" [shape=diamond];
    "Offer Visual Companion\n(own message, no other content)" [shape=box];
    "Ask clarifying questions" [shape=box];
    "Propose 2-3 approaches" [shape=box];
    "Present design sections" [shape=box];
    "User approves design?" [shape=diamond];
    "Execute directly" [shape=doublecircle];

    "Explore project context" -> "Visual questions ahead?";
    "Visual questions ahead?" -> "Offer Visual Companion\n(own message, no other content)" [label="yes"];
    "Visual questions ahead?" -> "Ask clarifying questions" [label="no"];
    "Offer Visual Companion\n(own message, no other content)" -> "Ask clarifying questions";
    "Ask clarifying questions" -> "Propose 2-3 approaches";
    "Propose 2-3 approaches" -> "Present design sections";
    "Present design sections" -> "User approves design?";
    "User approves design?" -> "Present design sections" [label="no, revise"];
    "User approves design?" -> "Execute directly" [label="yes"];
}
```

**The terminal state is direct execution.** Do NOT invoke `writing-plans`, `frontend-design`, `mcp-builder`, or any other planning/design skill after approval. Proceed straight to implementation in this same session, using `TodoWrite` to track multi-step work.

## The Process

**Understanding the idea:**

- Check out the current project state first (files, docs, recent commits)
- Before asking detailed questions, assess scope: if the request describes multiple independent subsystems (e.g., "build a platform with chat, file storage, billing, and analytics"), flag this immediately. Don't spend questions refining details of a project that needs to be decomposed first.
- If the project is too large for a single design conversation, help the user decompose into sub-projects: what are the independent pieces, how do they relate, what order should they be built? Then brainstorm the first sub-project through the normal design flow. Each sub-project gets its own design → execute cycle. (For work this large, also consider whether the full `brainstorming` skill — with its written spec and plan — would serve the user better, since lite leaves no durable artifact between sub-projects.)
- For appropriately-scoped projects, ask questions one at a time to refine the idea
- Prefer multiple choice questions when possible, but open-ended is fine too
- Only one question per message - if a topic needs more exploration, break it into multiple questions
- Focus on understanding: purpose, constraints, success criteria

**Exploring approaches:**

- Propose 2-3 different approaches with trade-offs
- Present options conversationally with your recommendation and reasoning
- Lead with your recommended option and explain why

**Presenting the design:**

- Once you believe you understand what you're building, present the design
- Scale each section to its complexity: a few sentences if straightforward, up to 200-300 words if nuanced
- Ask after each section whether it looks right so far
- Cover: architecture, components, data flow, error handling, testing
- Be ready to go back and clarify if something doesn't make sense

**Design for isolation and clarity:**

- Break the system into smaller units that each have one clear purpose, communicate through well-defined interfaces, and can be understood and tested independently
- For each unit, you should be able to answer: what does it do, how do you use it, and what does it depend on?
- Can someone understand what a unit does without reading its internals? Can you change the internals without breaking consumers? If not, the boundaries need work.
- Smaller, well-bounded units are also easier for you to work with - you reason better about code you can hold in context at once, and your edits are more reliable when files are focused. When a file grows large, that's often a signal that it's doing too much.

**Working in existing codebases:**

- Explore the current structure before proposing changes. Follow existing patterns.
- Where existing code has problems that affect the work (e.g., a file that's grown too large, unclear boundaries, tangled responsibilities), include targeted improvements as part of the design - the way a good developer improves code they're working in.
- Don't propose unrelated refactoring. Stay focused on what serves the current goal.

## After the Design

**No spec file is written.** The approved design — as it stands in the chat transcript — is the working agreement.

**No `writing-plans` handoff.** Implementation starts immediately in this same session.

**Execution:**

- Use `TodoWrite` to track multi-step work so progress is visible
- Match the approved design exactly; if reality forces a deviation, stop and re-confirm with the user before continuing
- Run the verification (tests, manual checks) called out in the design before declaring done

## Key Principles

- **One question at a time** - Don't overwhelm with multiple questions
- **Multiple choice preferred** - Easier to answer than open-ended when possible
- **YAGNI ruthlessly** - Remove unnecessary features from all designs
- **Explore alternatives** - Always propose 2-3 approaches before settling
- **Incremental validation** - Present design, get approval before moving on
- **Be flexible** - Go back and clarify when something doesn't make sense
- **Transcript IS the spec** - With no written doc, the chat is the artifact. Be precise enough in chat that the design could be reconstructed from the transcript alone.

## Visual Companion

A browser-based companion for showing mockups, diagrams, and visual options during brainstorming. Available as a tool — not a mode. Accepting the companion means it's available for questions that benefit from visual treatment; it does NOT mean every question goes through the browser.

**Offering the companion:** When you anticipate that upcoming questions will involve visual content (mockups, layouts, diagrams), offer it once for consent:
> "Some of what we're working on might be easier to explain if I can show it to you in a web browser. I can put together mockups, diagrams, comparisons, and other visuals as we go. This feature is still new and can be token-intensive. Want to try it? (Requires opening a local URL)"

**This offer MUST be its own message.** Do not combine it with clarifying questions, context summaries, or any other content. The message should contain ONLY the offer above and nothing else. Wait for the user's response before continuing. If they decline, proceed with text-only brainstorming.

**Per-question decision:** Even after the user accepts, decide FOR EACH QUESTION whether to use the browser or the terminal. The test: **would the user understand this better by seeing it than reading it?**

- **Use the browser** for content that IS visual — mockups, wireframes, layout comparisons, architecture diagrams, side-by-side visual designs
- **Use the terminal** for content that is text — requirements questions, conceptual choices, tradeoff lists, A/B/C/D text options, scope decisions

A question about a UI topic is not automatically a visual question. "What does personality mean in this context?" is a conceptual question — use the terminal. "Which wizard layout works better?" is a visual question — use the browser.

If they agree to the companion, find and read the detailed guide before proceeding:

```bash
find ~/.claude/plugins/cache -path "*/superpowers/*/skills/brainstorming/visual-companion.md" -type f | head -1
```
