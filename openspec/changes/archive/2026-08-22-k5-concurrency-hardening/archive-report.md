# Archive Report

**Change**: k5-concurrency-hardening
**Branch**: main
**Archive date (planned)**: 2026-08-22
**Planned destination**: `openspec/changes/archive/2026-08-22-k5-concurrency-hardening/`
**Verify verdict**: PASS
**Plan contract**: schema v1 (`archive-plan.json`)

## Summary

Hybrid archive (Plan-and-Report): the executor prepared four spec writes (`authority-store`, `execution-budgets`, `failure-recovery`, `operation-permits`), six ADR promotions (`adr-001.md` through `adr-006.md`), and a full origin inventory fingerprint. Live writes to `openspec/specs/**` and `docs/adr/**`, the archive-folder move, and origin deletion are **pending** — owned by the deterministic archive transaction runtime (`node scripts/archive-transaction-run.js k5-concurrency-hardening`).

The source directory `openspec/changes/k5-concurrency-hardening/` **still exists** at report time.

## Verification Close Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS (32/32 MUST scenarios at 100% `runtime-test`) |
| CRITICAL issues | None (0 CRITICAL, 0 WARNING, 0 SUGGESTION) |
| Tasks complete | 19/19 |
| Tests Execution | 118 passed / 0 failed / 0 skipped (100% passing) |

## Specs Prepared (change-local)

| Domain | Action | Details |
|--------|--------|---------|
| authority-store | MODIFIED | REQ-authority-store-003 modificado para exigir merge-safe upsert por `effect_id` en `commitJournal` y eliminación exclusiva del ticket ganador (`entry.midOpTickets.delete(winner)`) preservando tickets de peers; REQ-authority-store-011 modificado con deduplicación y merge atómico de journal por `effect_id` y ciclo de vida de tickets (`prepared-specs/authority-store/spec.md`) |
| execution-budgets | MODIFIED | REQ-execution-budgets-003 modificado para ownership exclusivo de `ExecutionUsage` desde `result.usage`/`result.execution_usage`, purga de `input.consumed` y particionado de carry-over por `${subjectId}:${nodeId}`; REQ-execution-budgets-004 modificado delimitando zero-delta estrictamente a mutaciones de código estériles con `effectProgress === false` (`prepared-specs/execution-budgets/spec.md`) |
| failure-recovery | MODIFIED | REQ-failure-recovery-002 modificado integrando `resolvePrimaryFailure` unificado en `host-boundary.js` y consolidación CAS de transiciones terminales bajo agotamiento; REQ-failure-recovery-003 modificado con matriz allowlisted estricta y normalización causal homogénea (`prepared-specs/failure-recovery/spec.md`) |
| operation-permits | MODIFIED | REQ-operation-permits-005 modificado con emisor controlado que consulta snapshot autoritativo de Authority Store, validación de presupuesto particionado por `${subjectId}:${nodeId}` y chequeo de matriz causal (`prepared-specs/operation-permits/spec.md`) |

### Baseline Fingerprints

| Domain | target_before_sha256 |
|--------|----------------------|
| authority-store | `sha256:fe191fe3b32dd13b28004b1da65f56d8a5a601614723d2344c7b8c201384fa21` |
| execution-budgets | `sha256:7550a9e0d228d8fc9fefe2824be029f1d2df2147d13bfa781f5b70f21f9db2fd` |
| failure-recovery | `sha256:6fd07d83ae575961b2812230a71394a016bdd8bb889369ee6409827197ea27bf` |
| operation-permits | `sha256:906499a69b10836eb703b7eec21b99cfd06a06b7d355922c6b42134091280db4` |

## ADR Promotions (runtime-owned commit)

| Source | Target |
|--------|--------|
| `decisions/adr-001.md` | `docs/adr/adr-20260822-007-runtime-executor-owned-executionusage-interface-and-purge-of-caller-fabricated-input-consumed.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260822-008-keyed-carry-over-partitioning-by-subjectid-nodeid-for-concurrent-node-isolation.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260822-009-merge-safe-journal-upsert-by-effect-id-and-peer-mid-op-ticket-preservation-in-authoritystore.md` |
| `decisions/adr-004.md` | `docs/adr/adr-20260822-010-zero-re-execution-guarantee-and-side-effect-deduplication-via-journal-replay.md` |
| `decisions/adr-005.md` | `docs/adr/adr-20260822-011-contractual-zero-delta-scoped-to-stagnant-effect-bearing-code-mutations.md` |
| `decisions/adr-006.md` | `docs/adr/adr-20260822-012-unified-causal-failure-normalization-in-host-boundary-via-resolveprimaryfailure.md` |

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
- `design.md`
- `prepared-specs/authority-store/spec.md`
- `prepared-specs/execution-budgets/spec.md`
- `prepared-specs/failure-recovery/spec.md`
- `prepared-specs/operation-permits/spec.md`
- `proposal.md`
- `specs/authority-store/spec.md`
- `specs/execution-budgets/spec.md`
- `specs/failure-recovery/spec.md`
- `specs/operation-permits/spec.md`
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
| tasks.md | present ✅ (19/19 complete) |
| apply-progress.md | present ✅ |
| verify-report.md | present ✅ (PASS) |
| decisions/ (6 ADRs) | present ✅ |
| archive-report.md | present ✅ |
| archive-plan.json | emitted (pending runtime) |

## Live Specs / ADR Commit Pending (runtime-owned)

Live `openspec/specs/**` and `docs/adr/**` writes are applied only by the archive transaction runtime during commit — not by this executor.

## Move Completion Pending (orchestrator-owned)

The source directory `openspec/changes/k5-concurrency-hardening/` still exists. Closure authority requires a runtime success receipt from:

```text
node scripts/archive-transaction-run.js k5-concurrency-hardening
```

Do not treat this report as proof that the archive move completed.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k5-concurrency-hardening/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
