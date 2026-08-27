## Verification Report

**Change**: k6b-verifier-evidence-assurance-graph
**Version**: 2.49.0
**Mode**: Standard (Focused TDD)
**Verified candidate**: `sha256:908b136e18c4eddb602f64666095d3551af6e9a070e97180a8b161ff0e66f503`

### Targeted Recheck: V001

**Lineage**: `sha256:eb460cfa32e8037356637452830a63f375f75e37a03135b5d9d02cecae1033d7`  
**Genesis candidate**: `sha256:695cac5328f049cdd061ef8f77be7b4fc563714bd441484347a6c30c8a65545a`  
**Remediation attempt**: 1/2  
**Frozen origin**: `code-bug`

`getLineageNextAction` returned `run-targeted-recheck` with reason `active-recheck-pending`. Only the frozen V001 validation recipe was executed.

```text
npm test
Exit code: 0 (expected: 0)
2710 tests: 2708 passed, 0 failed, 2 skipped.
All checks passed.
```

The frozen referenced tests passed within that run:

- `scripts/contract-lint.test.js`: unified contract lint reports zero offenders.
- `scripts/lib/contract-checkers/k1-schema-compat.test.js`: real kernel manifest passes compatibility.
- `scripts/lib/contract-checkers/k6a-checkers.test.js`: aggregate contract-lint registry passes.

`evaluateRecheck` returned `close`: V001 is `resolved`, `verify_lineage.status` is `closed`, and `verified_candidate_id` equals the remediated candidate. No causal regressions or late observations were recorded.

### Initial Discovery (Historical)

The sections below preserve the original discovery evidence that opened V001. The targeted recheck above is the current authoritative result for that frozen finding.

#### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 33 |
| Tasks complete | 33 |
| Tasks incomplete | 0 |

### Build & Tests Execution

**Build**: ➖ Not configured

**Focused tests**: ✅ 59 passed / 0 failed / 0 skipped

```text
node --test scripts/lib/k6b-schema-fixtures.test.js scripts/lib/independent-verifier/index.test.js scripts/lib/assurance-graph/index.test.js scripts/k6b-verifier-assurance-graph-e2e.test.js scripts/lib/roadmap-boundary.test.js scripts/lib/k2a-maturity-docs.test.js scripts/lib/k21-maturity-docs.test.js scripts/lib/lifecycle-kernel/k1-compat.test.js scripts/lib/k1-scope-guard.test.js scripts/lib/kernel-schema-fixtures.test.js scripts/lib/contract-checkers/k1-maturity.test.js
Exit code: 0
59 tests passed in 855 ms.
```

**Full regression suite**: ❌ 2703 passed / 3 failed / 2 skipped

```text
npm test
Exit code: 1
2708 tests: 2703 passed, 3 failed, 2 skipped.

Failing tests:
- scripts/contract-lint.test.js: unified contract lint reports 5 K6b offenders.
- scripts/lib/contract-checkers/k1-schema-compat.test.js: real kernel manifest is incompatible.
- scripts/lib/contract-checkers/k6a-checkers.test.js: aggregate clean-repository assertion receives the same 5 offenders.

Offenders:
- evidence/v2 valid fixture is also evaluated by evidence/v1 and rejected.
- verification/v2 valid fixture is also evaluated by verification/v1 and rejected.
- evidence-v2 manifest path violates the checker's canonical-path rule.
- verification-v2 manifest path violates the checker's canonical-path rule.
- assurance-graph claims expose relation as a top-level enum, while the schema defines it under edge items.
```

**Manual verification**: not performed

**Coverage**: ➖ Not available; the project declares no coverage command.

### Spec Compliance Matrix

