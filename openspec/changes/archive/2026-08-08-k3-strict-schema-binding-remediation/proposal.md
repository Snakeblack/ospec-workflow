# Proposal: K3 Strict Schema & Binding Remediation

## Intent

Close the remaining K3 execution identity boundary gaps where cryptographic digest computation and binding validation accept schema-invalid payloads via silent default values, missing field coercions, or absent schema verification.

## Scope

### In Scope
- **SourceSnapshot Strictness**: `computeSourceSnapshotId` requires non-empty `repository_id` and restricts `projection` strictly to `"workspace"` | `"staged"` | `"commit"`.
- **WorkOrder Strictness**: `computeWorkOrderId` fails closed on missing required fields (`operation`, `objective`, `dependencies`, `ownership`, `allowed_paths`, `invariants`, `required_evidence`, `budget`) instead of filling silent defaults.
- **WorkResult Strictness**: `computeWorkResultId` requires `commands`, `logs`, and `filesystem_inventory` arrays, eliminating silent `[]` defaults per REQ-007.
- **Binding Schema Gate**: `validateWorkOrderBinding` and `validateWorkResultBinding` enforce schema validity alongside cryptographic digest recompute.
- **V1 Kind & Schema Coherence**: Align `validateIdentityKind` and `source-snapshot/v1` / `work-result/v1` schemas so schema-valid payloads pass identity discrimination without `additionalProperties: false` conflict.
- **K1 Baseline Cleanliness**: Refine `K1_SCHEMA_BASELINE` to pin immutable K1 schema files and fixtures, separating evolutionary registry manifests (`manifest.json`, `contract-claims.json`).

### Out of Scope
- K4 or future capability work.
- Modifying Candidate v2 freeze or relation logic (already GO).

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `execution-identities`: Enforce strict compute function validation, schema-valid binding gates, and coherent v1 kind discrimination.
- `kernel-contract-schemas`: Align v1 identity schemas with kind fields and refine `K1_SCHEMA_BASELINE` inventory.

## Approach

1. Update `computeSourceSnapshotId`, `computeWorkOrderId`, and `computeWorkResultId` in `scripts/lib/execution-identities/index.js` to reject missing required fields and unallowed enum values without default fallback.
2. Integrate schema validation into `validateWorkOrderBinding` and `validateWorkResultBinding`.
3. Update `schemas/kernel/source-snapshot/v1.schema.json` and `schemas/kernel/work-result/v1.schema.json` to allow optional/required `kind` property or adjust `validateIdentityKind` logic for v1 structures.
4. Refine `K1_SCHEMA_BASELINE` in `scripts/lib/lifecycle-kernel/k1-compat.js` to exclude mutable registry files (`manifest.json`, `contract-claims.json`).
5. Write ~10–12 adversarial TDD tests covering all strictness scenarios.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/execution-identities/index.js` | Modify | Strict compute*, schema-valid binding gates, v1 kind handling |
| `schemas/kernel/source-snapshot/v1.schema.json` | Modify | Declare optional `kind: "source-snapshot/v1"` |
| `schemas/kernel/work-result/v1.schema.json` | Modify | Declare optional `kind: "work-result/v1"` |
| `scripts/lib/lifecycle-kernel/k1-compat.js` | Modify | Refine `K1_SCHEMA_BASELINE` inventory |
| `scripts/lib/execution-identities/index.test.js` | Modify | Add adversarial tests for strict shape & binding validation |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing tests passing incomplete objects fail strict compute* | Low | Update existing test fixtures to be fully schema-valid |
| Schema load overhead in binding functions | Low | Lazy-cache schemas in `execution-identities/index.js` |

## Rollback Plan

Revert `openspec/changes/archive/` or git commit if strictness breaks valid identity flows.

## Dependencies

- None

## Success Criteria

- [ ] `computeSourceSnapshotId` rejects missing `repository_id` and invalid `projection`
- [ ] `computeWorkOrderId` rejects missing required WorkOrder fields without defaulting
- [ ] `computeWorkResultId` rejects missing `commands`, `logs`, or `filesystem_inventory`
- [ ] `validateWorkOrderBinding` and `validateWorkResultBinding` fail on schema-invalid inputs
- [ ] `validateIdentityKind` accepts valid `SourceSnapshot` v1 and `WorkResult` v1 payloads
- [ ] `K1_SCHEMA_BASELINE` pins immutable schema artifacts without registry drift
- [ ] All 2085+ tests pass (`node scripts/check.js`)
