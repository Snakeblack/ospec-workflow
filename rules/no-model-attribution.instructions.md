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

No commit message and no pull request (title, body or comment) may credit an AI model or coding tool, in any form, casing or language: no `Co-Authored-By:` trailer naming one, no "Generated with/by", "Written by" or "Created by" line naming one, no model or vendor name as author, no 🤖 line or tool badge. Write plain Conventional Commits that say what changed and why, and keep PR bodies to summary, changes and test evidence.

Before committing or opening/editing a PR, rewrite any genuine attribution line that matches, case-insensitively (vendor names at word boundaries, so words like coherente or bombardeo never fire):

```
\b(co-authored-by|generated (with|by)|claude|anthropic|opus|sonnet|haiku|fable|gpt|chatgpt|openai|codex|copilot|gemini|bard|llama|mistral|cohere)\b|🤖
```
