# Archive Report

**Change**: k4a-integrity-and-bindings-remediation
**Branch**: main
**Archive date (planned)**: 2026-08-16
**Planned destination**: `openspec/changes/archive/2026-08-16-k4a-integrity-and-bindings-remediation/`
**Verify verdict**: PASS
**Plan contract**: schema v1 (`archive-plan.json`)

## Summary

Hybrid archive (Plan-and-Report): the executor prepared three spec writes (`execution-graph-compiler`, `execution-identities`, `kernel-contract-schemas`), eight ADR promotions (`adr-001.md` through `adr-008.md`), and a full origin inventory fingerprint. Live writes to `openspec/specs/**` and `docs/adr/**`, the archive-folder move, and origin deletion are **pending** — owned by the deterministic archive transaction runtime (`node scripts/archive-transaction-run.js k4a-integrity-and-bindings-remediation`).

The source directory `openspec/changes/k4a-integrity-and-bindings-remediation/` **still exists** at report time.

## Verification Close Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS (37/37 scenarios at 100% `runtime-test`) |
| CRITICAL issues | None (0 BLOCKER, 0 CRITICAL, 0 WARNING, 0 SUGGESTION) |
| Tasks complete | 31/31 |
| Tests Execution | 167 passed / 0 failed / 0 skipped (100% passing) |

## Specs Prepared (change-local)

| Domain | Action | Details |
|--------|--------|---------|
| execution-graph-compiler | MODIFIED | REQ-001, 004, 005, 006, 007 modified with topological sha256 dependency resolution, cryptographic binding gate, clarify invalidation with clarification_context, and hardened shadow comparison; REQ-008 added (Shared DAG Cycle Detection Utility); REQ-002, 003 preserved (`prepared-specs/execution-graph-compiler/spec.md`) |
| execution-identities | MODIFIED | REQ-execution-identities-011 added (Execution Graph Cryptographic Binding Gate); REQ-001 through 010 preserved (`prepared-specs/execution-identities/spec.md`) |
| kernel-contract-schemas | MODIFIED | REQ-kernel-contract-schemas-015 modified with clarification_context on node schema; REQ-kernel-contract-schemas-018 added (PolicySnapshot v1 Canonical Binding Validation); REQ-001 through 014, 016, 017 preserved (`prepared-specs/kernel-contract-schemas/spec.md`) |

### Baseline Fingerprints

| Domain | target_before_sha256 |
|--------|----------------------|
| execution-graph-compiler | `sha256:d83750efb3dd1fd2f6db8417baa8133536b26e855a1c722db7b124be07ffc069` |
| execution-identities | `sha256:baced04e79d5fc25120f294b6eed3a6d381ff9f5b9def68f47f9a2f386250971` |
| kernel-contract-schemas | `sha256:6deabb0fd3e0e3a538010e8cea712c902efedf2d71985cfbc73242aaec3359dc` |

## ADR Promotions (runtime-owned commit)

| Source | Target |
|--------|--------|
| `decisions/adr-001.md` | `docs/adr/adr-20260816-001-canonical-validateexecutiongraphbinding-primitive.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260816-002-canonical-validatepolicysnapshotbinding-primitive.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260816-003-extension-of-execution-graph-v1-schema-json-for-clarify-context.md` |
| `decisions/adr-004.md` | `docs/adr/adr-20260816-004-authoritative-contract-obligation-authority-and-graphid-preimage-coupling.md` |
| `decisions/adr-005.md` | `docs/adr/adr-20260816-005-explicit-fail-closed-sourcesnapshotid-validation.md` |
| `decisions/adr-006.md` | `docs/adr/adr-20260816-006-per-node-required-evidence-enforcement-in-replay-engine.md` |
| `decisions/adr-007.md` | `docs/adr/adr-20260816-007-consolidated-dag-cycle-detection-and-topological-sort-utility.md` |
| `decisions/adr-008.md` | `docs/adr/adr-20260816-008-hardened-multi-dimensional-shadow-comparison-baseline.md` |

Change-local `decisions/` copies remain in the audit trail; live `docs/adr/` writes occur only when the archive transaction runtime commits.

## Archive Inventory (plan summary)

Origin paths listed in `archive-plan.json` `archive_inventory[]` (21 entries at plan emission, excluding `archive-plan.json` from fingerprint identity):

- `apply-progress.md`
- `archive-report.md` (this report)
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `decisions/adr-003.md`
- `decisions/adr-004.md`
- `decisions/adr-005.md`
- `decisions/adr-006.md`
- `decisions/adr-007.md`
- `decisions/adr-008.md`
- `design.md`
- `prepared-specs/execution-graph-compiler/spec.md`
- `prepared-specs/execution-identities/spec.md`
- `prepared-specs/kernel-contract-schemas/spec.md`
- `proposal.md`
- `specs/execution-graph-compiler/spec.md`
- `specs/execution-identities/spec.md`
- `specs/kernel-contract-schemas/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

`archive-plan.json` is emitted alongside this report and is copied by the runtime but excluded from `source_fingerprint` (self-hash avoidance).

## Archive Report Contents

| Artifact | Status |
|----------|--------|
| proposal.md | present ✅ |
| specs/ (3 delta specs) | present ✅ |
| prepared-specs/ (3 prepared merges) | present ✅ |
| design.md | present ✅ |
| tasks.md | present ✅ (31/31 complete) |
| apply-progress.md | present ✅ |
| verify-report.md | present ✅ (PASS) |
| decisions/ (8 ADRs) | present ✅ |
| archive-report.md | present ✅ |
| archive-plan.json | emitted (pending runtime) |

## Live Specs / ADR Commit Pending (runtime-owned)

Live `openspec/specs/**` and `docs/adr/**` writes are applied only by the archive transaction runtime during commit — not by this executor.

## Move Completion Pending (orchestrator-owned)

The source directory `openspec/changes/k4a-integrity-and-bindings-remediation/` still exists. Closure authority requires a runtime success receipt from:

```text
node scripts/archive-transaction-run.js k4a-integrity-and-bindings-remediation
```

Do not treat this report as proof that the archive move completed.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k4a-integrity-and-bindings-remediation/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
