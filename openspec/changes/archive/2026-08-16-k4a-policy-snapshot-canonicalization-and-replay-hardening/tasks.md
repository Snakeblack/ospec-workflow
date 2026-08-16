# Implementation Tasks: K4a PolicySnapshot Canonicalization and Replay Hardening

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Tasks

- [x] 1. PolicySnapshot schema and validator hardening
  - [x] 1.1 Add `pattern` and `minLength: 1` to `schemas/kernel/policy-snapshot/v1.schema.json`
  - [x] 1.2 Implement `minLength` and `pattern` support in `scripts/lib/kernel-schema-validator.js`
  - [x] 1.3 Refactor `computePolicySnapshotDigest` to pure canonical function without defaults
  - [x] 1.4 Add adversarial tests in `scripts/lib/execution-graph/policy-snapshot.test.js`

- [x] 2. Replay Engine fixture result contract hardening
  - [x] 2.1 Enforce explicit non-null `evidence` object for completed fixtures in `scripts/lib/execution-graph/replay-engine.js`
  - [x] 2.2 Reject non-zero `exit_code` claiming `completed` status as contradictory fail-closed
  - [x] 2.3 Add adversarial tests in `scripts/lib/execution-graph/replay-engine.test.js`

- [x] 3. Spec and documentation reconciliation
  - [x] 3.1 Update REQ-003 and REQ-006 in `openspec/specs/execution-graph-compiler/spec.md`
  - [x] 3.2 Update `docs/roadmaps/harness-evolution.md` (K4a done, K5 next-eligible, WorkOrder v2)
  - [x] 3.3 Update `docs/architecture/harness-evolution.md` (K4a done, K5 next-eligible)
  - [x] 3.4 Update regression assertions in `scripts/lib/roadmap-reconciliation.test.js` and `scripts/lib/k3-readiness-reconciliation.test.js`
