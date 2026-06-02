# OpenSpec State Source of Truth Enforcement

## Scope

TASK 8 enforces filesystem-based OpenSpec state as the workflow source of truth across SDD orchestration and phase contracts.

## Enforced Rules

- OpenSpec artifacts on disk are authoritative workflow state in persisted mode.
- Continuation and recovery must use `openspec/changes/{change-name}/state.yaml` plus phase artifacts.
- Conversation history and chat memory are not authoritative when persisted artifacts exist.
- Orchestrator launches must pass artifact paths instead of inlining full artifact bodies.
- Persisted phase contracts must follow shared persistence rules that include `state.yaml` read-merge-update.

## Canonical Paths

- `openspec/config.yaml`
- `openspec/changes/{change-name}/state.yaml`
- `openspec/changes/{change-name}/proposal.md`
- `openspec/changes/{change-name}/proposal-lite.md`
- `openspec/changes/{change-name}/design.md`
- `openspec/changes/{change-name}/tasks.md`
- `openspec/changes/{change-name}/apply-progress.md`
- `openspec/changes/{change-name}/verify-report.md`
- `openspec/changes/{change-name}/archive-report.md`
- `openspec/changes/{change-name}/specs/**/spec.md`

## Notes

- No `.vscode/context-summary.json` dependency was introduced.
- No plugin manifest changes were made.
- This task only updated SDD agents, SDD skills, and shared SDD guidance relevant to state continuity.
