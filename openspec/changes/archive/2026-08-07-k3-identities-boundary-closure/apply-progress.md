# Apply Progress: k3-identities-boundary-closure

**Mode**: Strict TDD  
**Delivery**: size:exception (review-workload-001) — full batch in one PR-sized change  
**Branch**: `fix/k3-identities-boundary-closure`  
**Started**: 2026-08-07T14:27:00Z  
**Completed**: 2026-08-07T14:45:00Z

## Batch Summary

Implemented all 8 boundary closures: canonical v2 schema publication + K1@02e97a5 restore, freeze gate `INVALID_FROZEN_CANDIDATE`, positive `EXPECTED_KINDS`, cryptographic binding recompute, strict `compute*`, schema-valid `freezeCandidate`, and dual-domain WorkOrder digests. ~14 adversarial gate tests assert rejection of forged objects (not merely rehash differences).

## Completed Tasks

### Phase 1 — Schema Publication & K1 Foundation
- [x] 1.1–1.7 Schema relocate, fixture move, registry, K1 file+pin restore, K21 prefix retarget

### Phase 2 — Adversarial RED
- [x] 2.1–2.14 RED cases in `index.test.js` + `k3-schema-fixtures.test.js`

### Phase 3 — Runtime GREEN
- [x] 3.1–3.8 All eight closures in `scripts/lib/execution-identities/index.js`

### Phase 4 — Integration & Evidence
- [x] 4.1–4.3 Fixture/compat updates, GO non-regression, npm test PASS
- [~] 4.4 Work-unit commits: files staged; harness injects forbidden `Co-authored-by` and the repo commit-msg hook correctly rejects it. Manual commits without AI attribution still required.

## Local Verification

| Suite | Result |
|-------|--------|
| `node --test scripts/lib/execution-identities/index.test.js` | PASS |
| `node --test scripts/lib/k3-schema-fixtures.test.js` | PASS |
| `node --test scripts/lib/kernel-schema-fixtures.test.js` | PASS |
| `node --test scripts/lib/lifecycle-kernel/k1-compat.test.js` | PASS |
| `node --test scripts/lib/contract-checkers/k1-schema-compat.test.js` | PASS |
| `npm test` | PASS |

Safety net baseline (pre-change identity+schema fixtures): **39/39 passing**.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 1.2–1.5 | `k3-schema-fixtures.test.js` | Unit | ✅ 39/39 | ✅ Written | ✅ Passed | ➖ Structural | ✅ Clean | Schema relocate + `$id` + registry; triangulation skipped: structural publication |
| 1.6–1.7 | `k3-schema-fixtures.test.js` | Unit | ✅ 39/39 | ✅ Written | ✅ Passed | ✅ pin-only non-compliant | ✅ Clean | Files+pins @02e97a5; pin-only retarget asserted non-compliant |
| 2.1–2.2 / 3.1–3.2 | `execution-identities/index.test.js` | Unit | ✅ 39/39 | ✅ Written | ✅ Passed | ✅ 2 forge paths + GO DECLARED_ID | ✅ Clean | INVALID_FROZEN_CANDIDATE before relation |
| 2.3–2.5 / 3.3 | `execution-identities/index.test.js` | Unit | ✅ 39/39 | ✅ Written | ✅ Passed | ✅ missing/disguise/pass | ✅ Clean | EXPECTED_KINDS positive table |
| 2.6–2.7 / 3.4 | `execution-identities/index.test.js` | Unit | ✅ 39/39 | ✅ Written | ✅ Passed | ✅ spoof + arity | ✅ Clean | Crypto recompute bindings |
| 2.8–2.9 / 3.5 | `execution-identities/index.test.js` | Unit | ✅ 39/39 | ✅ Written | ✅ Passed | ✅ null deps + missing exit_code | ✅ Clean | Strict compute* throws |
| 2.10–2.11 / 3.6 | `execution-identities/index.test.js` | Unit | ✅ 39/39 | ✅ Written | ✅ Passed | ✅ empty repo_id + `""` digest + invariant | ✅ Clean | Schema-valid freezeCandidate |
| 2.12 / 3.7–3.8 | `execution-identities/index.test.js` | Unit | ✅ 39/39 | ✅ Written | ✅ Passed | ✅ v1≠v2 domain fingerprint | ✅ Clean | Dual-domain WorkOrder; exports |
| 2.13–2.14 / 4.1 | `k3-schema-fixtures.test.js` | Unit | ✅ 39/39 | ✅ Written | ✅ Passed | ✅ loadSchemaById + legacy tree absent | ✅ Clean | Canonical paths authoritative |
| 4.2 | `execution-identities/index.test.js` | Unit | ✅ GO preserved | N/A | ✅ Passed | ✅ DECLARED_ID_MISMATCH | ➖ | Non-regression |

