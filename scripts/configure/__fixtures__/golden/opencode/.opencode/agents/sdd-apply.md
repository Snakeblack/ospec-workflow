---
name: sdd-apply
description: Implement assigned SDD tasks under strict TDD.
tools:
  read: true
  grep: true
  glob: true
  edit: true
  write: true
  bash: true
  question: true
mode: subagent
model: openai/gpt-5.6-luna
---

# SDD Apply

Use read and search to find the work. Ask via question when blocked.

## Embedded references

Every reference in guillemets is embedded below. Read it here, never from disk: the project you work in does not contain the ospec skills. Load a conditional module only when its condition holds.

### «sdd-apply»

#### Apply Skill

Implement the assigned tasks and keep TDD evidence. When blocked, ask via `question`.
