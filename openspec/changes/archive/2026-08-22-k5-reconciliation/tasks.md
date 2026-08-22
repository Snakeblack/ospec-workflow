# Tasks: k5-reconciliation

**Change:** k5-reconciliation · **Ruta:** bugfix · **Fuente:** [exploration.md](./exploration.md) · **Fecha:** 2026-08-22

```text
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low
```

Delivery strategy cacheada: `ask-on-risk` (no aplica: forecast total ≈ 115–160 líneas, riesgo Low).

---

## Review Workload Forecast

| Fase | Archivos objetivo | Líneas estimadas |
| --- | --- | --- |
| Fase 1 (A2 clasificación causal) | `scripts/lib/causal-failure.js`, `scripts/lib/causal-failure.test.js` | ~35–45 (+16 switch, +25 tests) |
| Fase 2 (test E2E presupuestos) | `scripts/k5-e2e-budgets-recovery.test.js`, (`scripts/lib/lifecycle-kernel/index.test.js` condicional) | ~60–75 (reescritura test + asertos) |
| Fase 3 (metadatos change archivado) | `openspec/changes/archive/2026-08-20-k5-authoritative-enforcement-and-cas-remediation/{state.yaml,apply-progress.md}` | ~15–20 |
| Fase 4 (fila roadmap K5) | `docs/roadmaps/harness-evolution.md` | ~3–5 |
| Fase 5 (verificación + gate 4R) | sin diff de código (checklist) | 0 |

**Total estimado: ~115–160 líneas.** Riesgo de presupuesto 400 líneas: Low. Un solo PR a `main` con commits por unidad de trabajo es suficiente; sin encadenamiento.

---

## Fase 1: A2 — Clasificación causal fail-closed de tags legacy guionados

Defecto verificado: los tags `code-bug`, `tasks-gap`, `design-gap`, `spec-gap` caen hoy al default silencioso `code_defect/UNKNOWN_FAILURE_CODE` en `mapLegacyRoutingTag` (`scripts/lib/causal-failure.js:55-89`). Mapeo decidido en exploración (Opción 1), reutilizando códigos canónicos existentes — sin nuevos códigos ni cambios de schema:

```text
code-bug   → CODE_DEFECT    / CODE_IMPLEMENTATION_DEFECT
spec-gap   → VALIDATION_GAP / SPEC_REQUIREMENTS_AMBIGUOUS
design-gap → VALIDATION_GAP / DESIGN_CONTRACT_MISMATCH
tasks-gap  → VALIDATION_GAP / TASK_DECOMPOSITION_GAP
```

- [ ] 1.1 Extender el switch de `mapLegacyRoutingTag` con los 4 casos anteriores (antes del `default`). El `default` con `UNKNOWN_FAILURE_CODE` se conserva intacto para tags genuinamente desconocidos (fail-closed real). NO tocar `resolvePrimaryFailure`, `CAUSAL_PRIORITY`, `createCausalFailure` ni `strict-tdd-evidence-remediation.js` (`ALLOWED_ORIGINS` queda intacto).
  - Archivos: `scripts/lib/causal-failure.js`
- [ ] 1.2 Tests unitarios en el test existente `mapLegacyRoutingTag` (`causal-failure.test.js:47`): un `assert.deepEqual` por cada tag nuevo (los 4), más caso fail-closed explícito: un tag desconocido (p. ej. `"nonexistent-tag"`) y vacío/null siguen devolviendo `{ category: "code_defect", code: "UNKNOWN_FAILURE_CODE" }`.
  - Archivos: `scripts/lib/causal-failure.test.js`

**Commit sugerido (unidad 1):**
```text
fix(causal-failure): mapea tags legacy guionados a códigos canónicos

- Extiende mapLegacyRoutingTag con code-bug, spec-gap, design-gap y tasks-gap
- Restaura el contrato declarado en docs/architecture/harness-evolution.md:582
- El default UNKNOWN_FAILURE_CODE queda reservado a tags desconocidos
- Tests unitarios para los 4 tags y para el fail-closed del default
```

---

## Fase 2: B — Prueba real de no-inflación de presupuestos tras conflicto CAS

Test débil verificado: `k5-e2e-budgets-recovery.test.js:171-182` solo hace `getStatus` + `snapshot()` con `assert.ok(initialSnap)`, sin conflicto CAS ni asertos de presupuesto. Cobertura real de referencia: `index.test.js:776-825`.

- [ ] 2.1 Reescribir el test "K5 E2E: Monotonic budget non-inflation after CAS race retries" como prueba efectiva siguiendo el patrón de `index.test.js:776-825`: crear Authority Store con presupuestos acotados, emitir permit con revisión de head, provocar carrera CAS real (segundo writer que gana la revisión), ejecutar `runOperation` con el permit obsoleto y asertar: (a) outcome `blocked`, (b) presupuestos post-conflicto idénticos a los previos (`getBudgets()` before/after o equivalente vía snapshot). Mantener el nombre del test y su ubicación.
  - Archivos: `scripts/k5-e2e-budgets-recovery.test.js`