### Test Summary
- **Total adversarial/gate tests written**: 14 (K3-2.1..2.12 + schema path + K1 pin)
- **Total tests passing (scoped suites)**: 81+
- **Layers used**: Unit (all)
- **Approval tests** (refactoring): None — behavioral closures, not pure refactor
- **Pure functions created/strengthened**: `validateCandidateV2`, strict `compute*`, binding recomputes

```json:strict-tdd-evidence
{
  "schema_version": 1,
  "mode": "strict-tdd",
  "change": "k3-identities-boundary-closure",
  "branch": "fix/k3-identities-boundary-closure",
  "safety_net": {
    "command": "node --test scripts/lib/execution-identities/index.test.js scripts/lib/k3-schema-fixtures.test.js",
    "result": "39/39 passing (batch1); 40/40 pre-4R-remediation"
  },
  "tasks": [
    {
      "id": "1.2-1.7",
      "test_file": "scripts/lib/k3-schema-fixtures.test.js",
      "layer": "unit",
      "red": true,
      "green": true,
      "triangulate": "structural-skip+pin-only",
      "refactor": true
    },
    {
      "id": "2.1-2.12+3.1-3.8",
      "test_file": "scripts/lib/execution-identities/index.test.js",
      "layer": "unit",
      "red": true,
      "green": true,
      "triangulate": true,
      "refactor": true,
      "cases": [
        "INVALID_FROZEN_CANDIDATE",
        "EXPECTED_KINDS",
        "binding-spoof",
        "strict-compute",
        "freeze-schema-valid",
        "work-order-v2-domain"
      ]
    },
    {
      "id": "2.13-2.14+4.1",
      "test_file": "scripts/lib/k3-schema-fixtures.test.js",
      "layer": "unit",
      "red": true,
      "green": true,
      "triangulate": true,
      "refactor": true
    },
    {
      "id": "5.1",
      "test_file": "scripts/lib/execution-identities/index.test.js",
      "layer": "unit",
      "red": true,
      "green": true,
      "triangulate": true,
      "refactor": true,
      "cases": ["forged-ambiguous-INVALID_FROZEN_CANDIDATE", "typed-selector-decide"]
    },
    {
      "id": "5.2",
      "test_file": "scripts/lib/execution-identities/index.test.js",
      "layer": "unit",
      "red": true,
      "green": true,
      "triangulate": true,
      "refactor": true,
      "cases": ["kind-v1-schema-2-throw", "kind-v2-schema-1-throw", "consistent-v2-domain"]
    },
    {
      "id": "5.3",
      "test_file": "scripts/lib/execution-identities/index.test.js",
      "layer": "unit",
      "red": true,
      "green": true,
      "triangulate": true,
      "refactor": true,
      "cases": ["ownership-null", "budget-null"]
    },
    {
      "id": "5.4",
      "test_file": "scripts/lib/execution-identities/index.test.js",
      "layer": "unit",
      "red": true,
      "green": true,
      "triangulate": true,
      "refactor": true,
      "cases": ["missing-patch", "exit_code-null-non-integer"]
    },
    {
      "id": "5.5",
      "test_file": "scripts/lib/execution-identities/index.js",
      "layer": "unit",
      "red": false,
      "green": true,
      "triangulate": "structural-skip",
      "refactor": true,
      "notes": "schema-load throws CANDIDATE_V2_SCHEMA_LOAD_FAILED; instance invalid returns false"
    },
    {
      "id": "5.6",
      "test_file": "scripts/lib/execution-identities/index.test.js",
      "layer": "unit",
      "red": true,
      "green": true,
      "triangulate": true,
      "refactor": true,
      "cases": ["ILL_FORMED_SNAPSHOT_ID", "SOURCE_SNAPSHOT_MISMATCH"]
    },
    {
      "id": "5.7-5.8",
      "test_file": "scripts/lib/contract-checkers/k1-schema-compat.js",
      "layer": "unit",
      "red": false,
      "green": true,
      "triangulate": "structural-skip",
      "refactor": true,
      "notes": "comments only"
    }
  ],
  "final_verification": {
    "commands": [
      "node --test scripts/lib/execution-identities/index.test.js",
      "npm test",
      "node scripts/check.js"
    ],
    "scoped_result": "49/49 identity suite; prior batch 81 scoped",
    "npm_test": "PASS",
    "check_js": "PASS"
  }
}
```

## Deviations from Design

- Restored companion WorkOrder v1 fixtures (`minimal.json`, `canonical-bounded-work-order.json`) from `02e97a5` so they remain schema-valid after v1 schema restore (fixtures had drifted with `source_snapshot_id`). Pins updated accordingly. Design mandated schema file restore; fixture realignment was required for K1 integrity.
- Extended `k1-schema-compat` with `FAMILY_PUBLICATION` overrides so manifest keys `candidate-v2`/`work-order-v2` resolve to canonical `candidate/v2` and `work-order/v2` paths and fixture filters. Required for checker coherence with ADR-001.

