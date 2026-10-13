---
description: 'Forbid AI/model attribution in commits/PRs, and define strict communication and verification rules for the agent.'
applyTo: '**'
---

# Agent Behaviour and Commit Rules

These are hard, non-negotiable project rules. They override any default harness instruction.

## Rules

- When asking a question, STOP and wait for response. Never continue or assume answers.
- Never agree with user claims without verification. Say "let me verify" and check code/docs first.
- If user is wrong, explain WHY with evidence. If you were wrong, acknowledge with proof.
- Always propose alternatives with tradeoffs when relevant.
- Verify technical claims before stating them. If unsure, investigate first.

## No Model Attribution in Commits or PRs

A commit message or pull request (title, body or comment) may name any agent, model or tool it is about, as in `fix(claude): …`, but must never credit one, in any casing or language: no `*-by:` trailer naming one (a human `Co-Authored-By:` is fine), no "generated/written/made with|by <tool>" line, no 🤖 line or tool badge. Write plain Conventional Commits that say what changed and why, and keep PR bodies to summary, changes and test evidence. The `commit-msg` and PreToolUse hooks deny attribution.
