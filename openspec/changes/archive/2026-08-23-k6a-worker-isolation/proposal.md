# Proposal: K6a — Worker Isolation and Work-Order Capsule

## Intent

Implement Block 6a (K6a) of the harness evolution roadmap (`docs/roadmaps/harness-evolution.md`, lines 900-954; `docs/architecture/harness-evolution.md`). K6a establishes the execution runtime primitives (`CreateWorkspace`, `MaterializeSourceSnapshot`, `ExecuteWorkOrder`, `CaptureWorkResult`, `ValidateAllowedPaths`, `RecoverInterruptedExecution`, `DisposeWorkspace`) for executing tasks in an isolated workspace/capsule bounded strictly by `allowed_paths`. It consumes the reference host `WorkerTransport` (K2a), captures raw unapproved execution outputs (`WorkResult`) bound to `WorkOrderId` / `SourceSnapshotId`, preserves interruption evidence with executable recovery, and strictly enforces the K3 identity boundary by forbidding the emission or assumption of `CandidateId`.

## Scope

### In Scope
- **Execution primitives**: Implementation and lifecycle management of `CreateWorkspace`, `MaterializeSourceSnapshot`, `ExecuteWorkOrder`, `CaptureWorkResult`, `ValidateAllowedPaths`, `RecoverInterruptedExecution`, and `DisposeWorkspace`.
- **Work-order capsule**: Construction of a minimal execution capsule derived from Execution Graph dependencies (from K4a) with a stable fingerprint without extraneous artifacts.
- **Filesystem containment**: Strict `allowed_paths` validation failing closed on any write, edit, or creation attempt outside declared paths.
- **Raw evidence and result binding**: Structured capture of `WorkResult` (patch/commit, commands, logs, exit code, filesystem inventory) bound cryptographically to `WorkOrderId` and `SourceSnapshotId`.
- **Host transport integration**: Consumption of `WorkerTransport` from the reference host adapter (`claude`) / Headless Conformance Host with explicit fallback when isolation capability is `partial` or `unavailable`.
- **Interruption and recovery**: Preservation of partial raw evidence during timeouts or process cancellation, producing an executable recovery state.
- **Identity boundary enforcement**: Fixtures and contract lint proving K6a emits `WorkResult`, never `CandidateId`.

### Out of Scope
- Repair shadow orchestration (deferred to K4b).
- Execution Graph compilation or Obligation Manifest generation (owned by K4a).
- Candidate freeze (`freezeCandidate`), candidate verification, review, attestation, or delivery authorization (owned by K3, K6b, K7, K8, K10).
- Side-by-side comparison of fixed vs shadow execution decisions (deferred to K4b).
- Modifying execution budgets or causal failure recovery taxonomy/accounting (owned by K5).
- Exposing any Repair, shadow, or compiler domain concepts in K6a public APIs.

## Capabilities

### New Capabilities
- `worker-isolation`: Execution primitives (`CreateWorkspace`, `MaterializeSourceSnapshot`, `ExecuteWorkOrder`, `CaptureWorkResult`, `ValidateAllowedPaths`, `RecoverInterruptedExecution`, `DisposeWorkspace`), minimal work-order capsule construction, allowed_paths containment enforcement, raw WorkResult capture bound to WorkOrderId/SourceSnapshotId, and isolation capability fallback.

### Modified Capabilities
- `kernel-contract-schemas`: Register versioned JSON schemas and fixtures for Workspace descriptors, Capsule definitions, WorkResult execution payloads, and containment violation descriptors, ensuring non-aliasing with Candidate schemas.
- `contract-lint`: Add lint checkers verifying that worker execution primitives do not emit or accept `CandidateId`, enforce capsule path containment rules, and validate allowed_paths restrictions.
- `lifecycle-model-conformance`: Promote worker execution primitives, path containment enforcement, interrupted recovery, and host isolation fallback semantics from opaque/deferred status to concrete enforceable model checks.

## Approach

