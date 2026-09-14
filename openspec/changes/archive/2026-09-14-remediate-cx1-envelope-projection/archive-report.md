# Archive Report

**Change**: remediate-cx1-envelope-projection
**Branch**: fix/remediate-cx1-envelope-projection
**Archive date (planned)**: 2026-09-14
**Planned destination**: `openspec/changes/archive/2026-09-14-remediate-cx1-envelope-projection/`
**Verify verdict**: PASS (0 failures, 0 warnings)
**Plan contract**: schema v1 (`archive-plan.json`)

## Summary

Plan-and-Report archive for `remediate-cx1-envelope-projection`: the executor prepared four spec writes (all modified domains: `hooks`, `kernel-contract-schemas`, `lifecycle-kernel-runtime`, and `skills`), three ADR promotions, and the full origin inventory fingerprint.
Live writes to `openspec/specs/**` and `docs/adr/**`, the archive-folder commit, and origin deletion are **pending** — owned by the deterministic archive transaction runtime (`node scripts/archive-transaction-run.js remediate-cx1-envelope-projection`).

The source directory `openspec/changes/remediate-cx1-envelope-projection/` **still exists** at report time.

## Verification Close Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS |
| CRITICAL issues | None (0) |
| WARNING issues | None (0) |
| SUGGESTION issues | None (0) |
| Tasks complete | 25/25 (100%) |
| Test Suites Passed | 3472 passed / 0 failed / 0 skipped |
| Full Repo `npm test` | 3331 passed (code 0) |
| Go Subpackages Test | Passed (`./internal/resultenvelope/...`, `./internal/hooks/...`) |

## Specs Prepared (change-local)

| Domain | Action | Details | Prepared Source |
|--------|--------|---------|-----------------|
| `hooks` | MODIFIED | REQ-hooks-015 actualizado con conexión de fallback a `adaptLegacyEnvelope` y fail-closed en `sdd-spec` | `specs/hooks/spec-prepared.md` |
| `kernel-contract-schemas` | MODIFIED | REQ-kernel-contract-schemas-031 extendido con `verify_outcome`, validación de items string, enum cerrado de `skill_resolution` y fixtures | `specs/kernel-contract-schemas/spec-prepared.md` |
| `lifecycle-kernel-runtime` | MODIFIED | REQ-lifecycle-kernel-028 actualizado con gating de `verify_outcome` explícito para proyectar `status: verified` | `specs/lifecycle-kernel-runtime/spec-prepared.md` |
| `skills` | MODIFIED | REQ-skills-018 actualizado con emisión obligatoria de `verify_outcome` en `sdd-verify` y paridad estricta JS/Go | `specs/skills/spec-prepared.md` |

### Baseline & Target Fingerprints

| Domain | target_before_sha256 | content_sha256 (prepared) |
|--------|----------------------|---------------------------|
| `hooks` | `sha256:a93245bf789fb917cc0e0035b8630b180d0c14983adbf77c65692bbfa5b86ac5` | `sha256:de27332cdc972c073a79bc56a8ba93709cc1361b99057e722f49e426ee7f6176` |
| `kernel-contract-schemas` | `sha256:c4ec76523d87a772e9f068aae0b91a626a9ef2746c3c19ef34cf0d0a8857e402` | `sha256:3aebe40cd3bcdfb41d7f76a96318bfe4c5779239a68d1daaf57cb1247e7d9dd8` |
| `lifecycle-kernel-runtime` | `sha256:8b6eaac671b95fc9cca0de41e190137371cf16e0a136c931c2fb34cc1b91528c` | `sha256:128d3669690403e48eb09c567f0ce7160f14cb56c32890176d8a15713117f076` |
| `skills` | `sha256:644c6065a9a8e631a19f3a0564bac2b32ddd431248080c0b9bbf77fa4f6dfe1b` | `sha256:e1294acb00494035077ba9fa39b8d04f4f0360eb22d03cc3f0dd070bd905b530` |

## ADR Promotions (runtime-owned commit)

| Source | Target | content_sha256 |
|--------|--------|----------------|
| `decisions/adr-001.md` | `docs/adr/adr-20260914-001-conexion-de-fallback-legacy-en-subagentstop-con-preservacion-fail-closed-para-sdd-spec.md` | `sha256:396153d63093fb13d5e31c325ca74438f1597bd69dfde9526d0b3ce56851585d` |
| `decisions/adr-002.md` | `docs/adr/adr-20260914-002-contrato-canonico-de-verify-outcome-y-gating-estricto-en-phasecompletionreducer.md` | `sha256:a4f9c32071ff46ccbb4719d805fec584b1179a29e405eee0cc0eaa4fb6fa5e9c` |
| `decisions/adr-003.md` | `docs/adr/adr-20260914-003-paridad-estricta-de-esquemas-y-validadores-entre-json-schema-v1-js-y-go.md` | `sha256:3b55172414779688b0f10528ec333370a961fa9c39d3468f2b52a7ee95615215` |

Change-local copies in `decisions/` remain in the audit trail; live `docs/adr/` writes occur only when the runtime commits.

## Archive Inventory (plan summary)

Origin paths listed in `archive-plan.json` `archive_inventory[]`:
- `apply-progress.md`
- `archive-report.md` (este reporte)
- `design.md`
- `proposal.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `decisions/adr-003.md`
- `specs/hooks/spec.md`
- `specs/hooks/spec-prepared.md`
- `specs/kernel-contract-schemas/spec.md`
- `specs/kernel-contract-schemas/spec-prepared.md`
- `specs/lifecycle-kernel-runtime/spec.md`
- `specs/lifecycle-kernel-runtime/spec-prepared.md`
- `specs/skills/spec.md`
- `specs/skills/spec-prepared.md`

`archive-plan.json` se emitirá junto a este reporte y será copiado por el runtime pero se excluye de `source_fingerprint` para evitar dependencias cíclicas de hash.

## Archive Report Contents

| Artifact | Status |
|----------|--------|
| proposal.md | Presente |
| specs/ (4 deltas + 4 prepared merges) | Presente |
| design.md | Presente |
| tasks.md | Presente (25/25 completos) |
| apply-progress.md | Presente |
| verify-report.md | Presente (veredicto PASS) |
| decisions/ (3 ADRs) | Presente |
| archive-report.md | Persistido |
| archive-plan.json | En emisión (pendiente de ejecución por runtime) |

## Live Specs / ADR Commit Pending (runtime-owned)

Las escrituras vivas en `openspec/specs/**` y `docs/adr/**` son aplicadas únicamente por el runtime de la transacción de archivo durante el commit — no por este ejecutor.

## Move Completion Pending (orchestrator-owned)

El directorio de origen `openspec/changes/remediate-cx1-envelope-projection/` aún existe. La autoridad de cierre requiere un comprobante de éxito emitido por:

```bash
node scripts/archive-transaction-run.js remediate-cx1-envelope-projection
```

No considerar este informe como prueba de que el movimiento de archivo ha finalizado.

## Cost

No per-phase cost data was recorded for this change (`.ospec/session/remediate-cx1-envelope-projection/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
