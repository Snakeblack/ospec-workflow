# Apply Progress: K4a PolicySnapshot Canonicalization and Replay Hardening

## Progress Log

- Task 1: PolicySnapshot schema and validator hardening completed.
  - Implemented `minLength` and `pattern` evaluation in `scripts/lib/kernel-schema-validator.js`.
  - Refactored `computePolicySnapshotDigest` and `createPolicySnapshot` in `scripts/lib/execution-graph/policy-snapshot.js`.
  - Added adversarial tests for empty strings, whitespace, and malformed digests.

- Task 2: Replay Engine fixture result contract hardening completed.
  - Added explicit evidence object validation in `scripts/lib/execution-graph/replay-engine.js`.
  - Added contradiction check for non-zero exit code with completed status.
  - Added adversarial tests for missing evidence object and non-zero exit code in `scripts/lib/execution-graph/replay-engine.test.js`.

- Task 3: Spec and documentation reconciliation completed.
  - Updated REQ-003 and REQ-006 in `openspec/specs/execution-graph-compiler/spec.md`.
  - Reconciled `docs/roadmaps/harness-evolution.md` and `docs/architecture/harness-evolution.md`.
  - Reconciled regression tests in `roadmap-reconciliation.test.js` and `k3-readiness-reconciliation.test.js`.
