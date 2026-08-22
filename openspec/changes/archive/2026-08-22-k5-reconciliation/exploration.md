# Exploración — k5-reconciliation

**Change:** k5-reconciliation · **Ruta:** bugfix · **Fase:** sdd-explore · **Fecha:** 2026-08-22

## Problema

Las auditorías de código y artefactos detectaron cuatro focos de deuda de cierre en el subsistema K5 (budgets/failures/recovery), todos verificados en este cambio:

1. **Defecto A2 — clasificación causal silenciosa incorrecta.** `mapLegacyRoutingTag` no mapea los tags literales del roadmap (`code-bug`, `tasks-gap`, `design-gap`, `spec-gap`), que caen al default silencioso `code_defect/UNKNOWN_FAILURE_CODE`. Esto es contrario al principio fail-closed del kernel: inputs conocidos se clasifican erróneamente sin señal alguna, distorsionando la resolución de prioridad causal (`resolvePrimaryFailure`) y el routing de recuperación.
2. **Test débil B.** El test E2E "Monotonic budget non-inflation after CAS race retries" hace `snapshot()` sin asertar presupuestos ni ejercitar conflicto CAS real. La cobertura efectiva vive en otro archivo cuyo matcher acepta 4 códigos alternativos en vez de fijar `cas-conflict`.
3. **Deuda documental C.** Estado de archivado inconsistente (`archive-planned` vs `archived`), conteo de tareas contradictorio (28≠31) y fila K5 del roadmap única entre las `done` sin versión de publicación.
4. **Gap de gobernanza D.** Ninguno de los 4 changes K5 registró gate 4R. Este change debe ejecutarlo formalmente tras su propio apply/verify (restricción del plan, ver sección Restricciones).

## Evidencia

### A2 — Taxonomía causal

| Ítem | Ruta | Detalle |
| --- | --- | --- |
| Firma actual | `scripts/lib/causal-failure.js:55` | `function mapLegacyRoutingTag(legacyTag)` → `{ category, code }` |
| Casos mapeados | `scripts/lib/causal-failure.js:57-82` | `spec`, `design`, `tasks`, `code`, `evidence-format` |
| Default silencioso | `scripts/lib/causal-failure.js:83-88` | `CODE_DEFECT / "UNKNOWN_FAILURE_CODE"` |
| Tags guionados sin puente | `scripts/lib/strict-tdd-evidence-remediation.js:7` | `ALLOWED_ORIGINS = Object.freeze(["spec-gap", "design-gap", "tasks-gap", "code-bug"])`; usado en líneas 343 y 351 |
| Contrato declarado (incumplido) | `docs/architecture/harness-evolution.md:582` | Afirma que los tags históricos "se mapean deterministamente mediante `mapLegacyRoutingTag`" — el código NO lo hace |
| Cobertura de test existente | `scripts/lib/causal-failure.test.js:47-68` | Solo cubre los 5 tags actuales; ningún caso para los guionados |

### B — Test E2E débil

| Ítem | Ruta | Detalle |
| --- | --- | --- |
| Test débil | `scripts/k5-e2e-budgets-recovery.test.js:171-182` | Declara budgets `{attempts: 3, corrections: 2, turns: 10}`, llama `getStatus`, luego `runtime.snapshot()` y solo aserta `assert.ok(initialSnap)`. Sin conflicto CAS, sin asertos de presupuesto |
| Cobertura real | `scripts/lib/lifecycle-kernel/index.test.js:776-825` | "CAS conflict after effects does not inflate budgets"; aserta presupuestos intactos en línea 824 |
| Matcher laxo | `scripts/lib/lifecycle-kernel/index.test.js:823` | Acepta `stale-permit \|\| invalid-transition \|\| cas-conflict \|\| permit-not-runtime-issued` en vez de fijar `cas-conflict` |

### C — Deuda documental

| Ítem | Ruta | Detalle |
| --- | --- | --- |
| Estado de archivado | `openspec/changes/archive/2026-08-20-k5-authoritative-enforcement-and-cas-remediation/state.yaml:2` | `status: "archive-planned"` → debe ser `archived` |
| Conteo de tareas | mismo change: `apply-progress.md:57` (`"tasks_completed": 28`) y `state.yaml:46` ("28 tareas") vs `tasks.md` | `tasks.md` contiene 31 checkboxes `- [ ]` — discrepancia 28≠31 |
| Fila K5 del roadmap | `docs/roadmaps/harness-evolution.md:78` | Única fila `done` sin versión de publicación (K4a en línea 77 cita v2.45.7). Debe citar v2.45.10 y los changes v2.45.7→v2.45.10. Verificado: `package.json`, `.plugin.json`, `.claude-plugin/plugin.json` = 2.45.10; CHANGELOG tiene secciones [2.45.7]…[2.45.10] |

### D — Gobernanza

Los 4 changes K5 archivados (`2026-08-17-k5-budgets-failures-recovery`, ambos del 2026-08-20 y `2026-08-21-k5-authority-boundary-and-cas-concurrency-remediation`) carecen de review-report y lineage 4R. Sin acción retroactiva: este change ejecuta su propio gate (ver Restricciones).

## Opciones consideradas para A2

### Opción 1 — Extender el switch (recomendada)

Añadir 4 casos a `mapLegacyRoutingTag` mapeando a los códigos canónicos ya existentes:

```text
code-bug   → CODE_DEFECT      / CODE_IMPLEMENTATION_DEFECT
spec-gap   → VALIDATION_GAP   / SPEC_REQUIREMENTS_AMBIGUOUS
design-gap → VALIDATION_GAP   / DESIGN_CONTRACT_MISMATCH
tasks-gap  → VALIDATION_GAP   / TASK_DECOMPOSITION_GAP
```

