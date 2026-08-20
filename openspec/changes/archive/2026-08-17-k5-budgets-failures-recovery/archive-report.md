# Archive Report

**Change**: k5-budgets-failures-recovery
**Branch**: main
**Archive date (planned)**: 2026-08-17
**Planned destination**: `openspec/changes/archive/2026-08-17-k5-budgets-failures-recovery/`
**Verify verdict**: PASS
**Plan contract**: schema v1 (`archive-plan.json`)

## Summary

Hybrid archive (Plan-and-Report): the executor prepared six spec writes (`execution-budgets`, `failure-recovery`, `kernel-contract-schemas`, `lifecycle-kernel-runtime`, `contract-lint`, `lifecycle-model-conformance`), three ADR promotions (`adr-001.md` through `adr-003.md`), and a full origin inventory fingerprint. Live writes to `openspec/specs/**` and `docs/adr/**`, the archive-folder move, and origin deletion are **pending** — owned by the deterministic archive transaction runtime (`node scripts/archive-transaction-run.js k5-budgets-failures-recovery`).

The source directory `openspec/changes/k5-budgets-failures-recovery/` **still exists** at report time.

## Verification Close Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS (49/49 scenarios at 100% `runtime-test`) |
| CRITICAL issues | None (0 BLOCKER, 0 CRITICAL, 0 WARNING, 0 SUGGESTION) |
| Tasks complete | 31/31 |
| Tests Execution | 212 passed / 0 failed / 2 skipped (100% passing) |

## Specs Prepared (change-local)

| Domain | Action | Details |
|--------|--------|---------|
| execution-budgets | ADDED | New capability spec defining uniform node budgets (turns, patches, commands, wall time, changed lines, allowed paths), authority/effects limits, strict monotonicity across retries/CAS, zero-delta attempt consumption, exhausted budget terminality, and non-semantic telemetry isolation (`prepared-specs/execution-budgets/spec.md`) |
| failure-recovery | ADDED | New capability spec defining 5-category causal failure taxonomy, deterministic priority resolution (P1 Env > P2 CAS > P3 Amb > P4 Gap > P5 Defect), allowlisted recovery transition matrix (`repair`, `replan`, `escalate`, `stop`), bounded repair scopes, honest recovery via blocking fingerprint progression, and CAS/ambiguity reconciliation (`prepared-specs/failure-recovery/spec.md`) |
| kernel-contract-schemas | MODIFIED | REQ-kernel-contract-schemas-001 modified with execution-budget, authority-effect-budget, causal-failure, and failure-recovery-transition families; REQ-kernel-contract-schemas-019 added (Execution Budget and Authority Effect Budget Schema Families); REQ-kernel-contract-schemas-020 added (Causal Failure and Recovery Transition Schema Families); REQ-002 through REQ-018 preserved (`prepared-specs/kernel-contract-schemas/spec.md`) |
| lifecycle-kernel-runtime | MODIFIED | REQ-lifecycle-kernel-runtime-005 modified with blocking fingerprint advancement and allowlisted transition binding; REQ-lifecycle-kernel-runtime-025 added (Budget Monotonicity Enforcement In Lifecycle Reducers); REQ-lifecycle-kernel-runtime-026 added (Causal Failure Priority And Transition Routing); REQ-lifecycle-kernel-runtime-027 added (Zero-Delta Consumption And Honest Terminality); REQ-001 through REQ-004, REQ-006 through REQ-024 preserved (`prepared-specs/lifecycle-kernel-runtime/spec.md`) |
| contract-lint | MODIFIED | REQ-contract-lint-014 added (Causal Failure Taxonomy And Transition Matrix Checker); REQ-contract-lint-015 added (Execution Budget And Monotonicity Structure Checker); REQ-001 through REQ-013, Cross-References, and Clarifications preserved (`prepared-specs/contract-lint/spec.md`) |
| lifecycle-model-conformance | MODIFIED | REQ-lifecycle-model-conformance-003 modified promoting budgets and causal recovery structures from opaque to concrete; REQ-lifecycle-model-conformance-004 modified removing budget monotonicity and causal recovery from deferred list; REQ-lifecycle-model-conformance-011 added (Executable K5 Budget Monotonicity And Causal Recovery Invariants); REQ-001, 002, 005 through 010 preserved (`prepared-specs/lifecycle-model-conformance/spec.md`) |

