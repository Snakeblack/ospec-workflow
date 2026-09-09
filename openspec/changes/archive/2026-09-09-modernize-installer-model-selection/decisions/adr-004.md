# ADR-004: Immutable operation disposition and audited reconciliation successor

- Status: proposed
- Change: modernize-installer-model-selection
- Date: 2026-09-08

## Context

Six directed commands have pending records without valid completion blobs. Existing no-replay handling correctly blocks reuse, but Candidate-irrecoverable terminalization cannot represent this different failure. REQ-verify-lineage-015–018 and the persisted successor-reconciliation approval authorize a distinct continuation while preserving historical evidence and consumed budget.

## Decision

Keep each pending record and the affected lineage literally unchanged. Append one immutable non-reconcilable disposition per inconclusive operation and a validated audit with applicable approval references. Create a distinct snapshot-bound lineage with incremented generation and predecessor link, inheriting findings, recipes, scopes, observations and budgets without reset. Use a fresh journal manifest; persist and validate completions before any evaluation, with full finding/recipe coverage. Old journal evidence remains late and non-blocking.

## Alternatives

- Rewrite pending as completed or rerun it: fabricates evidence or duplicates uncertain execution.
- Reuse Candidate-irrecoverable terminalization: changes the predecessor and asserts an unrelated failure.
- Start ordinary discovery: resets frozen obligations and cannot preserve bounded verification continuity.

## Consequences

Persistence gains immutable disposition/audit/manifest references and exact transition reconciliation. A fresh successor can verify B or newly captured C without claiming old commands completed successfully. Readers must distinguish old evidence from active coverage and reject unsupported recovery state. Rollback after activation retains all records and history; it cannot reopen or replay predecessor operations.
