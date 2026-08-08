# Apply Progress: K3 Cumulative Schema & Cryptographic Binding Remediation

## Task Completion Status

- [x] Task 1: Deep shape validation in `computeWorkOrderId` (`ownership` owner/mode, `budget` numeric fields, `dependencies` sha256 items).
- [x] Task 2: Deep shape validation in `computeWorkResultId` (`patch` string, `commands` items, `logs` items, `filesystem_inventory` items).
- [x] Task 3: Clean up `EXPECTED_KINDS` table so `Candidate` accepts `"candidate/v2"` and `WorkOrder` accepts `"work-order/v2"`.
- [x] Task 4: Update `validateIdentityKind` for `SourceSnapshot` and `WorkResult`: when `kind === undefined`, execute JSON Schema validation against `source-snapshot/v1` or `work-result/v1`. Fail closed if invalid.
- [x] Task 5: Cumulative JSON Schema validation in `validateWorkOrderBinding` (`SourceSnapshot` v1 and `WorkOrder` v2).
- [x] Task 6: Cumulative JSON Schema validation in `validateWorkResultBinding` (`WorkOrder` v2 and `WorkResult` v1).
- [x] Task 7: Comprehensive adversarial TDD unit tests covering all schema-binding bypasses, structural identity guards, and deep compute shape validations.
- [x] Task 8: Verification via `node scripts/check.js` (0 errors, 0 warnings, 58 tests passed).

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
| ---- | --------- | ----- | ---------- | --- | ----- | ----------- | -------- | ----------------- |
| Deep compute shape | `scripts/lib/execution-identities/index.test.js` | Unit | Test runner | Yes | Yes | Yes | Yes | Enforced deep shape checks on `ownership`, `budget`, `dependencies`, `commands`, `logs`, `filesystem_inventory` |
| Structural v1 guard | `scripts/lib/execution-identities/index.test.js` | Unit | Test runner | Yes | Yes | Yes | Yes | `validateIdentityKind` now runs schema validation for un-kinded v1 identity payloads |
| Cumulative binding gates | `scripts/lib/execution-identities/index.test.js` | Unit | Test runner | Yes | Yes | Yes | Yes | `validateWorkOrderBinding` and `validateWorkResultBinding` enforce schema validation before/during recompute |
