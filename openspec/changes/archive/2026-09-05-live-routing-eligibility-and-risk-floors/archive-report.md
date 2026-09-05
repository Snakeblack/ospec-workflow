# Archive Report: Live Routing Eligibility and Risk Floors

**Change**: `live-routing-eligibility-and-risk-floors`  
**Date**: 2026-09-05  
**Status**: Ready for Archive Transaction Commit (Plan-and-Report)  
**Verification Verdict**: `PASS` (0 critical issues, 0 warnings, 0 suggestions)

---

## Executive Summary

El cambio `live-routing-eligibility-and-risk-floors` aborda y resuelve de raíz el problema de sobrerrepresentación y sombreado de la ruta `standard` sobre `lite` en proyectos activos (`project.status: active`), conectando a la vez los pisos de riesgo no degradables de K1 (`critical`, `planned`, `bounded`, `repair`, `direct`) con el motor de despacho vivo de rutas en tiempo de ejecución:

1. **Normalización Determinista de Señales y Resolución Fail-Closed**:
   - Reconciliación de señales de contexto (`ctx.classification` vs `ctx["change.classification"]`) en `scripts/lib/route-dispatcher.js`.
   - Si ambas señales están presentes y discrepan, se lanza de forma determinista `ClassificationConflictError` (`ERR_CLASSIFICATION_CONFLICT`) deteniendo el flujo fail-closed sin evaluar condiciones ambiguas.

2. **Filtrado de Elegibilidad de Rutas por Metadatos de Clasificación**:
   - `isRouteEligible` evalúa si la clasificación resuelta está permitida en la lista declarada `route.classification` antes de evaluar `route.conditions`.
   - En repositorios activos, `standard` (`[normal, high-risk]`) queda descalificado para cambios `trivial` o `small`, permitiendo que `lite` (`[trivial, small]`) sea seleccionado de manera segura.

3. **Conexión de Pisos de Riesgo K1 (`FLOOR_GUARANTEES`) al Despacho Vivo**:
   - Los pisos de impacto basados en evidencia (`auth_security`, `data_migration`, `public_api`) imponen garantías mínimas inmutables de aseguramiento.
   - Ni un tamaño pequeño (LOC / conteo de archivos) ni la intención explícita de `hotfix` o `bugfix` pueden degradar un piso duro de impacto.
   - Cambios con impacto crítico o planificado elevan automáticamente a `standard`, garantizando cobertura completa de fases SDD (propose, spec, design, tasks, apply, verify, archive).

4. **Preservación de Precedencia Contextual y Orden de Tabla Declarado**:
   - Las rutas contextuales (`foundation`, `federated`, `brownfield`) mantienen su precedencia de evaluación ante cualquier cambio eligible.
   - Entre rutas de cambio general o personalizadas, se preserva rigurosamente el orden declarado en `openspec/config.yaml` bajo semántica first-match.

5. **Invarianza de Ruta en Continuación y Puerta Bloqueante ante Violaciones Tardías**:
   - Cuando se reanuda un cambio en curso (`persistedRoute` / `route.actual_route`), se bloquea la ruta persistida sin recalcular la tabla ni degradar el flujo.
   - Si durante la implementación o verificación emerge evidencia tardía que viola las garantías del piso de la ruta activa, el despachador se detiene inmediatamente con `status: blocked` y `blocker_type: needs_user_decision`.

---

## Verification & Quality Gates Summary

- **Verdict**: `PASS`
- **Tasks Complete**: 16 / 16 (100%)
- **Delta Scenarios Satisfied**: 19 / 19 (100% de cumplimiento con evidencia `runtime-test`)
- **Automated Tests**:
  - Suite focal: 151/151 tests passed (`scripts/lib/route-dispatcher.test.js`, `scripts/lib/change-classification.test.js`, `scripts/configure/real-repo.test.js`)
  - Suite completa del repositorio (`npm test`): 3,204 tests passed, validadores y transformadores sin fallos
