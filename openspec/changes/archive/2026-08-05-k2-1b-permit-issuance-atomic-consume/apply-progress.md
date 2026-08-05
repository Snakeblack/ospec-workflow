# Apply Progress: k2-1b-permit-issuance-atomic-consume

**Mode**: Strict TDD  
**Delivery**: `size:exception` (exception-ok) — full tasks.md in one apply pass  
**Branch**: `feat/k2-1b-permit-issuance-atomic-consume`  
**Started**: 2026-08-05T09:50:00.000Z  
**Completed**: 2026-08-05T10:15:00.000Z  
**Status**: done — ready for verify

## Pinned reason codes (apply)

| Code | Meaning |
|------|---------|
| `auto-mint-disabled` | Public `runKernelOperation` rejected `mintPermit: true` |
| `issuer-decision-required` | Issuer called without valid PolicyDecision/HumanDecision/KernelRule |
| `issuer-decision-ambiguous` | More than one decision DTO supplied to issuer |
| `authority-commit-incomplete` | Permit-authorized CAS missing consumed status or OperationReceipt |

## Pinned decision DTO fields

```js
{ kind: "policy-decision/v1", decision_id, subject_id?, operation?, note? }
{ kind: "human-decision/v1", decision_id, subject_id?, operation?, note? }
{ kind: "kernel-rule/v1", rule_id, subject_id?, operation?, note? }
```

## Batch log

### Batch 1 — size:exception full pass

- Delivery strategy confirmed: `size:exception`
- Safety net authority-store: 12/12 pass before modifications
- Safety net permits: 10/10 pass before modifications
- Phase 1–6 all `[x]`; `npm test` → 1944 pass / 0 fail (1946 total)
- memory-store.js unchanged (authority bag lives on Authority Store subject entry)
- host-contract/registry: no mintPermit:true mutate defaults to migrate (status-only / adapter surface checks)

## Acceptance gates (verified locally)

| Gate | Evidence |
|------|----------|
| 0 ops authorized solely as state-valid | Kernel/harness/model: omitPermit → `unauthorized` |
| 0 commits without previously issued permit | Default `mintPermit=false`; auto-mint rejected |
| 0 state commits without permit consumed | CAS `authorityCommit` co-writes bag; incomplete fails closed |
| same replay → same OperationReceipt | Kernel + harness + model checkers |
| restart → permit/receipt verifiable | snapshot → `initial` → load |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 1.1–1.3 | `scripts/lib/authority-store/index.test.js` | Unit | ✅ 12/12 | ✅ Written | ✅ Passed | ✅ 5 cases (bag/incomplete/atomic/replay/restart) | ✅ Clean | Bag on subject entry; digest unchanged |
| 1.4 | N/A | Structural | N/A | ➖ | ➖ | ➖ Single | ➖ None needed | Triangulation skipped: memory-store unchanged per design |
| 2.1–2.2 | `scripts/lib/lifecycle-kernel/permits.test.js` | Unit | ✅ 10/10 | ✅ Written | ✅ Passed | ✅ 5 issuer cases | ✅ Clean | Exact one decision DTO |
| 2.3 | `scripts/lib/lifecycle-kernel/test-permit-helpers.js` | Unit | N/A (new helpers) | ✅ Written | ✅ Passed | ✅ via harness/kernel | ✅ Clean | `issueFixturePermit` issuer-first |
| 2.4 | `scripts/lib/lifecycle-kernel/index.test.js` | Unit | ✅ | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Re-export smoke |
| 3.1–3.6 | `scripts/lib/lifecycle-kernel/index.test.js` | Integration | ✅ | ✅ Written | ✅ Passed | ✅ default/auto-mint/atomic/incomplete/replay/restart | ✅ Clean | Post-CAS Map mirror only |
| 3.7 | `scripts/lib/lifecycle-kernel/host-boundary.test.js` | Unit | ✅ | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Dropped mintPermit:true on status |
| 4.1–4.2 | `scripts/lib/minimal-kernel-harness.test.js` | Integration | ✅ | ✅ Written | ✅ Passed | ✅ issuer/auto-mint/atomic/replay/restart | ✅ Clean | Default mintPermit false + auto-issue |
| 4.3–4.4 | `scripts/lib/lifecycle-model.test.js` | Unit | ✅ | ✅ Written | ✅ Passed | ✅ K21=9 + K21B=5 non-deferred | ✅ Clean | Checkers exercise harness/kernel |
| 5.1–5.2 | docs (checklist) | Docs | N/A | ➖ | ✅ | ➖ Single | ➖ | WARNING5 quick-path + maturity tags |
| 6.1 | `npm test` | Suite | ✅ | N/A | ✅ 1944/0 | N/A | N/A | Full suite green |
| 6.2 | this file | Evidence | N/A | N/A | ✅ | N/A | N/A | Evidence table + schema-v1 record |

