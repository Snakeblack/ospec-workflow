# Design: K3 Strict Schema & Binding Remediation

## Technical Approach

Ensure that cryptographic integrity and schema compliance are cumulative prerequisites for identity validation and binding verification across all K3 execution identity surfaces (`SourceSnapshot`, `WorkOrder`, `WorkResult`, `Candidate`). Eliminate all silent default fallbacks (`""`, `[]`, `{}`) in identity compute functions, require schema validation within binding gates, and align `v1` schema definitions with `validateIdentityKind` discrimination.

## Architecture Decisions

### Decision 1: Cumulative Schema Validation in Binding Gates (ADR-001)

**Choice**: `validateWorkOrderBinding` and `validateWorkResultBinding` validate payloads against their JSON Schemas before or during digest recomputation. Schema-invalid payloads return fail-closed errors (`INVALID_WORK_ORDER`, `INVALID_WORK_RESULT`, `INVALID_SOURCE_SNAPSHOT`) and fail binding validation regardless of digest self-consistency.  
**Alternatives considered**: Pure digest recompute without schema checking (allowed incomplete/manipulated structures to pass).  
**Rationale**: Cryptographic binding must assert both structural validity and payload identity.

### Decision 2: Strict Fail-Closed Compute Functions Without Silent Defaults (ADR-002)

**Choice**:  
- `computeSourceSnapshotId` requires `repository_id` (minLength 1) and validates `projection` is `"workspace" | "staged" | "commit"`.
- `computeWorkOrderId` requires `operation`, `objective`, `dependencies` (array), `ownership` (plain object), `allowed_paths` (array), `invariants` (array), `required_evidence` (array), and `budget` (plain object).
- `computeWorkResultId` requires `commands` (array), `logs` (array), `filesystem_inventory` (array), `patch` (string), and `exit_code` (integer).  
**Alternatives considered**: Replacing missing fields with `""`, `[]`, or `{}`.  
**Rationale**: Silent defaulting violates REQ-007 and allows invalid payloads to generate valid-looking digests.

### Decision 3: Coherent V1 Kind Discrimination in Schemas & Validator (ADR-003)

**Choice**: Update `source-snapshot/v1.schema.json` and `work-result/v1.schema.json` to explicitly allow optional property `kind` matching `"source-snapshot/v1"` and `"work-result/v1"` respectively.  
**Alternatives considered**: Removing `kind` requirement from `EXPECTED_KINDS` for v1.  
**Rationale**: Declaring optional `kind` in the v1 schemas allows payloads carrying `kind: "source-snapshot/v1"` or `"work-result/v1"` to pass schema validation without triggering `additionalProperties: false` errors.

### Decision 4: Immutable K1 Schema Baseline Inventory (ADR-004)

**Choice**: Refine `K1_SCHEMA_BASELINE` in `scripts/lib/lifecycle-kernel/k1-compat.js` to cover only immutable schema files and fixtures, excluding evolutionary registry manifests (`schemas/kernel/manifest.json` and `schemas/kernel/contract-claims.json`).  
**Alternatives considered**: Updating registry manifest digests in `K1_SCHEMA_BASELINE` on every release.  
**Rationale**: Registry manifests evolve as new schema versions (e.g. v2) are registered; pinning them under "frozen K1 baseline" confuses immutable contract pins with mutable catalog registries.

## Data Flow

```text
[Payload Input]
       │
       ▼
1. Validate Identity Kind (EXPECTED_KINDS positive table)
       │
       ▼
2. Validate Schema (JSON Schema validateInstance)
       │
       ▼
3. Validate Strict Fields (no missing required fields or silent defaults)
       │
       ▼
4. Recompute Digest (sha256Fingerprint domain-prefixed)
       │
       ▼
5. Assert Declared ID == Recomputed ID (Binding Pass / Relation Evaluation)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/execution-identities/index.js` | Modify | Strict compute checks, schema validation in bindings, kind handling |
| `schemas/kernel/source-snapshot/v1.schema.json` | Modify | Add optional `kind: "source-snapshot/v1"` property |
| `schemas/kernel/work-result/v1.schema.json` | Modify | Add optional `kind: "work-result/v1"` property |
| `scripts/lib/lifecycle-kernel/k1-compat.js` | Modify | Remove `manifest.json` and `contract-claims.json` from `K1_SCHEMA_BASELINE` |
| `scripts/lib/contract-checkers/k1-schema-compat.js` | Modify | Update K1 compatibility check to match refined baseline |
| `scripts/lib/execution-identities/index.test.js` | Modify | Add ~12 adversarial tests for strict shape & binding validation |

## Interfaces / Contracts

### Updated `validateWorkOrderBinding` Signature & Behavior
```js
function validateWorkOrderBinding(sourceSnapshot, workOrder) {
  // 1. Check snapshot & workOrder plain objects
  // 2. Validate sourceSnapshot schema / strict fields
  // 3. Validate workOrder schema / strict fields
  // 4. Recompute SourceSnapshotId & compare with declared source_snapshot_id
  // 5. Recompute WorkOrderId & compare with declared work_order_id
}
```

### Updated `validateWorkResultBinding` Signature & Behavior
```js
function validateWorkResultBinding(workOrder, workResult) {
  // 1. Check workOrder & workResult plain objects
  // 2. Validate workOrder schema / strict fields
  // 3. Validate workResult schema / strict fields
  // 4. Match work_order_id and source_snapshot_id between workOrder and workResult
  // 5. Recompute WorkOrderId & compare with expected
  // 6. Recompute WorkResultId & compare with declared work_result_id
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `computeSourceSnapshotId` missing `repository_id` or invalid `projection` | Assert throws fail-closed |
| Unit | `computeWorkOrderId` missing required fields (`dependencies`, `budget`, etc.) | Assert throws fail-closed |
| Unit | `computeWorkResultId` missing required arrays (`commands`, `logs`, `inventory`) | Assert throws fail-closed |
| Unit | `validateWorkOrderBinding` with schema-invalid WorkOrder carrying self-consistent digest | Assert returns `{ ok: false, reason_code: ... }` |
| Unit | `validateWorkResultBinding` with schema-invalid WorkResult carrying self-consistent digest | Assert returns `{ ok: false, reason_code: ... }` |
| Unit | `validateIdentityKind` for SourceSnapshot v1 and WorkResult v1 with optional `kind` | Assert passes both schema & kind check |
| Integration | Full test suite execution | `node scripts/check.js` |

## Migration / Rollout

No migration required. Non-breaking strictness enhancement for kernel identity contracts.
