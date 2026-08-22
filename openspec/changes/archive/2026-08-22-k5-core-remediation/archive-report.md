# Archive Report

**Change**: `k5-core-remediation`  
**Date**: 2026-08-22  
**Status**: verified → archiving  
**Archive Plan**: `openspec/changes/k5-core-remediation/archive-plan.json`  
**Planned Destination**: `openspec/changes/archive/2026-08-22-k5-core-remediation`  
**Verification Verdict**: `PASS` · **Full Suite**: 2396 passed / 0 failed / 2 skipped

---

## Executive Summary

El cambio `k5-core-remediation` ha completado exitosamente su ciclo de especificación, diseño, descomposición de tareas, implementación TDD estricta y verificación formal con veredicto **`PASS`** (2396/2396 tests pasando, 0 fallos, 0 regresiones, 31/31 escenarios cubiertos al 100% con evidencia de tipo `runtime-test`).

Este change solventa integralmente las 7 brechas técnicas identificadas en el núcleo del motor K5:
1. **Aislamiento multi-writer de tickets mid-op en AuthorityStore**: Sustitución del campo escalar `midOpTicket` por una colección `entry.midOpTickets = new Map()` indexada por token/revisión/digest, eliminando la sobreescritura destructiva de tickets en llamadas concurrentes a `commitJournal`.
2. **Controlled permit issuer estrictamente autoritativo**: Eliminación del fallback inseguro a `input.state`, exigiendo consulta exclusiva a un snapshot autoritativo de `AuthorityStore` (`store.snapshot()`) y fallando cerrado con `authoritative-snapshot-required`.
3. **Carry-over multidimensional runtime-owned exhaustivo**: Retención íntegra de las 6 dimensiones de nodo (`turns`, `commands`, `patches`, `changed_lines`, `wall_time_minutes`, `allowed_paths`) y 4 de autoridad (`effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`) ante `cas-conflict`, aplicando deducciones monótonas automáticamente en el siguiente reintento contra la revisión ganadora.
4. **Delimitación contractual de zero-delta**: Restricción de la penalización dual (`node.turns -= 1`, `authority_budget.effect_attempts -= 1` y evento `zero-delta-attempt`) exclusivamente a mutaciones de código estancadas (`reduced.outcome === "unchanged"` y 0 archivos/líneas modificadas), eximiendo transiciones legítimas de ciclo de vida, diagnósticos y operaciones de solo lectura.
5. **Mapeo fail-closed de routing tags desconocidos**: Modificación del caso por defecto de `mapLegacyRoutingTag()` para resolver a `category: "validation_gap"` y código `UNKNOWN_ROUTING_TAG`, prohibiendo transiciones de reparación ciegas (`repair`).
6. **Resolución determinista unificada `resolvePrimaryFailure()`**: Estandarización de la invocación de `resolvePrimaryFailure()` en selector de transiciones, controlled permit issuer y boundary de validación de operaciones con precedencia causal estricta (1: `environment_tooling` > 2: `cas_conflict` > 3: `ambiguous_effect` > 4: `validation_gap` > 5: `code_defect`).
7. **Consolidación atómica de transiciones terminales bajo agotamiento de presupuesto**: Commit atómico vía CAS de transiciones `escalate` y `stop` hacia el Authority Store incluso cuando las cuotas de nodo o autoridad están agotadas.

---

## Change Artifacts Inventory

- `proposal.md` ✅ (Alcance de 7 áreas de remediación K5, enfoque técnico y plan de rollback)
- `specs/` ✅ (4 dominios especificados con requerimientos delta normativos y escenarios GIVEN-WHEN-THEN)
  - `specs/execution-budgets/spec.md` (`REQ-execution-budgets-003`, `REQ-execution-budgets-004`)
  - `specs/failure-recovery/spec.md` (`REQ-failure-recovery-001`, `REQ-failure-recovery-002`, `REQ-failure-recovery-003`)
  - `specs/authority-store/spec.md` (`REQ-authority-store-003`, `REQ-authority-store-011`)
  - `specs/operation-permits/spec.md` (`REQ-operation-permits-005`)
