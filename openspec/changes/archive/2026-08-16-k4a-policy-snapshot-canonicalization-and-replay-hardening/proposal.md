# Proposal: K4a PolicySnapshot Canonicalization, Replay Fixture Hardening, and Documentation Reconciliation

## Intent
Definitively finalize and close initiative K4a (Execution Graph compiler and replay) by addressing the remaining edge cases identified during strict verification:
1. **PolicySnapshot Canonical Binding**: Guarantee pure deterministic digests with zero digest-level defaulting, enforcing `pattern: "^sha256:[a-f0-9]{64}$"` for `snapshot_id` and `policy_bundle_digest`, and `minLength: 1` for `compiler_version`, `classifier_version`, and `runtime_version` in schema and validator.
2. **Replay Fixture Contract Hardening**: Enforce explicit non-null `evidence` objects for completed fixture results and reject contradictory combinations (`exit_code !== 0` with `status: "completed"`).
3. **Canonical Spec Synchronization**: Synchronize REQ-003 and REQ-006 in `openspec/specs/execution-graph-compiler/spec.md`.
4. **Roadmap & Architecture Reconciliation**: Reconcile `docs/roadmaps/harness-evolution.md` (K4a status `done`, K5 status `next-eligible`, WorkOrder shape `v2` with deterministic compilation) and `docs/architecture/harness-evolution.md`.

## Scope
- Canonical `PolicySnapshot` schema and validator keyword support (`minLength`, `pattern`).
- Pure canonical `computePolicySnapshotDigest` and fail-closed `createPolicySnapshot`.
- Strict fixture result contract and exit code validation in `replay-engine.js`.
- Synchronized OpenSpec specification and architectural roadmap.
- Comprehensive adversarial test suites.

## Risks and Mitigations
- **Risk**: Incomplete fixtures passing replay silently.
  - **Mitigation**: Fail-closed rejection of missing/null evidence objects and exit code contradictions, generating reproducible counterexamples.
- **Risk**: Snapshot ID collisions or forgeability.
  - **Mitigation**: Pure digest computation over canonical resolved fields, rejecting empty/whitespace versions.
