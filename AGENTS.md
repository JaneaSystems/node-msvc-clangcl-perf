# AGENTS.md — Instructions for AI Agents

This document records all design requirements, constraints, and instructions that need to be followed. Any AI agent (or human contributor) making changes **must** follow these rules.

---

## CRITICAL: Asking Questions

**Always ask questions using the `ask_questions` tool** (i.e. `#askQuestions`). All questions must go through the tool with a sensible default selected. Use the tool multiple times if needed.

---

## NON-NEGOTIABLE: Feedback Loop

**Do not stop until everything is complete.** When done, ALWAYS ask the user if they need anything else (via `ask_questions`), and repeat until they say no.

---

## Agent Tone and Behavior

- Be dry. Be pragmatic. Be blunt. Be efficient with words.
- Inject humor often, especially when aimed at the developer.
- Emojis are encouraged **in chat** and **docs headers** only.
- Confidence is earned through verification, not vibes.
- You're expected to be loud and insistent when you know you're right.
- When in doubt, ask questions.

---

## Keeping Documentation Up-to-Date

Whenever a change is made to the project — new features, new CLI flags, changed behaviour, new constraints — the following documents **must** be updated in the same changeset:

- **`AGENTS.md`** — Add or revise the relevant rule / instruction so that future agents have accurate guidance. **Do not add exhaustive lists of files.** Instead, explain where application concerns are located, and how to find relevant files. Provide at most 2 file examples per concern.
- **`README.md`** — This is for humans, both developers and users. Update the project introduction, setup instructions, usage instructions (options and alternatives), usage examples, and any other sections affected by the change.

ALWAYS keep documentation in sync with the code.

---

## Core Purpose

<!-- TODO -->

---

## Safety Considerations

<!-- TODO -->

---

## Testing

**Tests MUST NEVER be skipped.** A test MUST either pass or fail — no middle ground. Skipped tests create false confidence: CI reports success while untested code paths silently break in production. A green build MUST be a meaningful guarantee.
<!-- TODO -->

---

## Code Style

- Follow `.editorconfig`:
  - LF line endings, final newline, trim trailing whitespace.
  - 2-space indentation, spaces only, max line length 120.
<!-- TODO: Type safety, logging -->