1. **Workspace Lifecycle & Capsule Materialization**: Implement `CreateWorkspace`, `MaterializeSourceSnapshot`, and `DisposeWorkspace` in `scripts/lib/` to provision isolated execution directories, project `SourceSnapshot` contents (`workspace` | `staged` | `commit`), and ensure cleanup.
2. **Containment Validator**: Implement `ValidateAllowedPaths` to enforce path sandboxing against relative traversals, symlinks, and undeclared writes, failing closed upon any out-of-boundary file operation.
3. **Execution Engine & Host Transport**: Implement `ExecuteWorkOrder` consuming `WorkerTransport` from the reference host adapter (`claude`) and Headless Conformance Host. Implement explicit fallback handling when host isolation capability is `partial` or `unavailable`.
4. **Result Capture & Interruption Recovery**: Implement `CaptureWorkResult` packaging patches, executed commands, logs, exit codes, and filesystem inventory into canonical `WorkResult` objects bound to `WorkOrderId`/`SourceSnapshotId`. Implement `RecoverInterruptedExecution` to persist partial execution state on timeouts or aborts.
5. **Schemas, Lint & Model Conformance**: Register schemas in `schemas/kernel/`, add contract-lint checkers preventing `CandidateId` emissions, and expand lifecycle model tests to prove execution isolation invariants.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `schemas/kernel/` | Modified | Schemas and fixtures for workspace descriptors, capsule definitions, and containment violation payloads |
| `scripts/lib/` | New/Modified | Workspace lifecycle, capsule materialization, allowed_paths validator, worker executor, WorkResult capture, and recovery |
| `openspec/specs/worker-isolation/` | New | Specification for worker isolation, capsule semantics, execution primitives, and host transport binding |
| `openspec/specs/kernel-contract-schemas/` | Modified | Delta spec for workspace, capsule, and containment contract schemas |
| `openspec/specs/contract-lint/` | Modified | Delta spec for CandidateId non-emission and path containment lint rules |
| `openspec/specs/lifecycle-model-conformance/` | Modified | Delta spec for worker execution primitives, containment, and recovery model checks |
| `scripts/**/*.test.js` | New/Modified | Unit, integration, and conformance tests for isolation primitives, allowed_paths containment, host fallback, and CandidateId non-emission |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Worker escapes sandbox via symlinks or path traversal | Med | Enforce canonical path resolution and fail-closed preflight/postflight boundary checks in `ValidateAllowedPaths` |
| Host isolation capability is partial or unavailable | Med | Enforce explicit capability-state branching and documented fallback without silent promotion to enforced |
| Worker output misidentified as Candidate | Low | Enforce strict schema validation and contract-lint rules prohibiting `CandidateId` fields in K6a outputs |
| Execution interruption loses telemetry or partial diffs | Low | Capture execution logs and partial filesystem modifications incrementally into recovery descriptors |

## Rollback Plan

Revert the PR/commit implementing K6a. Because K6a introduces isolated execution primitives without modifying active fixed runtime routes, existing Authority Store state, or downstream shadow orchestration, reverting restores previous baseline execution capabilities without data loss.

## Dependencies

- Prerequisites: K4a (Execution Graph compiler & WorkOrder v2 shapes), K5 (Budgets & Failure Recovery), K2a (`WorkerTransport` / reference host adapter), and K3 (Execution identities & binding validation).

## Success Criteria

- [ ] Execution primitives (`CreateWorkspace`, `MaterializeSourceSnapshot`, `ExecuteWorkOrder`, `CaptureWorkResult`, `ValidateAllowedPaths`, `RecoverInterruptedExecution`, `DisposeWorkspace`) execute conformantly.
- [ ] Work-order capsule derives exclusively from declared graph dependencies with a deterministic fingerprint.
- [ ] `ValidateAllowedPaths` fails closed on any write, modification, or creation attempt outside declared `allowed_paths`.
- [ ] `CaptureWorkResult` captures patch, commands, logs, exit code, and filesystem inventory strictly bound to `WorkOrderId` and `SourceSnapshotId`.
- [ ] Fixtures and lint checkers strictly reject any emission or acceptance of `CandidateId` by K6a.
- [ ] Interrupted execution reliably preserves raw evidence and provides an executable recovery state.
- [ ] Explicit fallback handling is enforced when host isolation capability is `partial` or `unavailable`.
- [ ] Public APIs of K6a contain zero references to Repair, shadow orchestration, or graph compilation.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
