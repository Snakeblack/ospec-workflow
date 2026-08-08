# Technical Design: K3 Cumulative Schema & Binding Remediation

**Change**: k3-cumulative-schema-binding-remediation  

## Context & Problem Statement

In `v2.42.2`, identity digest functions and kind discriminators were strengthened, but two critical security and consistency gaps remained:
1. `validateWorkOrderBinding` and `validateWorkResultBinding` recomputed digests and verified declared IDs against computed IDs, but did not execute JSON Schema validation (`validateSchemaById`). Consequently, a WorkOrder v2 missing `status`, or carrying invalid `ownership`/`budget` objects, could pass `validateWorkOrderBinding` if its declared `work_order_id` matched `computeWorkOrderId`.
2. `validateIdentityKind` permitted `SourceSnapshot` and `WorkResult` payloads with `kind === undefined` without validating the payload against its v1 schema, allowing arbitrary objects like `{}` to pass `validateIdentityKind({}, "SourceSnapshot")` or `validateIdentityKind({}, "WorkResult")`.
3. `computeWorkOrderId` and `computeWorkResultId` checked top-level key presence without validating deep property shapes (e.g. `ownership.owner`/`mode`, `budget` fields, `dependencies` item format, `patch` string type, `commands`/`logs`/`filesystem_inventory` array element types).

## Proposed Architecture & Workflow

```
[ Binding Gate Request ]
         │
         ▼
 ┌─────────────────────────────┐
 │ 1. JSON Schema Validation   │  ── (Fail closed if schema-invalid)
 └─────────────┬───────────────┘
               │
               ▼
 ┌─────────────────────────────┐
 │ 2. Compute Canonical Digest │  ── (Fail closed if deep shape invalid)
 └─────────────┬───────────────┘
               │
               ▼
 ┌─────────────────────────────┐
 │ 3. Compare Declared vs      │  ── (Fail closed if ID mismatch)
 │    Recomputed Digest        │
 └─────────────┬───────────────┘
               │
               ▼
      [ ok: true ]
```

### Key Components & Data Flow

1. **`validateWorkOrderBinding(sourceSnapshot, workOrder)`**:
   - `validateSchemaById(sourceSnapshot, "ospec://schemas/kernel/source-snapshot/v1")` -> fail closed if invalid.
   - `validateSchemaById(workOrder, "ospec://schemas/kernel/work-order/v2")` -> fail closed if invalid.
   - `computeSourceSnapshotId(sourceSnapshot)` -> fail closed if invalid or throws.
   - `computeWorkOrderId(workOrder)` -> fail closed if invalid or throws.
   - Compare `declaredSourceSnapshotId === computedSourceSnapshotId` and `declaredWorkOrderId === computedWorkOrderId`. Return `{ ok: true }` if all match, else `{ ok: false, error: ... }`.

2. **`validateWorkResultBinding(workOrder, workResult)`**:
   - `validateSchemaById(workOrder, "ospec://schemas/kernel/work-order/v2")` -> fail closed if invalid.
   - `validateSchemaById(workResult, "ospec://schemas/kernel/work-result/v1")` -> fail closed if invalid.
   - `computeWorkOrderId(workOrder)` -> fail closed if invalid or throws.
   - `computeWorkResultId(workResult)` -> fail closed if invalid or throws.
   - Compare `declaredWorkOrderId === computedWorkOrderId` and `declaredWorkResultId === computedWorkResultId`. Return `{ ok: true }` if all match, else `{ ok: false, error: ... }`.

3. **`validateIdentityKind(payload, expectedKind)`**:
   - Closed `EXPECTED_KINDS` table: `Candidate` -> `"candidate/v2"`, `WorkOrder` -> `"work-order/v2"`.
   - For `SourceSnapshot` or `WorkResult`: if `kind === undefined`, invoke `validateSchemaById(payload, "ospec://schemas/kernel/source-snapshot/v1")` or `validateSchemaById(payload, "ospec://schemas/kernel/work-result/v1")`. Return `{ ok: true }` only if schema validation passes.

4. **Deep Compute Shape Validation**:
   - `computeWorkOrderId`:
     - `ownership`: require `typeof ownership.owner === "string"` and `typeof ownership.mode === "string"`.
     - `budget`: require `typeof model_turns === "number"`, `typeof patches === "number"`, `typeof commands === "number"`, `typeof wall_time_minutes === "number"`, `typeof changed_lines === "number"`.
     - `dependencies`: require array where every element matches `/^sha256:[a-f0-9]{64}$/i`.
   - `computeWorkResultId`:
     - `patch`: if defined, require `typeof patch === "string"`.
     - `commands`: require array where every item is object with `typeof command === "string"`, `typeof exit_code === "number"`, `typeof duration_ms === "number"`.
     - `logs`: require array where every item is object with `typeof stream === "string"` (`"stdout"`|`"stderr"`), `typeof content === "string"`.
     - `filesystem_inventory`: require array where every item is object with `typeof path === "string"`, `sha256` matching sha256 digest format, `mode` (string or number).

## ADR List

- `decisions/adr-001.md`: Mandatory JSON Schema Validation in Binding Gates
- `decisions/adr-002.md`: Structural Schema Validation for Un-kinded V1 Identity Payloads
- `decisions/adr-003.md`: Deep Property Shape Validation in Identity Compute Functions