- `design.md` ✅ (Arquitectura de datos, aislamiento multi-writer, carry-over 10D y diagramas de flujo)
- `decisions/` ✅ (6 ADRs arquitectónicos con contexto, alternativas y consecuencias)
  - `adr-001.md`: Multi-Writer Ticket Isolation in AuthorityStore
  - `adr-002.md`: Strict Fail-Closed Authoritative Controlled Permit Issuer
  - `adr-003.md`: Runtime-Owned Multidimensional Carry-Over Preservation
  - `adr-004.md`: Contractual Zero-Delta Scoped to Stagnant Code Mutations
  - `adr-005.md`: Fail-Closed Default Mapping to Validation Gap
  - `adr-006.md`: Unified Deterministic resolvePrimaryFailure
- `tasks.md` ✅ (5 fases, 17 tareas estructuradas en ciclo RED-GREEN-REFACTOR)
- `apply-progress.md` ✅ (17/17 tareas completadas al 100% con trazabilidad TDD)
- `verify-report.md` ✅ (Veredicto PASS, 31/31 escenarios conformes, 0 regresiones)
- `state.yaml` ✅ (Estado del workflow y resúmenes de fase actualizados)
- `archive-report.md` ✅ (Este documento)
- `archive-plan.json` ✅ (Plan transaccional schema v1 para el runtime)

---

## Trazabilidad Requerimiento → Tareas → Tests → Estado

| Requerimiento | Tareas | Commits | Tests de Validación | Estado |
|---|---|---|---|---|
| `REQ-execution-budgets-003` | 3.1, 3.2, 3.4, 4.1, 4.2, 4.3, 4.4, 5.2 | Working Tree | `scripts/k5-e2e-budgets-recovery.test.js`, `scripts/lib/lifecycle-kernel/index.test.js`, `scripts/lib/execution-budgets.test.js` | Conforme |
| `REQ-execution-budgets-004` | 3.1, 3.3, 3.4, 4.4 | Working Tree | `scripts/lib/lifecycle-kernel/index.test.js`, `scripts/lib/execution-budgets.test.js` | Conforme |
| `REQ-failure-recovery-001` | 1.1, 1.2, 1.3, 4.4, 5.1 | Working Tree | `scripts/lib/causal-failure.test.js` | Conforme |
| `REQ-failure-recovery-002` | 2.1, 2.2, 2.3, 2.4, 2.5, 4.4, 5.2 | Working Tree | `scripts/lib/k5-budgets-failures-recovery.test.js`, `scripts/lib/lifecycle-kernel/index.test.js`, `scripts/k5-e2e-budgets-recovery.test.js` | Conforme |
| `REQ-failure-recovery-003` | 2.1, 2.2, 2.3, 2.4, 4.4 | Working Tree | `scripts/lib/k5-budgets-failures-recovery.test.js`, `scripts/lib/lifecycle-kernel/index.test.js` | Conforme |
| `REQ-authority-store-003` | 1.4, 1.5, 1.6, 4.1, 4.2, 4.3, 4.4, 5.1 | Working Tree | `scripts/lib/authority-store/index.test.js`, `scripts/k5-e2e-budgets-recovery.test.js` | Conforme |
| `REQ-authority-store-011` | 1.4, 1.5, 1.6, 4.4 | Working Tree | `scripts/lib/authority-store/index.test.js` | Conforme |
| `REQ-operation-permits-005` | 2.1, 2.2, 2.5, 4.4, 5.1 | Working Tree | `scripts/lib/lifecycle-kernel/index.test.js` | Conforme |

---

## Verification Evidence Summary