### Test Summary

- **Total tests written** (new/extended this change): ~25 behavioral cases across store/permits/kernel/harness/model
- **Total tests passing** (suite): 1944
- **Layers used**: Unit, Integration, Suite
- **Approval tests** (refactoring): None — behavioral deltas, not pure refactors
- **Pure functions created**: `prepareOperationReceipt`, `findReplayReceipt`, decision DTO validators, `isCompleteAuthorityCommit`

## Deviations from Design

None — implementation matches design. Assumption sdd-design-001 (runtime DTO kinds without schema-family registration) and sdd-design-002 (revision digest unchanged) held.

## Issues Found

None blocking. Mid-op journal durability may advance journal_digest before a failed CAS; state head and authority bag remain unchanged on `authority-commit-incomplete` (asserted).

## Workload / PR Boundary

- Mode: `size:exception`
- Current work unit: N/A (full tasks.md)
- Boundary: Phase 1 store → Phase 6 evidence
- Estimated review budget impact: High (accepted exception)

## Remediation (4R frozen findings)

**Started**: 2026-08-05T12:08:00.000Z  
**Status**: done — CRITICAL slice + authority WARNINGs (opción C)

### Findings addressed

| Finding ID | Lens | Fix |
|------------|------|-----|
| F-16ef85fdf6e8c12d | resilience | Convergent permit CAS co-writes bag receipt or returns matching bag receipt; kernel fail-closed without ephemeral pre-CAS receipt |
| F-8753ba3959e40ec7 | reliability | Prepare authority bag before `inner.commit`; rollback bag if commit throws |
| F-eabceb8c932efab2 | resilience | Same atomic prepare-before-commit path; orphan-head tests |
| WARNING mint export | authority | `mintOperationPermit` removed from public `lifecycle-kernel/index.js` |
| WARNING exact replay digests | authority | `findReplayReceipt` binds `arguments_digest` |
| WARNING bag permit-reuse | authority | `authorizeMutation` consults `authority.permits[id].status === "consumed"` |
| cheap: persistJournal | reliability | `commitJournal` `ok:false` throws fail-closed |

### TDD Cycle Evidence (remediation)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| F-16ef / converge | `authority-store/index.test.js` | Unit | ✅ | ✅ Written | ✅ Passed | ✅ heal path | ✅ `materializeAuthorityCommit` | Co-write on converge without bag receipt |
| F-8753/eabc atomic | `authority-store/index.test.js` | Unit | ✅ | ✅ Written | ✅ Passed | ✅ obs + orphan | ✅ bag-before-commit | Mid-await load never sees orphan head |
| F-16ef kernel | `lifecycle-kernel/index.test.js` | Integration | ✅ | ✅ Written | ✅ Passed | ➖ | ✅ | No ephemeral receipt fallback |
| replay digest | `permits.test.js` + `index.test.js` | Unit/Int | ✅ | ✅ Written | ✅ Passed | ✅ neg args | ✅ | Non-identical args → not replay → permit-reuse |
| bag permit-reuse | `permits.test.js` + `index.test.js` | Unit/Int | ✅ | ✅ Written | ✅ Passed | ✅ restart empty Map | ✅ | Bag consumed without receipt |
| mint public API | `index.test.js` | Unit | ✅ | ✅ Written | ✅ Passed | ➖ | ✅ | Export removed; tests import `permits.js` |
| persistJournal | `index.test.js` | Unit | ✅ | ✅ Written | ✅ Passed | ➖ | ✅ | `ok:false` throws |

### Test Summary (remediation)

- Focused: authority-store + permits + kernel (+ harness/model) → 100/100
- Full suite: `npm test` → 1954 pass / 0 fail (1956 total)

