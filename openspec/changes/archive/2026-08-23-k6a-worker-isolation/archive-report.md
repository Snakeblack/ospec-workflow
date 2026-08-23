# Archive Report

**Change**: k6a-worker-isolation (roadmap K6a)
**Branch**: feat/k6a-worker-isolation
**Archive date (planned)**: 2026-08-23
**Planned destination**: `openspec/changes/archive/2026-08-23-k6a-worker-isolation/`
**Verify verdict**: PASS
**Plan contract**: schema v1 (`archive-plan.json`)

## Summary

Hybrid archive (Plan-and-Report): the executor prepared four spec writes (one new domain `worker-isolation`, three modified: `kernel-contract-schemas`, `contract-lint`, `lifecycle-model-conformance`), four ADR promotions (`adr-001.md` through `adr-004.md`), and a full origin inventory fingerprint. Live writes to `openspec/specs/**` and `docs/adr/**`, the archive-folder move, and origin deletion are **pending** — owned by the deterministic archive transaction runtime (`node scripts/archive-transaction-run.js k6a-worker-isolation`).

The source directory `openspec/changes/k6a-worker-isolation/` **still exists** at report time.

## Verification Close Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS |
| CRITICAL issues | None |
| WARNING issues | None |
| Tasks complete | 32/32 (100%) |
| Test suite | 46/46 K6a tests passed, 2460+ full suite passed, 0 regressions |
| TDD compliance | 6/6 checks passed |
| Quality gates | Passed |

No warnings or risks required acceptance; all 16 requirements and 42 scenarios verified with `runtime-test` evidence.

## Specs Prepared (change-local)

| Domain | Action | Details |
|--------|--------|---------|
| worker-isolation | ADD | New domain baseline — delta is full spec (`prepared-specs/worker-isolation/spec.md`) |
| kernel-contract-schemas | MODIFIED | REQ-001 updated for K6a schema families; REQ-021 and REQ-022 added (`prepared-specs/kernel-contract-schemas/spec.md`) |
| contract-lint | MODIFIED | REQ-016 (CandidateId prohibition) and REQ-017 (capsule path containment) added (`prepared-specs/contract-lint/spec.md`) |
| lifecycle-model-conformance | MODIFIED | REQ-003 and REQ-004 updated for concrete worker structures; REQ-012 added for 6 executable worker invariants (`prepared-specs/lifecycle-model-conformance/spec.md`) |

### Baseline fingerprints (from target specs)

| Domain | target_before_sha256 |
|--------|----------------------|
| worker-isolation | `null` (new) |
| kernel-contract-schemas | `sha256:a6148443c7589df0838771d7a0a6f1208f9a92872df217a56814aa08f80966c4` |
| contract-lint | `sha256:68fc4c78c68a79a00e6e73eb3082ef670ce0758a42697bba9039296045206f2c` |
| lifecycle-model-conformance | `sha256:6e1a5e6dc704aa939f83ac214322a8ce86693a5e07092b707781cd457258bfc5` |

## ADR Promotions (runtime-owned commit)

| Source | Target |
|--------|--------|
| `decisions/adr-001.md` | `docs/adr/adr-20260823-003-strict-k3-identity-separation-workresult-without-candidateid.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260823-004-dual-phase-fail-closed-filesystem-containment.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260823-005-explicit-host-isolation-degradation-fallback.md` |
| `decisions/adr-004.md` | `docs/adr/adr-20260823-006-deterministic-capsule-construction-and-interruption-preservation.md` |

Change-local `decisions/` copies remain in the audit trail; live `docs/adr/` writes occur only when the runtime commits.

## Archive Inventory (plan summary)

Origin paths listed in `archive-plan.json` `archive_inventory[]` (19 entries at plan emission, excluding `archive-plan.json` from fingerprint identity):

- `apply-progress.md`
- `archive-report.md` (this report)
- `decisions/adr-001.md` … `adr-004.md`
- `design.md`
- `prepared-specs/contract-lint/spec.md`
- `prepared-specs/kernel-contract-schemas/spec.md`
- `prepared-specs/lifecycle-model-conformance/spec.md`
- `prepared-specs/worker-isolation/spec.md`
- `proposal.md`
- `specs/contract-lint/spec.md`
- `specs/kernel-contract-schemas/spec.md`
- `specs/lifecycle-model-conformance/spec.md`
- `specs/worker-isolation/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

`archive-plan.json` is emitted alongside this report and is copied by the runtime but excluded from `source_fingerprint` (self-hash avoidance).

## Archive Report Contents

| Artifact | Status |
|----------|--------|
| proposal.md | present |
| specs/ (4 delta domains + 4 prepared merges) | present |
| design.md | present |
| tasks.md | present (32/32 complete) |
| apply-progress.md | present |
| verify-report.md | present (PASS) |
| decisions/ (4 ADRs) | present |
| archive-plan.json | emitted (pending runtime) |

## Live Specs / ADR Commit Pending (runtime-owned)

Live `openspec/specs/**` and `docs/adr/**` writes are applied only by the archive transaction runtime during commit — not by this executor.

## Move Completion Pending (orchestrator-owned)

The source directory `openspec/changes/k6a-worker-isolation/` still exists. Closure authority requires a runtime success receipt from:

```text
node scripts/archive-transaction-run.js k6a-worker-isolation
```

Do not treat this report as proof that the archive move completed.

## Assumptions Carried

All key architectural assumptions documented and verified:
- `sdd-spec-001`: CandidateId strictly prohibited in K6a primitives, schemas, fixtures, and outputs (ADR-001).
- `sdd-design-001`: Dual-phase fail-closed filesystem containment with `containment-violation/v1` descriptor (ADR-002).
- `sdd-design-002`: Explicit host isolation degradation fallback without silent promotion to enforced (ADR-003).
- `sdd-design-003`: Deterministic capsule materialization and interrupted execution telemetry preservation (ADR-004).

## Follow-Up Work (non-blocking)

None. All 32 tasks and 42 scenarios fully satisfied.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k6a-worker-isolation/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