- [ ] 2.2 **CONDICIONAL** (solo si la evidencia lo soporta): estrechar el matcher laxo de `index.test.js:823` al código único observado de forma determinista en repetidas ejecuciones. Si el código resultante varía inherentemente (posible razón original de aceptar 4 valores), NO fijarlo: dejar el matcher como está y documentar la razón de los 4 valores aceptados en comentario adyacente. Si introduce cualquier riesgo de no-determinismo en CI, marcar la tarea como no realizada y registrarlo en apply-progress.
  - Archivos: `scripts/lib/lifecycle-kernel/index.test.js`

**Commit sugerido (unidad 2):**
```text
test(k5-e2e): ejercita conflicto CAS real y aserta no-inflación de presupuestos

- Sustituye el assert.ok(initialSnap) por carrera stale-permit contra Authority Store
- Compara presupuestos antes/después del bloqueo post-conflicto
- Matcher de index.test.js:823 se estrecha solo si hay determinismo demostrado
```

---

## Fase 3: C1+C2 — Metadatos del change archivado 2026-08-20

Verificado en esta planificación: `tasks.md` del change archivado contiene exactamente **31 checkboxes, todos `- [x]`**. El conteo real es 31; el error está en los contadores y resúmenes que dicen 28. Corrección mínima de metadatos con nota correctiva; sin reescribir contenido técnico histórico.

- [ ] 3.1 C1: en `state.yaml`, cambiar `status: "archive-planned"` → `status: "archived"` (línea 2) y actualizar `last_updated`. Añadir nota correctiva breve (campo `corrective_note` o comentario YAML) indicando fecha, motivo (estado quedó inconsistente tras el archivo real) y que no se alteró contenido técnico archivado.
  - Archivos: `openspec/changes/archive/2026-08-20-k5-authoritative-enforcement-and-cas-remediation/state.yaml`
- [ ] 3.2 C2: corregir las menciones 28→31 donde vive el error real: `apply-progress.md` línea 5 ("6 fases y 28 tareas"), líneas 56-57 (`total_tasks`/`tasks_completed`: 28→31) y `state.yaml` líneas 38, 40, 46 ("28 tareas") y 51 ("28/28 tasks"). Añadir una sola nota aclaratoria en `apply-progress.md` (junto a la tabla de evidencia Strict TDD, que ya lista 31 filas 1.1–6.5) explicando la discrepancia detectada y corregida, citando el conteo verificado de checkboxes.
  - Archivos: `openspec/changes/archive/2026-08-20-k5-authoritative-enforcement-and-cas-remediation/apply-progress.md`, `openspec/changes/archive/2026-08-20-k5-authoritative-enforcement-and-cas-remediation/state.yaml`

**Commit sugerido (unidad 3):**
```text
docs(archive): corrige metadatos del change k5-authoritative-enforcement

- Estado archive-planned pasa a archived con nota correctiva
- Concilia el conteo real de 31 tareas (checkboxes verificados) frente al 28 registrado
- Sin reescritura de contenido técnico histórico
```

---

## Fase 4: C3 — Fila K5 del roadmap con publicación y remediaciones

- [ ] 4.1 Actualizar la fila K5 (`docs/roadmaps/harness-evolution.md:78`) replicando el formato de las filas K1–K4a (K4a, línea 77): estado `done`, citar publicación **v2.45.10** y las remediaciones **v2.45.7→v2.45.10** (closure de K5: authoritative enforcement, authority boundary/CAS concurrency y este reconciliation). Verificado: versiones 2.45.10 en `package.json`, `.plugin.json`, `.claude-plugin/plugin.json`; CHANGELOG tiene secciones [2.45.7]…[2.45.10].
  - Archivos: `docs/roadmaps/harness-evolution.md`

**Commit sugerido (unidad 4):**
```text
docs(roadmap): cita publicación v2.45.10 y remediaciones en la fila K5

- Alinea la fila K5 con el formato de las filas K1-K4a
- Refleja el cierre v2.45.7 -> v2.45.10 del programa K5
```

---

## Fase 5: Verificación y gobernanza (D)

- [ ] 5.1 Ejecutar suite completa de verificación: `node scripts/check.js` (incluye tests nativos + generadores target). Confirmar 0 fallos y 0 regresiones respecto del baseline actual. Registrar resultado en apply-progress.
  - Archivos: `openspec/changes/k5-reconciliation/apply-progress.md` (registro)
- [ ] 5.2 **Restricción de gobernanza (checklist, no código):** este change DEBE pasar formalmente por el gate `4r-review-gate` tras `verify`, operado por el orquestador conforme al Bounded Review Lifecycle (linaje congelado tras el run selectivo; generalista y especialistas ejecutan una sola vez; validaciones posteriores solo vía `review-correction` read-only sobre IDs congelados). Las fases de implementación NO deben relanzar revisores discovery fuera del lineage. Los 4 changes K5 archivados previos quedan documentados como gap de gobernanza cerrado con este gate; sin lineage retroactivo.
  - Archivos: ninguno (gate operado por el orquestador; evidencia en review-report del change)

**Commit sugerido (unidad 5):**
```text
test(k5-reconciliation): verifica suite completa tras reconciliación

- Ejecuta scripts/check.js sin fallos ni regresiones
- Registra resultados de verificación en apply-progress
```

*(El gate 4R posterior lo opera el orquestador y genera sus propios artefactos de linaje; no lleva commit propio en este plan.)*
