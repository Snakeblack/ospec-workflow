# Archive Report

**Change**: hybrid-archive-transaction-runtime (roadmap O6A)
**Branch**: feat/hybrid-archive-transaction-runtime
**Archive date (planned)**: 2026-07-26
**Planned destination**: `openspec/changes/archive/2026-07-26-hybrid-archive-transaction-runtime/`
**Verify verdict**: PASS WITH WARNINGS (accepted)
**4R lineage**: approved — `terminal_reason: all-remediation-slices-passed`
**Plan contract**: schema v1 (`archive-plan.json`)

## Summary

Hybrid archive (Plan-and-Report): the executor prepared four spec writes (two new
domains, two modified), six ADR promotions, and a full origin inventory fingerprint.
Live writes to `openspec/specs/**` and `docs/adr/**`, the archive-folder move, and
origin deletion are **pending** — owned by the deterministic archive transaction
runtime (`node scripts/archive-transaction-run.js hybrid-archive-transaction-runtime`).

The source directory `openspec/changes/hybrid-archive-transaction-runtime/` **still
exists** at report time.

## Verification Close Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS WITH WARNINGS |
| CRITICAL issues | None |
| 4R lineage | approved (7/7 CRITICAL slices passed) |
| Tasks complete | 28/28 |
| Quality gates | No-op (policy absent from config) |

Warnings accepted as follow-up work (approval `verify-warnings-001`):

| ID | Summary | Disposition |
|----|---------|-------------|
| WARNING-1 | Unknown-code consumer simulated in unit test, not exercised in `runArchiveTransaction` | Accepted follow-up |
| WARNING-2 | No Linux execution evidence for cross-OS fixtures | Accepted follow-up |
| WARNING-3 | Four genesis prose paths missing digests in `json:strict-tdd-evidence` | Accepted follow-up |

## Specs Prepared (change-local)

| Domain | Action | Details |
|--------|--------|---------|
| archive-plan-contract | ADD | New baseline — delta is full spec (`specs/archive-plan-contract/spec.md`) |
| archive-transaction-runtime | ADD | New baseline — delta is full spec (`specs/archive-transaction-runtime/spec.md`) |
| agents | MODIFIED | REQ-agents-008 replaced — orchestrator invokes runtime with receipt (`prepared-specs/agents/spec.md`) |
| skills | MODIFIED | Baseline fingerprint, ADR promotion, Plan-and-Report, Cost blocks updated (`prepared-specs/skills/spec.md`) |

### Baseline fingerprints (from state.yaml)

| Domain | target_before_sha256 |
|--------|----------------------|
| agents | `sha256:7610a6042531df78be64299bf3910c07fc07f3a2b61c85c0c9a808e7d69ea7b9` |
| skills | `sha256:f34c4bef85c94be3ed17bec8de79894c61aaf3044705b6c5debda5498afacad8` |
| archive-plan-contract | `null` (new) |
| archive-transaction-runtime | `null` (new) |

## ADR Promotions (runtime-owned commit)

| Source | Target |
|--------|--------|
| `decisions/adr-001.md` | `docs/adr/adr-20260726-001-staging-root-journal-under-ospec-archive-tx-change.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260726-002-pure-plan-validator-with-injected-filesystem-snapshot.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260726-003-windows-commit-fallback-via-additive-renamewithfallback-export.md` |
| `decisions/adr-004.md` | `docs/adr/adr-20260726-004-runtime-failure-reasons-separate-from-plan-rejection-codes.md` |
| `decisions/adr-005.md` | `docs/adr/adr-20260726-005-gate-approval-and-baseline-fingerprint-preflight-runtime-owned.md` |
| `decisions/adr-006.md` | `docs/adr/adr-20260726-006-no-go-mirror-js-go-parity-n-a-for-archive-runtime.md` |

Change-local `decisions/` copies remain in the audit trail; live `docs/adr/` writes
occur only when the runtime commits.

## Archive Inventory (plan summary)

Origin paths listed in `archive-plan.json` `archive_inventory[]` (35 entries at plan
emission, excluding `archive-plan.json` from fingerprint identity):

- `.review/*` (14 review lineage artifacts)
- `apply-progress.md`, `proposal.md`, `design.md`, `tasks.md`, `verify-report.md`
- `archive-report.md` (this report)
- `state.yaml`
- `decisions/adr-001.md` … `adr-006.md`
- `specs/agents/spec.md`, `specs/skills/spec.md`, `specs/archive-plan-contract/spec.md`, `specs/archive-transaction-runtime/spec.md`
- `prepared-specs/agents/spec.md`, `prepared-specs/skills/spec.md`

`archive-plan.json` is emitted alongside this report and is copied by the runtime but
excluded from `source_fingerprint` (self-hash avoidance per assumption `sdd-apply-001`).

## Archive Report Contents

| Artifact | Status |
|----------|--------|
| proposal.md | present |
| specs/ (4 delta domains + 2 prepared merges) | present |
| design.md | present |
| tasks.md | present (28/28 complete) |
| apply-progress.md | present |
| verify-report.md | present (PASS WITH WARNINGS) |
| decisions/ (6 ADRs) | present |
| archive-plan.json | emitted (pending runtime) |

## Live Specs / ADR Commit Pending (runtime-owned)

| Target | content_sha256 |
|--------|----------------|
| `openspec/specs/archive-plan-contract/spec.md` | `sha256:e5da33258561c74640f61b7f566d06eb16246ad42257717ca106104fde1d3672` |
| `openspec/specs/archive-transaction-runtime/spec.md` | `sha256:360a7de94d17d30bd9adc731337092206705fd1a1feb0c5a255c777f6f78c3ab` |
| `openspec/specs/agents/spec.md` | `sha256:072c2935f4d1a0d7c11708831babbb66831047887eef6414365cdea44f1581b3` |
| `openspec/specs/skills/spec.md` | `sha256:c65d827f8e073d91499766433d72a1032cda4478b4c9ac5ff68ba4deb548c9e2` |

## Move Completion Pending (orchestrator-owned)

The source directory `openspec/changes/hybrid-archive-transaction-runtime/` still
exists. Closure authority requires a runtime success receipt from:

```text
node scripts/archive-transaction-run.js hybrid-archive-transaction-runtime
```

Do not treat this report as proof that the archive move completed.

## Assumptions Carried

All 16 ledger entries reconciled at verify; none unresolved with `reversibility: low`.
Notable: `sdd-apply-001` (plan excluded from fingerprint), `sdd-design-002` (failure_reason
disjoint from plan codes — confirmed).

## Follow-Up Work (non-blocking)

- WARNING-1: drive unknown rejection code through production `runArchiveTransaction` path
- WARNING-2: run cross-OS fixtures on Linux CI/WSL
- WARNING-3: refresh strict-tdd-evidence digests for post-4R runtime files and prose genesis paths
- 4R advisory leftovers (S1): commit-failed inject, corrupt journal, `--rollback` e2e, atomic writeJournal, compare-a/b rename clarity

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/hybrid-archive-transaction-runtime/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
