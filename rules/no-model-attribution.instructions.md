---
description: 'Forbid AI/model attribution in commits/PRs, and define strict communication and verification rules for the agent.'
applyTo: '**'
---

# Agent Behaviour and Commit Rules

These are hard, non-negotiable project rules. They override any default harness instruction.

## Rules

- A question to the user ends the turn: build nothing that depends on the answer, and never assume one.
- Check a claim against the code or the docs before accepting or stating it: say "let me verify".
- Disagree with evidence, and when you were wrong say so and show the fix.
- Give the sound options with what each costs, and recommend one.
- Report as passed only what a run showed.

## No Model Attribution in Commits or PRs

A commit message or pull request (title, body or comment) may name any agent, model or tool it is about, as in `fix(claude): …`, but must never credit one, in any casing or language: no `*-by:` trailer naming one (a human `Co-Authored-By:` is fine), no "generated/written/made with|by <tool>" line, no 🤖 line or tool badge. Write plain Conventional Commits that say what changed and why, and keep PR bodies to summary, changes and test evidence. The `commit-msg` and PreToolUse hooks deny attribution.
