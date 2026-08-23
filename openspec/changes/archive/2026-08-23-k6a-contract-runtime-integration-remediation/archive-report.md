# Archive Report

**Change**: k6a-contract-runtime-integration-remediation
**Branch**: main
**Archive date (planned)**: 2026-08-23
**Planned destination**: `openspec/changes/archive/2026-08-23-k6a-contract-runtime-integration-remediation/`
**Verify verdict**: PASS
**Plan contract**: schema v1 (`archive-plan.json`)

## Summary

Hybrid archive (Plan-and-Report): the executor prepared four spec writes (`worker-isolation`, `kernel-contract-schemas`, `contract-lint`, `lifecycle-model-conformance`), five ADR promotions (`adr-001.md` through `adr-005.md`), and a full origin inventory fingerprint. Live writes to `openspec/specs/**` and `docs/adr/**`, the archive-folder move, and origin deletion are **pending** — owned by the deterministic archive transaction runtime (`node scripts/archive-transaction-run.js k6a-contract-runtime-integration-remediation`).

The source directory `openspec/changes/k6a-contract-runtime-integration-remediation/` **still exists** at report time.

## Verification Close Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS (20/20 scenarios at 100% `runtime-test`) |
| CRITICAL issues | None (0 BLOCKER, 0 CRITICAL, 0 WARNING, 0 SUGGESTION) |
| Tasks complete | 26/26 |
| Tests Execution | 2472 passed / 0 failed / 2 skipped (100% passing) |

## Specs Prepared (change-local)

| Domain | Action | Details |
|--------|--------|---------|
| worker-isolation | MODIFIED | REQ-worker-isolation-001 through 006 modified with private workspace registry tracking, capsule_inputs projection decoupled from DAG dependency IDs, mutation delta calculation against baselineInventory, async invokeTransportAsync execution with AbortSignal, WorkResult unified diff with computeWorkResultId delegation, and interrupted recovery; REQ-007 and REQ-008 preserved (`prepared-specs/worker-isolation/spec.md`) |
| kernel-contract-schemas | MODIFIED | REQ-kernel-contract-schemas-021 modified supporting decoupled capsule_inputs alongside SHA-256 WorkOrderId dependencies; REQ-001 through REQ-020, REQ-022 preserved (`prepared-specs/kernel-contract-schemas/spec.md`) |
| contract-lint | MODIFIED | REQ-contract-lint-018 added (Worker Isolation Canonical Contract Checker); REQ-001 through REQ-017, Cross-References, and Clarifications preserved (`prepared-specs/contract-lint/spec.md`) |
| lifecycle-model-conformance | MODIFIED | REQ-lifecycle-model-conformance-012 modified checking 6 executable K6a invariants with private registry tracking, mutation delta evaluation, async transport, and AbortSignal cancellation; REQ-001 through REQ-011 preserved (`prepared-specs/lifecycle-model-conformance/spec.md`) |

### Baseline Fingerprints

| Domain | Target |
|--------|--------|
| worker-isolation | `openspec/specs/worker-isolation/spec.md` |
| kernel-contract-schemas | `openspec/specs/kernel-contract-schemas/spec.md` |
| contract-lint | `openspec/specs/contract-lint/spec.md` |
| lifecycle-model-conformance | `openspec/specs/lifecycle-model-conformance/spec.md` |

## ADR Promotions (runtime-owned commit)

| Source | Target |
|--------|--------|
| `decisions/adr-001.md` | `docs/adr/adr-20260823-007-desacoplamiento-de-capsule-inputs-de-dependencias-dag-y-materializacion-canonica.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260823-008-delegacion-estricta-de-identidad-criptografica-de-workresult-en-execution-identities.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260823-009-integracion-asincrona-con-workertransport-y-resolvecapabilitystate-con-fallback-seguro.md` |
| `decisions/adr-004.md` | `docs/adr/adr-20260823-010-registro-privado-de-workspaces-y-blindaje-de-symlinks-en-jerarquias-no-instanciadas.md` |
| `decisions/adr-005.md` | `docs/adr/adr-20260823-011-captura-de-baselineinventory-validacion-sobre-mutation-delta-y-diff-unified-verificable.md` |

Change-local `decisions/` copies remain in the audit trail; live `docs/adr/` writes occur only when the archive transaction runtime commits.

## Archive Inventory (plan summary)

Origin paths listed in `archive-plan.json` `archive_inventory[]` (20 entries at plan emission, excluding `archive-plan.json` from fingerprint identity):

- `apply-progress.md`
- `archive-report.md` (this report)
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `decisions/adr-003.md`
- `decisions/adr-004.md`
- `decisions/adr-005.md`
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
| proposal.md | present ✅ |
| specs/ (4 delta specs) | present ✅ |
| prepared-specs/ (4 prepared merges) | present ✅ |
| design.md | present ✅ |
| tasks.md | present ✅ (26/26 complete) |
| apply-progress.md | present ✅ |
| verify-report.md | present ✅ (PASS) |
| decisions/ (5 ADRs) | present ✅ |
| archive-report.md | present ✅ |
| archive-plan.json | emitted (pending runtime) |

## Live Specs / ADR Commit Pending (runtime-owned)

Live `openspec/specs/**` and `docs/adr/**` writes are applied only by the archive transaction runtime during commit — not by this executor.

## Move Completion Pending (orchestrator-owned)

The source directory `openspec/changes/k6a-contract-runtime-integration-remediation/` still exists. Closure authority requires a runtime success receipt from:

```text
node scripts/archive-transaction-run.js k6a-contract-runtime-integration-remediation
```

Do not treat this report as proof that the archive move completed.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k6a-contract-runtime-integration-remediation/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