| Requirement | Scenarios | Evidence Level | Source | Result | Notes |
|-------------|-----------|----------------|--------|--------|-------|
| REQ-independent-verification-001 | Frozen Candidate proceeds; WorkResult rejected; unfrozen/binding mismatch rejected | `runtime-test` | `scripts/lib/independent-verifier/index.test.js` | PASS | All binding paths pass in focused and full runs. |
| REQ-independent-verification-002 | Feature minimums; Strict TDD fallback without config rewrite | `runtime-test` | `scripts/lib/independent-verifier/index.test.js`, `scripts/k6b-verifier-assurance-graph-e2e.test.js` | PASS | Strategy negatives and unchanged focused mode are exercised. |
| REQ-independent-verification-003 | Runtime evidence; model-report rejection; stale/foreign/fabricated rejection | `runtime-test` | `scripts/lib/independent-verifier/index.test.js`, E2E | PASS | Includes transitive stale-evidence rejection. |
| REQ-independent-verification-004 | Separate verification verdict; verdict-bearing evidence rejected | `runtime-test` | `scripts/lib/independent-verifier/index.test.js` | PASS | Evidence and verification remain distinct at runtime. |
| REQ-assurance-graph-001 | Canonical projection; divergent graph fails closed | `runtime-test` | `scripts/lib/assurance-graph/index.test.js` | PASS | Reconciliation and authority misuse are exercised. |
| REQ-assurance-graph-002 | Stable digest/edges; forbidden relations and subjects rejected | `runtime-test` | `scripts/lib/assurance-graph/index.test.js` | PASS | Permutation and negative cases pass. |
| REQ-assurance-graph-003 | Selective successor closure; transitive invalidation blocks reuse | `runtime-test` | graph unit tests and E2E | PASS | Dependent evidence is invalidated while independent evidence is preserved. |
| REQ-assurance-graph-004 | Bound non-promotional manifest; non-aliasing | `runtime-test` | graph and schema fixture tests | PASS | Direct behavior passes. |
| REQ-kernel-contract-schemas-024 | Evidence v2 valid/invalid fixtures and frozen v1 pins | `runtime-test` | `scripts/lib/k6b-schema-fixtures.test.js`, full contract lint | FAIL | Direct tests pass, but canonical publication validation incorrectly re-evaluates the v2 valid fixture as v1. |
| REQ-kernel-contract-schemas-025 | Verification v2 and cross-family rejection | `runtime-test` | `scripts/lib/k6b-schema-fixtures.test.js`, full contract lint | FAIL | Direct tests pass, but canonical publication validation incorrectly re-evaluates the v2 valid fixture as v1. |
| REQ-kernel-contract-schemas-026 | Assurance Graph schema, relations, fixtures, manifest | `runtime-test` | `scripts/lib/k6b-schema-fixtures.test.js`, full contract lint | FAIL | Direct schema tests pass; machine-readable claims are incompatible with the canonical checker representation. |
| REQ-kernel-contract-schemas-001 | Versioned family inventory and pinning | `runtime-test` | schema fixture tests and `k1-schema-compat` | FAIL | `evidence-v2` and `verification-v2` registry paths violate the canonical publication rule. |
| REQ-harness-authority-canon-010 | Read-only inspection; graph authority misuse fails closed | `runtime-test` | `scripts/lib/assurance-graph/index.test.js`, `scripts/lib/roadmap-boundary.test.js` | PASS | No upstream K3/K4a/K4b/K6a import of K6b. |
| REQ-harness-authority-canon-011 | K6b surfaces implemented; later authority remains non-implemented | `static-lint` | maturity and roadmap boundary tests | PASS | This requirement is declarative; static-lint is acceptable evidence. |
| REQ-harness-authority-canon-001 | Assurance Graph cannot override canonical authority | `runtime-test` | reconciliation and authority misuse tests | PASS | Divergence and authority misuse fail closed. |

**Compliance summary**: 11/15 change requirements pass; 4/15 fail canonical schema publication integration.

### Correctness (Static Evidence)