- **Pros:** corrige el defecto en runtime (fix raíz); restaura el contrato ya declarado en `docs/architecture/harness-evolution.md:582`; reutiliza códigos canónicos existentes → sin cambios de schema ni fixtures; compatible con `ALLOWED_ORIGINS` y registros históricos que usan esos tags; determinista; el default `UNKNOWN_FAILURE_CODE` se reserva para tags genuinamente desconocidos (fail-closed real).
- **Contras:** amplía la superficie del switch; exige tests unitarios nuevos; riesgo residual de que algún consumidor dependiera implícitamente de que estos tags cayeran a `code_defect` (improbable: era un comportamiento defectuoso, no contratado).

### Opción 2 — Corregir roadmap/docs para usar los tags canónicos

Renombrar los tags en documentación para que coincidan con lo implementado.

- **Pros:** cero cambio de código.
- **Contras:** deja el bug runtime intacto; `ALLOWED_ORIGINS` de strict-tdd-evidence-remediation sigue emitiendo/validando los tags guionados, que seguirían cayendo al default silencioso; rompe compatibilidad con registros históricos; contradice el contrato de la línea 582 del doc de arquitectura. **Descartada como fix principal.**

### Opción 3 — Ambos

Extender el switch Y renombrar tags en docs.

- **Contras:** trabajo doble sin beneficio; renombrar en docs crearía nueva divergencia con `ALLOWED_ORIGINS` y provenance histórico persistido. **Descartada.**

**Decisión:** Opción 1. La documentación ya describe el comportamiento correcto; el código es quien incumple. Los ajustes documentales independientes se abordan en C.

## Alcance propuesto

### IN

1. **Fix A2:** extender el switch de `mapLegacyRoutingTag` con los 4 tags legacy (mapeo de la Opción 1) + tests en `scripts/lib/causal-failure.test.js` cubriendo cada nuevo caso y asertando que tags genuinamente desconocidos siguen cayendo al default fail-closed.
2. **Fortalecer test B:** `k5-e2e-budgets-recovery.test.js:171` debe ejercitar un conflicto CAS real (patrón stale-permit/race como `index.test.js:776`) y asertar presupuestos no inflados post-conflicto (comparación before/after de budgets).
3. **Matcher de `index.test.js:823` (condicionado):** solo si durante verify se demuestra que el código resultante es determinista, fijarlo a ese valor; si es inherentemente variable, documentar la razón de los 4 valores aceptados en comentario/companion doc.
4. **C1:** `state.yaml` del change `2026-08-20-k5-authoritative-enforcement-and-cas-remediation`: `archive-planned` → `archived`.
5. **C2:** reconciliar el conteo de tareas de ese change (verificar checkboxes reales de `tasks.md`, corregir `apply-progress.md:57` y resumen de `state.yaml`).
6. **C3:** fila K5 de `docs/roadmaps/harness-evolution.md:78` citar publicación v2.45.10 y los changes v2.45.7→v2.45.10, replicando el formato de las filas vecinas.
7. **D como restricción explícita del plan** (ver Restricciones).

### OUT

- Refactor de `resolvePrimaryFailure`, `CAUSAL_PRIORITY` o `createCausalFailure` (fuera del defecto).
- Nuevos códigos de fallo canónicos o cambios de schema/fixtures (`schemas/kernel/causal-failure/`) — se reutilizan códigos existentes.
- Modificar `strict-tdd-evidence-remediation.js`: `ALLOWED_ORIGINS` queda intacto; el puente vive read-side en `mapLegacyRoutingTag`.
- Gates 4R retroactivos para los 4 changes K5 archivados.
- Release/version bump: lo maneja el flujo post-archive (AGENTS.md), no este change.
- Motor de presupuestos y AuthorityStore: intocables salvo el test nombrado.

## Riesgos y rollback

| Riesgo | Impacto | Mitigación | Rollback |
| --- | --- | --- | --- |
| Cambio semántico de clasificación: registros antes etiquetados `UNKNOWN_FAILURE_CODE` pasarán a categorías específicas, alterando decisiones downstream (prioridad causal, routing de recuperación) | Medio | Mapeo semánticamente equivalente a códigos canónicos ya probados; suite completa en verify | Revert del commit de la unidad 1 (función pura, sin estado persistente) |
| Fijar el matcher de `index.test.js:823` puede exponer no-determinismo real (posible razón original de aceptar 4 valores) | Bajo | Condicionar a evidencia empírica durante verify; si no hay determinismo, documentar en lugar de fijar | Revert puntual del test |
| Edición de artefactos archivados (C1/C2) podría percibirse como reescritura histórica | Bajo | Correcciones mínimas de metadatos con nota correctiva; sin alterar contenido técnico archivado | Revert de los commits doc |
| Formato desalineado en la fila K5 del roadmap (C3) | Bajo | Replicar exactamente el patrón de la fila K4a (línea 77) | Revert puntual |

El alcance completo toca ~4 archivos de código/test + 4 artefactos documentales. Cada unidad de trabajo es revertible de forma independiente; no hay migraciones ni estado persistente afectado.

## Restricciones del plan (gate 4R)

- Este change DEBE ejecutar formalmente su gate 4R vía `scripts/lib/review-lineage.js` tras su propio apply/verify. Lo opera el orquestador como gate de ruta bugfix; las fases de implementación no deben relanzar revisores discovery fuera del lineage congelado.
- Los 4 changes K5 previos quedan documentados como gap de gobernanza cerrado con este gate; ninguna fase debe intentar lineage retroactivo sobre ellos.
