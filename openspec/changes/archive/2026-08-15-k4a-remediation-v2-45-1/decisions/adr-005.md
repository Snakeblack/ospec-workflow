# ADR-005: Cryptographic Binding of `policy_snapshot_id` to ExecutionGraph and GraphId

- Status: proposed
- Change: k4a-remediation-v2-45-1
- Date: 2026-08-15

## Context
`PolicySnapshot` captures the compiler, classifier, runtime versions, and effective rules used during compilation. Omitting `policy_snapshot_id` from the `ExecutionGraph` schema and `computeGraphId()` preimage prevented cryptographic verification of policy provenance.

## Decision
Require `policy_snapshot_id` in `execution-graph/v1.schema.json` matching `^sha256:[a-f0-9]{64}$` and include `policy_snapshot_id` in the canonical domain preimage of `computeGraphId()`.

## Alternatives
- Implicit policy bundle digest only: rejected because identical policy rules compiled with different compiler/classifier versions would produce identical GraphIds.
- Optional policy snapshot property: rejected because all graph instances must carry deterministic policy provenance.

## Consequences
- Easier: Guarantees end-to-end cryptographic traceability of policy rules and component versions into graph identity.
- Harder: Altering policy compiler/classifier versions or effective rules invalidates previous GraphIds deterministically.
- Reversibility: Low; core cryptographic preimage contract.