- **Strict TDD Compliance**: 5 fases completadas (RED, GREEN, TRIANGULATE, REFACTOR verificadas)
- **Accepted Warnings**: Ninguno (0 warnings, 0 blockers)

---

## Merged Specifications Summary (Change-Local Preparation)

Se prepararon y fusionaron las especificaciones normativas a nivel local del cambio bajo `specs/` con retención total de identificadores de requisitos (`{#REQ-...}`):

| Domain | Action | Requirements Modified / Added | Status |
|---|---|---|---|
| `routing` | Prepared (Merged) | Actualizado: Tabla canonical en §4.1 (`foundation`, `federated`, `brownfield` expandidos a `[trivial, small, normal, high-risk]`; `lite` condicionado a `project.status: active`). Agregados: `REQ-routing-012` (normalización de señales y filtrado de elegibilidad), `REQ-routing-013` (conexión de pisos K1 y precedencia contextual), `REQ-routing-014` (invarianza de continuación y puerta bloqueante). Preservados: `REQ-routing-001` a `REQ-routing-011` y secciones §1 a §18 íntegras. | ✅ Ready for runtime commit (`openspec/specs/routing/spec.md`) |
| `change-classification` | Prepared (Merged) | Modificado: `REQ-change-classification-003` (conexión de pisos duros al despacho vivo y protección contra degradación por hotfix intent o LOC). Agregado: `REQ-change-classification-004` (mapeo determinista de garantías de piso `critical`, `planned`, `bounded`, `repair`, `direct`). Preservados: `REQ-change-classification-001` y `REQ-change-classification-002`. | ✅ Ready for runtime commit (`openspec/specs/change-classification/spec.md`) |

---

## Proposed ADR Promotions

Se proponen 4 decisiones arquitectónicas para su promoción formal a `docs/adr/` durante la ejecución de la transacción de archivo:

| Source | Proposed Target | Title |
|---|---|---|
| `decisions/adr-001.md` | `docs/adr/adr-20260905-007-deterministic-signal-normalization-and-fail-closed-conflict-handling.md` | Deterministic Signal Normalization and Fail-Closed Conflict Handling |
| `decisions/adr-002.md` | `docs/adr/adr-20260905-008-pre-evaluation-route-eligibility-filtering-via-route-metadata.md` | Pre-Evaluation Route Eligibility Filtering via Route Metadata |
| `decisions/adr-003.md` | `docs/adr/adr-20260905-009-bridging-k1-impact-risk-floors-to-live-route-dispatch.md` | Bridging K1 Impact Risk Floors to Live Route Dispatch |
| `decisions/adr-004.md` | `docs/adr/adr-20260905-010-continuation-route-decision-invariance-and-blocker-gate.md` | Continuation Route Decision Invariance and Blocker Gate |

---

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/live-routing-eligibility-and-risk-floors/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

---

## Change Inventory

El inventario de origen del cambio a preservar en el archivo histórico comprende 13 artefactos (excluyendo el plan autoreferencial `archive-plan.json`):

- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `decisions/adr-003.md`
- `decisions/adr-004.md`
- `design.md`
- `proposal.md`
- `specs/change-classification/spec.md`
- `specs/routing/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

---

## Archive Transaction & Closure Authority

1. Este reporte y el plan `archive-plan.json` han sido emitidos bajo el protocolo **Plan-and-Report**.
2. Ni este ejecutor ni el sub-agente realizan escrituras directas sobre `openspec/specs/**` o `docs/adr/**`, ni trasladan o eliminan el directorio activo de trabajo.
3. El orquestador ejecuta la transacción determinista llamando al runtime:
   ```bash
   node scripts/archive-transaction-run.js live-routing-eligibility-and-risk-floors
   ```
   (precedido opcionalmente por `node .ospec/sync-archive-plan-hashes.js live-routing-eligibility-and-risk-floors` para sincronización de digestión criptográfica).
4. El recibo estructurado (`receipt.json`) con `outcome: "success"` emitido por el runtime es la única autoridad formal de cierre del cambio.
