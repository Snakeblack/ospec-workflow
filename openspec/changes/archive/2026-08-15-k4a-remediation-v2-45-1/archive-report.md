# Archive Report

**Change**: k4a-remediation-v2-45-1
**Branch**: main
**Archive date (planned)**: 2026-08-15
**Planned destination**: `openspec/changes/archive/2026-08-15-k4a-remediation-v2-45-1/`
**Verify verdict**: PASS
**Plan contract**: schema v1 (`archive-plan.json`)

## Summary

Hybrid archive (Plan-and-Report): the executor prepared three spec writes (`execution-graph-compiler`, `execution-identities`, `kernel-contract-schemas`), six ADR promotions (`adr-001.md` through `adr-006.md`), and a full origin inventory fingerprint. Live writes to `openspec/specs/**` and `docs/adr/**`, the archive-folder move, and origin deletion are **pending** — owned by the deterministic archive transaction runtime (`node scripts/archive-transaction-run.js k4a-remediation-v2-45-1`).

The source directory `openspec/changes/k4a-remediation-v2-45-1/` **still exists** at report time.

## Verification Close Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS (53/53 scenarios at 100% `runtime-test`) |
| CRITICAL issues | None (0 BLOCKER, 0 CRITICAL, 0 WARNING, 0 SUGGESTION) |
| Tasks complete | 34/34 |
| Tests Execution | 2234 passed / 0 failed / 2 skipped (100% passing) |

## Specs Prepared (change-local)

| Domain | Action | Details |
|--------|--------|---------|
| execution-graph-compiler | MODIFIED | REQ-001 through REQ-007 modified with topological sha256 dependency resolution, policy_snapshot_id binding, clarify invalidation, and hardened shadow comparison (`specs/execution-graph-compiler/spec.md`) |
| execution-identities | MODIFIED | REQ-execution-identities-003 modified with sha256 dependency digest binding validation; REQ-001, 002, 004-010 preserved (`specs/execution-identities/spec.md`) |
| kernel-contract-schemas | MODIFIED | REQ-kernel-contract-schemas-012 and REQ-kernel-contract-schemas-015 modified with sha256 dependency pattern and mandatory policy_snapshot_id; REQ-001-011, 013, 014, 016, 017 preserved (`specs/kernel-contract-schemas/spec.md`) |

### Baseline Fingerprints

| Domain | target_before_sha256 |
|--------|----------------------|
| execution-graph-compiler | `sha256:f5d179e2afeca6488616233b4f08133a8180f4f8512b2f0450d037b9a5a14685` |
| execution-identities | `sha256:2736aca54cd5d2c97f69912f6cd4646ba5756a14ec52fc4290c1751bac57daea` |
| kernel-contract-schemas | `sha256:6f79a005d724b4c8b6ba2e8a52ea165795ee95a28983715a17461d36656d1178` |

## ADR Promotions (runtime-owned commit)

| Source | Target |
|--------|--------|
| `decisions/adr-001.md` | `docs/adr/adr-20260815-007-topological-workorder-v2-compilation-with-canonical-workorderid-dependency-digests.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260815-008-atomic-canonical-schema-validation-in-workorder-compiler.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260815-009-authoritative-contract-obligation-manifest-reconciliation.md` |
| `decisions/adr-004.md` | `docs/adr/adr-20260815-010-clarify-invalidation-propagation-and-fail-closed-stale-fixture-rejection-in-replay.md` |
| `decisions/adr-005.md` | `docs/adr/adr-20260815-011-cryptographic-binding-of-policy-snapshot-id-to-executiongraph-and-graphid.md` |
| `decisions/adr-006.md` | `docs/adr/adr-20260815-012-hardened-multi-dimensional-shadow-comparison-baseline.md` |

Change-local `decisions/` copies remain in the audit trail; live `docs/adr/` writes occur only when the archive transaction runtime commits.

## Archive Inventory (plan summary)

Origin paths listed in `archive-plan.json` `archive_inventory[]` (16 entries at plan emission, excluding `archive-plan.json` from fingerprint identity):

- `apply-progress.md`
- `archive-report.md` (this report)
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `decisions/adr-003.md`
- `decisions/adr-004.md`
- `decisions/adr-005.md`
- `decisions/adr-006.md`
- `design.md`
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
| specs/ (3 prepared merges) | present ✅ |
| design.md | present ✅ |
| tasks.md | present ✅ (34/34 complete) |
| apply-progress.md | present ✅ |
| verify-report.md | present ✅ (PASS) |
| decisions/ (6 ADRs) | present ✅ |
| archive-report.md | present ✅ |
| archive-plan.json | emitted (pending runtime) |

## Live Specs / ADR Commit Pending (runtime-owned)

Live `openspec/specs/**` and `docs/adr/**` writes are applied only by the archive transaction runtime during commit — not by this executor.

## Move Completion Pending (orchestrator-owned)

The source directory `openspec/changes/k4a-remediation-v2-45-1/` still exists. Closure authority requires a runtime success receipt from:

```text
node scripts/archive-transaction-run.js k4a-remediation-v2-45-1
```

Do not treat this report as proof that the archive move completed.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k4a-remediation-v2-45-1/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