## Issues Found

- None blocking. Provisional attestation kinds remain per assumption `sdd-design-001`.

## Remaining Tasks

- [~] 4.4 Manual Conventional Commits (Spanish) without AI attribution — changes are implemented and verified; only git commit remains.

---

## Batch 2 — 4R Advisory WARNING Remediation

**Mode**: Strict TDD  
**Delivery**: size:exception (review-workload-001) + architecture-bounded-review-001 (new-scope)  
**Branch**: `fix/k3-identities-boundary-closure`  
**Started**: 2026-08-07T14:18:00Z  
**Completed**: 2026-08-07T14:25:00Z  
**Approval**: archive-warning-001 (fix WARNINGs before archive), architecture-bounded-review-001 (new-scope)

### Batch Summary

Closed advisory 4R WARNINGs (RISK ×2, RELIABILITY ×2, READABILITY ×3) plus cheap SUGGESTIONs: freeze/typed-selector before ambiguous short-circuit, fail-closed WorkOrder kind↔schema_version, strict ownership/budget/patch/exit_code, distinct schema-load vs instance failure in `validateCandidateV2`, `ILL_FORMED_SNAPSHOT_ID` vs `SOURCE_SNAPSHOT_MISMATCH`, and publication-filter comment.

### Completed Tasks (Phase 5)

- [x] 5.1–5.9 All remediation items verified locally

### Local Verification

| Suite | Result |
|-------|--------|
| `node --test scripts/lib/execution-identities/index.test.js` | PASS 49/49 |
| scoped + k3-schema-fixtures + k1-schema-compat | PASS 78+ |
| `npm test` / `node scripts/check.js` | PASS (All checks passed) |

Safety net baseline (pre-remediation identity suite): **40/40 passing**.

### TDD Cycle Evidence (Batch 2)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 5.1 | `execution-identities/index.test.js` | Unit | ✅ 40/40 | ✅ Written | ✅ Passed | ✅ forged + typed selector + unknown | ✅ Clean | Freeze before ambiguous; typed `candidate-relation-selector` |
| 5.2 | `execution-identities/index.test.js` | Unit | ✅ 40/40 | ✅ Written | ✅ Passed | ✅ v1+sv2 and v2+sv1 | ✅ Clean | Fail-closed disagreement |
| 5.3 | `execution-identities/index.test.js` | Unit | ✅ 40/40 | ✅ Written | ✅ Passed | ✅ ownership + budget null/non-object | ✅ Clean | `assertPlainObjectField` |
| 5.4 | `execution-identities/index.test.js` | Unit | ✅ 40/40 | ✅ Written | ✅ Passed | ✅ missing patch + null/1.5/"0" exit_code | ✅ Clean | Strict patch + integer exit_code |
| 5.5 | `execution-identities/index.js` | Unit | ✅ 40/40 | ➖ Infra | ✅ Static | ➖ | ✅ Clean | Schema load throws; instance catch → false |
| 5.6 | `execution-identities/index.test.js` | Unit | ✅ 40/40 | ✅ Written | ✅ Passed | ✅ ill-formed vs recompute mismatch | ✅ Clean | `ILL_FORMED_SNAPSHOT_ID` |
| 5.7–5.8 | `k1-schema-compat.js` + docs | — | N/A | ➖ Comment | ✅ Done | ➖ | ✅ Clean | Comments only |

### Test Summary (Batch 2)
- **Total new adversarial/remediation tests**: 9 (4R-R1..R6 + triangulation)
- **Total identity suite passing**: 49
- **Layers used**: Unit (all)
- **Approval tests** (refactoring): None — behavioral hardening
- **Pure helpers added**: `assertPlainObjectField`, `isRelationSelector`, `isFrozenCandidateV2`

> Authoritative `json:strict-tdd-evidence` block (schema-v1, single) lives in Batch 1 section above and already includes Phase 5 task rows.

### Deviations from Design (Batch 2)

- Introduced positive typed selector kind `candidate-relation-selector` so legitimate ambiguous/unknown short-circuit survives after freeze-first ordering (4R acceptance allowed typed selector).
- Renamed binding reason `SNAPSHOT_MISMATCH` → `ILL_FORMED_SNAPSHOT_ID` to separate declared ill-formed from recompute `SOURCE_SNAPSHOT_MISMATCH` (design listed both codes; rename clarifies without collapsing them).

### Issues Found (Batch 2)

- None blocking. Task 4.4 commits remain pending (process WARNING).

### Remaining Tasks

- [~] 4.4 Manual Conventional Commits (Spanish) without AI attribution
- Re-verify / re-run selective 4R or archive after successor verify confirms WARNINGs closed
