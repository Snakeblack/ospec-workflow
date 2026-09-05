# ADR-001: Deterministic Signal Normalization and Fail-Closed Conflict Handling

- Status: proposed
- Change: live-routing-eligibility-and-risk-floors
- Date: 2026-09-05

## Context
Two competing naming schemes for classification signals (`ctx.classification` and `ctx["change.classification"]`) coexist in the runtime and test suites. When both signals are passed with conflicting values, resolving them arbitrarily creates silent security bypasses or unpredictable workflow selection.

## Decision
Normalize classification signals to a single resolved value when consistent, and fail closed immediately by throwing a deterministic `ClassificationConflictError` if both signals are present and carry conflicting values.

## Alternatives
- Arbitrary precedence (`change.classification` overrides `classification` or vice versa): rejected because silent overrides mask orchestrator integration defects and risk bypasses.
- Interactive user prompt during library dispatch: rejected because `route-dispatcher.js` is a pure function with no interactive I/O capabilities.

## Consequences
Deterministic fail-closed behavior guarantees that invalid execution contexts halt before dispatching any workflow phases. Callers must harmonize context signals before calling route selection. Easily reversible if unified upstream typing is introduced.
