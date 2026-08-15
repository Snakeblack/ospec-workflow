# ADR-003: Authoritative Contract Obligation Manifest Reconciliation

- Status: proposed
- Change: k4a-remediation-v2-45-1
- Date: 2026-08-15

## Context
Passing an empty or sparse `obligations` parameter during `compileExecutionGraph` could bypass mandatory contract verification requirements, stripping MUST obligations without enforcing contract-level reconciliation.

## Decision
Treat `contract.obligations` as the immutable baseline authority. External obligation inputs are mapped and reconciled against contract obligations; passing `obligations: []` or omitting contract obligations cannot strip MUST obligations from the compiled graph manifest.

## Alternatives
- Unconditional caller obligation override: rejected because it allows callers to bypass governance and verification requirements arbitrarily.
- Purely advisory obligation tracking: rejected because missing MUST obligations must block compilation fail-closed.

## Consequences
- Easier: Guarantees full contract traceability and prevents accidental or malicious omission of verification steps.
- Harder: Compiling custom obligation slices requires explicit, approved deferrals for any unmapped MUST obligations.
- Reversibility: Low; core governance and contract integrity rule.