| Requirement area | Status | Notes |
|------------------|--------|-------|
| Independent verifier | ✅ Implemented | Binding, strategy, provenance, sufficiency, determinism, and verdict tests pass. |
| Assurance Graph runtime | ✅ Implemented | Projection, reconciliation, closure, manifest, and authority guards pass. |
| Kernel schema publication | ❌ Incomplete | New contracts pass their focal validator but fail the repository's canonical contract checker. |
| Harness maturity boundaries | ✅ Implemented | Boundary and maturity assertions pass. |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Additive evidence/verification v2 with frozen v1 pins | ⚠️ Partial | v1 byte pins remain intact, but v2 publication is not integrated with canonical family/fixture discovery. |
| Independent policy-driven verifier | ✅ Yes | Pure fail-closed verifier and closed strategy table are present. |
| Deterministic read-only Assurance Graph | ✅ Yes | Projection, reconciliation, selective invalidation, and authority rejection match the design. |

### Issues Found

**CRITICAL**

- `V001` `[origin: code-bug]` Canonical contract lint rejects the new K6b schema publications. The full required test command exits 1 with five offenders: missing v2 family publication aliases/fixture filters, non-canonical inferred paths for `evidence-v2` and `verification-v2`, and an Assurance Graph claims/schema enum-shape mismatch. Validation recipe: `npm test` must exit 0.

**WARNING**: None.

**SUGGESTION**: None.

### Traceability Matrix

| REQ | Tasks | Commits | Tests | Status |
|-----|-------|---------|-------|--------|
| REQ-independent-verification-001 | 2.1–2.2, 6.3 | working tree | `independent-verifier/index.test.js`, E2E | OK |
| REQ-independent-verification-002 | 2.3–2.5 | working tree | `independent-verifier/index.test.js` | OK |
| REQ-independent-verification-003 | 3.1–3.2, 3.5 | working tree | `independent-verifier/index.test.js` | OK |
| REQ-independent-verification-004 | 3.3–3.5 | working tree | `independent-verifier/index.test.js` | OK |
| REQ-assurance-graph-001 | 4.2–4.4 | working tree | `assurance-graph/index.test.js` | OK |
| REQ-assurance-graph-002 | 4.1–4.2, 6.3 | working tree | graph tests, E2E | OK |
| REQ-assurance-graph-003 | 5.1–5.3, 6.3–6.4 | working tree | graph tests, E2E | OK |
| REQ-assurance-graph-004 | 5.3–5.5 | working tree | graph and schema tests | OK |
| REQ-kernel-contract-schemas-024 | 1.1–1.2, 1.6 | working tree | K6b schema fixtures, contract lint | FAIL |
| REQ-kernel-contract-schemas-025 | 1.1, 1.3 | working tree | K6b schema fixtures, contract lint | FAIL |
| REQ-kernel-contract-schemas-026 | 1.1, 1.4, 5.5 | working tree | K6b schema fixtures, contract lint | FAIL |
| REQ-kernel-contract-schemas-001 | 1.1, 1.5 | working tree | K6b schema fixtures, `k1-schema-compat` | FAIL |
| REQ-harness-authority-canon-010 | 4.5, 6.1–6.2 | working tree | graph and roadmap boundary tests | OK |
| REQ-harness-authority-canon-011 | 7.1–7.2 | working tree | maturity and roadmap tests | OK |
| REQ-harness-authority-canon-001 | 4.3, 7.2 | working tree | graph reconciliation and boundary tests | OK |

### Assumption Reconciliation

| id | statement | reversibility | outcome |
|----|-----------|---------------|---------|
| sdd-spec-001 | Evidence and verification hardening is additive in v2; v1 files and K1 pins stay byte-identical. | low | confirmed |
| sdd-apply-001 | Strategy role remains raw verifier input and is omitted from published evidence/v2. | high | confirmed |

### Current Verdict

PASS

The frozen V001 finding is resolved. The mandatory `npm test` recipe exits 0 with 2708 passed, 0 failed, and 2 skipped tests; the verified candidate and contract digest remained unchanged during the targeted recheck.