- **Build / Sintaxis**: `node --check scripts/lib/causal-failure.js scripts/lib/authority-store/index.js scripts/lib/lifecycle-kernel/index.js scripts/lib/execution-budgets.js` completado con exit code 0.
- **Suite de pruebas**: `npm test` (`node --test scripts/**/*.test.js`) ejecutó **2396 pruebas exitosas**, 0 fallos y 2 skips condicionales preexistentes de entorno.
- **Suite focalizada K5**: 101/101 tests pasando en 136.8ms cubriendo suites unitarias, de integración y E2E concurrente multi-writer.
- **Evidencia de conformidad de especificación**: 31/31 escenarios validados al 100% mediante evidencia de tipo `runtime-test`.
- **Regresiones**: 0 detectadas en suites de fases previas (K1, K2, K2a, K3, K4a).

---

## Specs Prepared for Promotion

Las especificaciones han sido fusionadas semánticamente de manera local dentro del change en `specs/{domain}/spec.md` para su posterior promoción por el runtime transaccional:

| Dominio | Acción | Requerimientos Modificados |
|---|---|---|
| `execution-budgets` | Merge semántico preparado | `REQ-execution-budgets-003` (monotonicidad 10D en carry-over), `REQ-execution-budgets-004` (delimitación contractual de zero-delta) |
| `failure-recovery` | Merge semántico preparado | `REQ-failure-recovery-001` (default fail-closed de routing tags a validation gap), `REQ-failure-recovery-002` (resolución unificada resolvePrimaryFailure y commit CAS terminal), `REQ-failure-recovery-003` (matriz de recuperación allowlistada) |
| `authority-store` | Merge semántico preparado | `REQ-authority-store-003` (aislamiento multi-writer de tickets mid-op en Map), `REQ-authority-store-011` (commit atómico de CAS y ciclo de vida de tickets) |
| `operation-permits` | Merge semántico preparado | `REQ-operation-permits-005` (controlled permit issuer fail-closed exigiendo snapshot autoritativo) |

---

## Proposed ADR Promotions

Se proponen 6 registros de decisión arquitectónica para su promoción hacia `docs/adr/` con fecha ISO 2026-08-22:

1. `decisions/adr-001.md` → `docs/adr/adr-20260822-001-multi-writer-ticket-isolation-and-concurrent-mid-op-journal-management-in-authoritystore.md`
2. `decisions/adr-002.md` → `docs/adr/adr-20260822-002-strict-fail-closed-authoritative-controlled-permit-issuer-without-input-state-fallback.md`
3. `decisions/adr-003.md` → `docs/adr/adr-20260822-003-runtime-owned-multidimensional-carry-over-preservation-across-cas-conflicts.md`
4. `decisions/adr-004.md` → `docs/adr/adr-20260822-004-contractual-zero-delta-scoped-to-stagnant-effect-bearing-code-mutations.md`
5. `decisions/adr-005.md` → `docs/adr/adr-20260822-005-fail-closed-default-mapping-of-unknown-legacy-routing-tags-to-validation-gap.md`
6. `decisions/adr-006.md` → `docs/adr/adr-20260822-006-unified-deterministic-resolveprimaryfailure-across-components.md`

---

## Issues Finales

- **CRITICAL**: Ninguno
- **WARNING**: Ninguno
- **SUGGESTION**: Ninguno

---

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k5-core-remediation/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

---

## Plan-and-Report Status

- **Plan emitido**: `openspec/changes/k5-core-remediation/archive-plan.json` (schema v1, rollback `staging-rename`).
- **Escrituras vivas pendientes**: la promoción de especificaciones a `openspec/specs/**` y ADRs a `docs/adr/**` es aplicada exclusivamente por el runtime transaccional durante la fase de commit.
- **Movimiento de directorio pendiente**: el directorio activo `openspec/changes/k5-core-remediation/` permanece intacto en su ruta de trabajo. El orquestador invocará `node scripts/archive-transaction-run.js k5-core-remediation` y tratará el receipt JSON como la única autoridad de cierre.
