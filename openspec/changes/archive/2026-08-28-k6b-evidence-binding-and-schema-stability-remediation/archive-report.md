# Archive Report: K6b Evidence Binding and Schema Stability Remediation

**Change**: `k6b-evidence-binding-and-schema-stability-remediation`
**Date**: 2026-08-28
**Status**: Ready for Archive Transaction Commit (Plan-and-Report)
**Verification Verdict**: `PASS` (0 critical issues, 0 warnings, 0 suggestions)

---

## Executive Summary

El cambio `k6b-evidence-binding-and-schema-stability-remediation` implementa la remediación integral de la estabilidad de esquemas del kernel, la vinculación autoritativa de evidencias y la proyección determinista del Assurance Graph. 

Principales hitos completados y validados:
1. **Esquemas Kernel v2/v1**: Publicación formal de `assessment/v2.schema.json` con `evidence_requirements_satisfied` obligatorio (`minItems: 1`) y restauración retrocompatible de `assessment/v1.schema.json` al contrato v2.51.0. Congelamiento estricto de bytes para `evidence/v2`, `verification/v2` y `K1_SCHEMA_BASELINE`.
2. **Frontera de Confianza y Matriz de Incompatibilidad de Roles**: Desacoplamiento estricto de observaciones físicas (`rawEvidence` con `execution_sequence`) respecto a metadatos semánticos derivados por el verifier (`role`, `obligation_ids`, cobertura). Aplicación de la matriz de incompatibilidad de roles (`red` ↔ `green`, `characterization-before` ↔ `characterization-after`, `negative` ↔ `acceptance`) y validación de secuencias cronológicas.
3. **Assurance Graph y Replay v2**: Validación fail-closed de `openspec_input_digest` en `resolveCanonicalInputDigests()`, proyección condicional de aristas `satisfies` condicionadas a `evidence_requirements_satisfied.length > 0`, y replay exhaustivo validando esquemas, digests de contenido e identidades recomputadas.

---

## Verification & Quality Gates Summary

- **Verdict**: `PASS`
- **Tasks Complete**: 18 / 18 (100%)
- **Scenarios Satisfied**: 39 / 39 (100% de cumplimiento en matriz de trazabilidad)
- **Focal Automated Tests**: 93 passed / 0 failed
- **Repository Suite (`npm test`)**: Exit code 0
- **Contract Lint**: 0 offenders
- **Accepted Warnings**: Ninguno (0 warnings)

---

## Merged Specifications Summary (Change-Local Preparation)

Se prepararon las siguientes especificaciones principales integrando los deltas del cambio sobre las especificaciones maestras correspondientes:

| Domain | Action | Requirements Modified / Preserved | Status |
|--------|--------|-----------------------------------|--------|
| `kernel-contract-schemas` | Prepared (Merged) | `REQ-kernel-contract-schemas-027` actualizado (publicación v2 / restore v1); REQ-001 a REQ-026 preservados intactos. | ✅ Ready for runtime commit |
| `independent-verification` | Prepared (Merged) | `REQ-independent-verification-003`, `005`, `006` actualizados (desacoplamiento rawEvidence, cobertura MUST minItems: 1, matriz de roles y secuencias); REQ-001, 002, 004, 007, 008 preservados. | ✅ Ready for runtime commit |
| `assurance-graph` | Prepared (Merged) | `REQ-assurance-graph-002`, `006`, `007` actualizados (satisfies condicional, replay exhaustivo, digest canónico); REQ-001, 003, 004, 005, 008 preservados. | ✅ Ready for runtime commit |

---

## Proposed ADR Promotions

Se proponen las siguientes decisiones arquitectónicas para ser promovidas a `docs/adr/` durante la ejecución de la transacción de archivo:

| Source | Proposed Target | Title |
|--------|-----------------|-------|
| `decisions/adr-001.md` | `docs/adr/adr-20260828-004-publicacion-assessment-v2-restauracion-retrocompatible-assessment-v1.md` | Publicación de assessment/v2.schema.json y Restauración Retrocompatible de assessment/v1 |
| `decisions/adr-002.md` | `docs/adr/adr-20260828-005-separacion-frontera-confianza-observacion-fisica-metadatos-semanticos.md` | Separación de Frontera de Confianza entre Observación Física y Metadatos Semánticos Derivados |
| `decisions/adr-003.md` | `docs/adr/adr-20260828-006-validacion-fail-closed-digest-canonico-replay-integral-proyeccion-condicional.md` | Validación Fail-Closed de Digest Canónico, Replay Integral de Evidencias/Verificaciones y Proyección Condicional en Assurance Graph |

---

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k6b-evidence-binding-and-schema-stability-remediation/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

---

## Change Inventory

- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `decisions/adr-003.md`
- `design.md`
- `proposal.md`
- `specs/assurance-graph/spec.md`
- `specs/independent-verification/spec.md`
- `specs/kernel-contract-schemas/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

---

## Archive Transaction & Closure Authority

1. Este reporte y el plan `archive-plan.json` han sido emitidos bajo el protocolo **Plan-and-Report**.
2. Las escrituras finales en `openspec/specs/**` y `docs/adr/**`, así como el traslado de la carpeta activa a `openspec/changes/archive/2026-08-28-k6b-evidence-binding-and-schema-stability-remediation` y la eliminación del directorio origen, son ejecutadas exclusivamente por el runtime determinista de transacción:
   ```bash
   node scripts/archive-transaction-run.js k6b-evidence-binding-and-schema-stability-remediation
   ```
3. El recibo exitoso generado por dicho script es la única autoridad de cierre para el cambio.