```json:strict-tdd-evidence
{
  "schema_version": 1,
  "change": "k2-1b-permit-issuance-atomic-consume",
  "evidence_mode": "live",
  "pinned_reason_codes": [
    "auto-mint-disabled",
    "issuer-decision-required",
    "issuer-decision-ambiguous",
    "authority-commit-incomplete"
  ],
  "pinned_decision_dto_kinds": [
    "policy-decision/v1",
    "human-decision/v1",
    "kernel-rule/v1"
  ],
  "cycles": [
    {
      "task": "1.1-1.3",
      "test_file": "scripts/lib/authority-store/index.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": {
        "source": "working-tree",
        "command": "node --test scripts/lib/authority-store/index.test.js",
        "digest": "sha256:c8878cee8a2a8a824a779e68254b244f4708b484bb93aa90c9ad02b606c09b24"
      }
    },
    {
      "task": "1.4",
      "test_file": "scripts/lib/authority-store/index.test.js",
      "layer": "structural",
      "red": "n/a",
      "green": "n/a",
      "triangulate": "skipped",
      "refactor": "none-needed",
      "notes": "memory-store unchanged; bag on Authority Store subject entry",
      "provenance": {
        "source": "working-tree",
        "command": "node --test scripts/lib/authority-store/index.test.js"
      }
    },
    {
      "task": "2.1-2.3",
      "test_file": "scripts/lib/lifecycle-kernel/permits.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": {
        "source": "working-tree",
        "command": "node --test scripts/lib/lifecycle-kernel/permits.test.js",
        "digest": "sha256:21ae563f5c49b658c65a67934c40c5a192b287c425b4bc1376f3bab55c11a3db"
      }
    },
    {
      "task": "2.4-3.7",
      "test_file": "scripts/lib/lifecycle-kernel/index.test.js",
      "layer": "integration",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": {
        "source": "working-tree",
        "command": "node --test scripts/lib/lifecycle-kernel/index.test.js",
        "digest": "sha256:0286b82b94543475bd153f30152189811771add7cd7014e8d15cb387d8de576f"
      }
    },
    {
      "task": "4.1-4.2",
      "test_file": "scripts/lib/minimal-kernel-harness.test.js",
      "layer": "integration",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": {
        "source": "working-tree",
        "command": "node --test scripts/lib/minimal-kernel-harness.test.js",
        "digest": "sha256:88c933b1ac4a340ada344b2e574cb07855b20e0c6d3b127d504d1e0a220de783"
      }
    },
    {
      "task": "4.3-4.4",
      "test_file": "scripts/lib/lifecycle-model.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": {
        "source": "working-tree",
        "command": "node --test scripts/lib/lifecycle-model.test.js",
        "digest": "sha256:4d10c1e6b3966a104a86ba01c2ea5192211a63d162b54b0249f8b6209d8e832b"
      }
    },
    {
      "task": "5.1-5.2",
      "test_file": "docs/roadmaps/harness-evolution.md",
      "layer": "docs",
      "red": "n/a",
      "green": "passed",
      "triangulate": "n/a",
      "refactor": "n/a",
      "notes": "WARNING5 quick-path + architecture maturity tags",
      "provenance": {
        "source": "working-tree",
        "command": "manual-docs-checklist"
      }
    },
    {
      "task": "6.1",
      "test_file": "npm test",
      "layer": "suite",
      "red": "n/a",
      "green": "passed",
      "triangulate": "n/a",
      "refactor": "n/a",
      "provenance": {
        "source": "working-tree",
        "command": "npm test",
        "result": "1954 pass / 0 fail"
      }
    },
    {
      "task": "remediation-F-16ef85fdf6e8c12d",
      "test_file": "scripts/lib/authority-store/index.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "notes": "convergent co-write + kernel no ephemeral receipt",
      "provenance": {
        "source": "working-tree",
        "command": "node --test scripts/lib/authority-store/index.test.js scripts/lib/lifecycle-kernel/index.test.js"
      }
    },
    {
      "task": "remediation-F-8753ba3959e40ec7+F-eabceb8c932efab2",
      "test_file": "scripts/lib/authority-store/index.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "notes": "bag prepared before commit; orphan head + mid-await observability",
      "provenance": {
        "source": "working-tree",
        "command": "node --test scripts/lib/authority-store/index.test.js"
      }
    },
    {
      "task": "remediation-authority-warnings-C",
      "test_file": "scripts/lib/lifecycle-kernel/permits.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "notes": "mint export removed; replay digest bind; bag permit-reuse; persistJournal ok:false",
      "provenance": {
        "source": "working-tree",
        "command": "node --test scripts/lib/lifecycle-kernel/permits.test.js scripts/lib/lifecycle-kernel/index.test.js"
      }
    }
  ],
  "functional_snapshot": {
    "files": [
      "scripts/lib/authority-store/index.js",
      "scripts/lib/authority-store/index.test.js",
      "scripts/lib/lifecycle-kernel/permits.js",
      "scripts/lib/lifecycle-kernel/permits.test.js",
      "scripts/lib/lifecycle-kernel/test-permit-helpers.js",
      "scripts/lib/lifecycle-kernel/index.js",
      "scripts/lib/lifecycle-kernel/index.test.js",
      "scripts/lib/lifecycle-kernel/host-boundary.test.js",
      "scripts/lib/minimal-kernel-harness.js",
      "scripts/lib/minimal-kernel-harness.test.js",
      "scripts/lib/lifecycle-model.js",
      "scripts/lib/lifecycle-model.test.js",
      "docs/roadmaps/harness-evolution.md",
      "docs/architecture/harness-evolution.md"
    ]
  }
}
```