### Baseline Fingerprints

| Domain | target_before_sha256 |
|--------|----------------------|
| execution-budgets | `null` (new capability) |
| failure-recovery | `null` (new capability) |
| kernel-contract-schemas | `sha256:4472c5bd7ac1994041b7562c2221b53713df7b375f12d6dda251a14f8f467af0` |
| lifecycle-kernel-runtime | `sha256:973df1375f039f2296487683733056c0d28100bd41f1abe42b9e162b6a5ab8e5` |
| contract-lint | `sha256:b6c92744f6f8516126ef90e9d4048f954c98d998de3186db7d764e80f30da6c5` |
| lifecycle-model-conformance | `sha256:a016e66e8174d00c72b594cdb410efe1eafa24e38deaffdd9e864eb3e6ce479a` |

## ADR Promotions (runtime-owned commit)

| Source | Target |
|--------|--------|
| `decisions/adr-001.md` | `docs/adr/adr-20260817-001-pure-decoupled-budget-evaluator-and-monotonic-state-accounting-with-telemetry-isolation.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260817-002-structured-5-category-causal-failure-taxonomy-with-precedence.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260817-003-closed-allowlisted-transition-matrix-bounded-repair-scopes-and-zero-delta-honesty-guarantees.md` |

Change-local `decisions/` copies remain in the audit trail; live `docs/adr/` writes occur only when the archive transaction runtime commits.

## Archive Inventory (plan summary)

Origin paths listed in `archive-plan.json` `archive_inventory[]` (22 entries at plan emission, excluding `archive-plan.json` from fingerprint identity):

- `apply-progress.md`
- `archive-report.md` (this report)
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `decisions/adr-003.md`
- `design.md`
- `prepared-specs/contract-lint/spec.md`
- `prepared-specs/execution-budgets/spec.md`
- `prepared-specs/failure-recovery/spec.md`
- `prepared-specs/kernel-contract-schemas/spec.md`
- `prepared-specs/lifecycle-kernel-runtime/spec.md`
- `prepared-specs/lifecycle-model-conformance/spec.md`
- `proposal.md`
- `specs/contract-lint/spec.md`
- `specs/execution-budgets/spec.md`
- `specs/failure-recovery/spec.md`
- `specs/kernel-contract-schemas/spec.md`
- `specs/lifecycle-kernel-runtime/spec.md`
- `specs/lifecycle-model-conformance/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

`archive-plan.json` is emitted alongside this report and is copied by the runtime but excluded from `source_fingerprint` (self-hash avoidance).

## Archive Report Contents

| Artifact | Status |
|----------|--------|
| proposal.md | present ✅ |
| specs/ (6 delta specs) | present ✅ |
| prepared-specs/ (6 prepared merges) | present ✅ |
| design.md | present ✅ |
| tasks.md | present ✅ (31/31 complete) |
| apply-progress.md | present ✅ |
| verify-report.md | present ✅ (PASS) |
| decisions/ (3 ADRs) | present ✅ |
| archive-report.md | present ✅ |
| archive-plan.json | emitted (pending runtime) |

## Live Specs / ADR Commit Pending (runtime-owned)

Live `openspec/specs/**` and `docs/adr/**` writes are applied only by the archive transaction runtime during commit — not by this executor.

## Move Completion Pending (orchestrator-owned)

The source directory `openspec/changes/k5-budgets-failures-recovery/` still exists. Closure authority requires a runtime success receipt from:

```text
node scripts/archive-transaction-run.js k5-budgets-failures-recovery
```

Do not treat this report as proof that the archive move completed.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k5-budgets-failures-recovery/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
