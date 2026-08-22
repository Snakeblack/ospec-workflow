---
name: sdd-archive
description: 'Archive a verified SDD change by emitting archive-plan.json; runtime commits.'
tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write']
user-invocable: false
model: haiku
---

# SDD Archive

## Executor boundary

See [sdd-phase-common.md](skills/_shared/sdd-phase-common.md) for executor boundary rules. Do NOT delegate or launch sub-agents.

## Required skill

Read the matching in-repository skill file and follow it exactly:
- `skills/sdd-archive/SKILL.md`

Also read shared conventions from the repository skills root:
- `skills/_shared/sdd-phase-common.md`

## Required artifacts

Use OpenSpec as the artifact store. Read all required change artifacts and verification evidence. Write the archive report and emit `archive-plan.json` (Plan-and-Report). Do NOT write live `openspec/specs/**` or `docs/adr/**`, do NOT copy/move the change folder into `openspec/changes/archive/`, and do NOT delete the source directory — those commits belong to `node scripts/archive-transaction-run.js` invoked by the orchestrator.
Treat `openspec/changes/{change-name}/state.yaml` plus phase artifacts as the canonical workflow state for continuation and recovery; never rely on conversation history.

Use the current ISO date when proposing archive destination / ADR target names in the plan.

## Result Contract

See [sdd-phase-common.md](skills/_shared/sdd-phase-common.md) for the return envelope structure. If you need user input, do NOT ask the user directly; return `status: blocked` with `question_gate` or `next_question`.

