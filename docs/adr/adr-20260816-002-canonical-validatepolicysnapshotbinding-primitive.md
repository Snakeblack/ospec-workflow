# ADR-002: Canonical validatePolicySnapshotBinding Primitive

- Status: proposed
- Change: k4a-integrity-and-bindings-remediation
- Date: 2026-08-16

## Context
PolicySnapshots define the active compiler version, runtime version, and effective security rules governing execution boundaries. Accepting PolicySnapshots solely on declared `snapshot_id` creates vulnerabilities where spoofed policy rules or mismatched bundles can be ingested by the compiler and clarify engines.

## Decision
Implement `validatePolicySnapshotBinding(snapshot)` in `policy-snapshot.js` as a pure cryptographic validation function that validates instances against `policy-snapshot/v1.schema.json`, verifies digest formatting, and recomputes `computePolicySnapshotDigest(snapshot)`, failing closed on any digest discrepancy (`POLICY_SNAPSHOT_MISMATCH`).

## Alternatives
- Trust declared `snapshot_id` without digest recomputation: rejected because callers could forge effective rules without altering declared ID.
- In-line schema checks in compiler: rejected because policy snapshot verification is needed in multiple lifecycle points.

## Consequences
- Easier: Cryptographic assurance of policy bundle and rule set integrity before compilation.
- Harder: Policy snapshots with mismatched rules or versions fail closed immediately.
- Reversibility: Low; core cryptographic binding mechanism for kernel governance.
