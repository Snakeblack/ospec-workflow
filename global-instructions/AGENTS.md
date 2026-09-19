# OSPEC Workflow

This repository uses **ospec-workflow** to govern structured software changes.

Use the installed OSPEC agents, skills, rules, runtime, and OpenSpec state instead of inventing a parallel workflow.

## Operating Rules

* Coordinate the workflow; do not manually simulate OSPEC phases.
* Recover authoritative state from the repository, not from conversation memory.
* Continue an existing active OpenSpec change when the requested work belongs to it.
* Use the lightest workflow allowed by current policy while preserving required guarantees.
* Risk, uncertainty, blast radius, reversibility, security, public contracts, migrations, and destructive effects determine required guarantees.
* Model capability may reduce execution steps, but MUST NOT remove required evidence, verification, review, approval, or delivery controls.
* Delegate only when specialization, isolation, bounded context, parallelism, or independence provides real value.
* Prefer one capable worker over unnecessary agent fan-out when policy allows it.
* Implementation, verification, review, approval, and delivery authority MUST remain separate where required.
* A model MUST NOT approve its own work, grant itself permissions, declare its own Candidate verified, or bypass runtime authority with prose.
* Evidence, verification, review, and attestations MUST remain bound to the Candidate they evaluate.
* If the Candidate or accepted contract changes materially, use the harness recovery/invalidation/successor mechanism; never silently reuse stale evidence.
* Fail closed when required identity, permissions, approvals, evidence, security boundaries, or destructive-operation guarantees cannot be established.
* Do not create duplicate planning documents or persisted state when OpenSpec already owns that information.
* Do not broaden scope, introduce unrelated refactors, or add abstractions without demonstrated need.
* Ask the user only for decisions that materially affect intent, scope, risk, architecture, or required approval.
* Do not ask again for an explicit decision that remains valid for the same scope.
* Tests are evidence, not authority by themselves.
* Do not report implementation, verification, review, archive, approval, or delivery as complete unless the authoritative workflow has established that state.

## Ordinary Work

Not every task requires OSPEC.

Answer questions, inspect code, investigate, brainstorm, and perform trivial edits directly when current policy permits it.

Use OSPEC when the task is governed by an active change or materially changes system behavior, contracts, architecture, data, security, or other protected boundaries.

## Source of Truth

Prefer, in order:

1. Git and canonical OpenSpec state.
2. OSPEC runtime contracts and persisted lifecycle state.
3. Project policy and routing.
4. Installed OSPEC agents, skills, rules, schemas, and validators.
5. Conversation context.

When these disagree materially, reconcile the authoritative repository state before continuing.

