# Proposal: K3 Cumulative Schema & Binding Remediation

**Change**: k3-cumulative-schema-binding-remediation  
**Classification**: high-risk  
**Intended Route**: standard  

## User Intent

Close the remaining cryptographic and contractual binding gaps in the K3 execution identities pipeline:
1. Enforce cumulative JSON Schema validation (`schema-valid ∧ kind/version-valid ∧ ID-recomputed == ID-declared`) within `validateWorkOrderBinding` and `validateWorkResultBinding`.
2. Eliminate the fail-open fallback in `validateIdentityKind`: when `kind` is `undefined` for `SourceSnapshot` or `WorkResult`, validate the payload against its v1 JSON Schema before returning `{ ok: true }`.
3. Deepen `computeWorkOrderId` (ownership `owner`/`mode`, budget fields, dependency SHA-256 format) and `computeWorkResultId` (patch string type, commands element structure, logs element structure, filesystem inventory element structure).
4. Clean up `EXPECTED_KINDS` in `validateIdentityKind` for `Candidate` (`"candidate/v2"`) and `WorkOrder` (`"work-order/v2"`).
5. Provide comprehensive adversarial TDD test coverage for schema-invalid binding bypasses, structural identity guards, and deep compute shape validations.

## Scope

### In Scope
- `scripts/lib/execution-identities/index.js`: Update `validateWorkOrderBinding`, `validateWorkResultBinding`, `validateIdentityKind`, `computeWorkOrderId`, `computeWorkResultId`.
- `scripts/lib/execution-identities/index.test.js`: Add adversarial test cases for schema-invalid WorkOrder v2 in binding, schema-invalid WorkResult in binding, empty payload in `validateIdentityKind`, and deep compute shape mismatches.
- `openspec/changes/k3-cumulative-schema-binding-remediation/`: Create proposal, specs, design, ADRs, tasks, apply-progress, verify-report, and archive-plan.

### Out of Scope
- Architectural changes to identity types (`SourceSnapshotId`, `WorkOrderId`, `WorkResultId`, `CandidateId`).
- Changes to candidate freeze pipeline (`freezeCandidate`, `evaluateCandidateRelation`).

## Capabilities & Impacted Domains

- `execution-identities`: Identity compute functions, binding validators, kind discriminator.
- `kernel-contract-schemas`: Schema validation integration.

## Approach & Key Architecture Decisions

1. **Shared Schema Validator in Identity Module**: Use existing schema validator (`validateSchemaById` or `validateInstance`) within `execution-identities/index.js` to perform schema checks during binding validation.
2. **Cumulative Binding Gate Execution**:
   - `validateWorkOrderBinding(sourceSnapshot, workOrder)`: Validate `sourceSnapshot` against `source-snapshot/v1`, validate `workOrder` against `work-order/v2`, recompute `computeSourceSnapshotId(sourceSnapshot)` and `computeWorkOrderId(workOrder)`, and compare against declared IDs.
   - `validateWorkResultBinding(workOrder, workResult)`: Validate `workOrder` against `work-order/v2`, validate `workResult` against `work-result/v1`, recompute `computeWorkOrderId(workOrder)` and `computeWorkResultId(workResult)`, and compare against declared IDs.
3. **Strict Structural V1 Identity Guard**:
   - `validateIdentityKind(payload, expectedKind)`: When `kind === undefined` for `SourceSnapshot` or `WorkResult`, execute JSON Schema validation against `source-snapshot/v1` or `work-result/v1`. Fail closed if schema validation fails.
4. **Deep Compute Shape Validation**:
   - `computeWorkOrderId`: Validate `ownership` (`owner`, `mode`), `budget` (`model_turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines`), and `dependencies` items format (`sha256:<64 hex>`).
   - `computeWorkResultId`: Validate `patch` string type, `commands` items (`command`, `exit_code`, `duration_ms`), `logs` items (`stream`, `content`), `filesystem_inventory` items (`path`, `sha256`, `mode`).

## Risks & Rollback Plan

- **Risk**: Existing test fixtures in unit tests might be missing deep properties required by schemas.
  - **Mitigation**: Update test fixtures in `index.test.js` to carry all schema-required properties.
- **Rollback Plan**: Single git commit rollback (`git revert`) if issues arise.

---

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b fix/k3-cumulative-schema-binding-remediation main`).
