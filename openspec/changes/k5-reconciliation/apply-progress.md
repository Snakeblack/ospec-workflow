# Apply Progress: k5-reconciliation

- Change Name: `k5-reconciliation`
- Ruta: `bugfix`
- Delivery Strategy: `ask-on-risk` (no aplica: forecast Low)
- Status: `COMPLETED`
- Fecha: 2026-08-22

## Estado por tarea

- [x] 1.1 Extender `mapLegacyRoutingTag` con los 4 tags legacy guionados (`code-bug`, `spec-gap`, `design-gap`, `tasks-gap`); default `UNKNOWN_FAILURE_CODE` conservado fail-closed.
- [x] 1.2 Tests unitarios nuevos: 1 `assert.deepEqual` por tag nuevo + caso fail-closed explícito (`"nonexistent-tag"`, `""`, `null`).
- [x] 2.1 Test E2E reescrito como prueba real de no-inflación presupuestaria tras conflicto CAS (patrón `index.test.js:776-825`).
- [x] 2.2 (condicional) Matcher de `index.test.js:823` estrechado a `stale-permit` — determinismo demostrado (ver Decisiones).
- [x] 3.1 C1: `state.yaml` del change archivado `archive-planned` → `archived` + nota correctiva.
- [x] 3.2 C2: conteo 28→31 reconciliado en `apply-progress.md` y `state.yaml` del change archivado + nota aclaratoria.
- [x] 4.1 C3: fila K5 del roadmap con publicación v2.45.10 y remediaciones v2.45.7→v2.45.10.
- [x] 5.1 Suite completa ejecutada sin fallos ni regresiones (ver tabla de evidencia).
- [ ] 5.2 Gate 4R — NO lo ejecuta esta fase: checklist de gobernanza operado por el orquestador tras verify (restricción del plan).

## Tabla de evidencia TDD

| Task | Test File | RED | GREEN | Notas |
|------|-----------|-----|-------|-------|
| 1.1+1.2 | `scripts/lib/causal-failure.test.js` | Sí — `mapLegacyRoutingTag("code-bug")` retornaba `{code_defect, UNKNOWN_FAILURE_CODE}` (AssertionError deepEqual); ídem spec-gap/design-gap/tasks-gap | 7/7 pass tras extender el switch en `causal-failure.js` | Default fail-closed fijado por test (`nonexistent-tag`/`""`/`null`) |
| 2.1 | `scripts/k5-e2e-budgets-recovery.test.js` | N/A (defecto estaba en el test, no en producción): el test previo pasaba con `assert.ok(initialSnap)` sin ejercitar CAS ni presupuestos | 6/6 pass con carrera stale-permit real y `deepEqual` before/after de budgets | Sensibilidad garantizada por aserto `deepEqual(store.getBudgets(), budgetsBefore)` |
| 2.2 | `scripts/lib/lifecycle-kernel/index.test.js` | N/A (condicional) | 38/38 pass con matcher `stale-permit` único | Determinismo: 200/200 ejecuciones → `blocked:stale-permit` |
| C1+C2+C3 | n/a (documental) | n/a | Verificación textual: conteo 31 `[x]` / 0 `[ ]` confirmado con grep antes de editar | Sin reescritura de contenido técnico histórico |
| 5.1 | suite completa (`npm test`) | n/a | **tests 2387 · pass 2384 · fail 0 · skipped 3** + `All checks passed.` (7 generadores) | Sin regresiones respecto del baseline |

## Decisiones tomadas

1. **A2 — mapeo Opción 1 (extensión del switch).** Reutiliza códigos canónicos existentes; sin cambios de schema ni fixtures. Restaura el contrato declarado en `docs/architecture/harness-evolution.md:582`. `strict-tdd-evidence-remediation.js` (`ALLOWED_ORIGINS`) intacto.
2. **B — carrera stale-permit contra Authority Store.** Se sustituye el runtime efímero sin store por `createAuthorityStore` + segundo writer que gana la revisión CAS; se aserta `outcome: "blocked"`, código determinista e igualdad exacta de presupuestos before/after.
3. **2.2 — estrechamiento del matcher (tarea condicional realizada).** Doble evidencia:
   - Empírica: sondeo de 200 repeticiones del escenario exacto → 200/200 `blocked:stale-permit`.
   - Estática: la autorización del permit (`authorizeMutation`, permits.js:111-112) corre antes de la validación de transición y del CAS del kernel; el permit fue emitido por el mismo runtime (descarta `permit-not-runtime-issued`) y no está consumido (descarta `permit-reuse`). Con revisión desfasada, `stale-permit` es la única salida posible.
   - Comentario adyacente añadido en `index.test.js` documentando la razón.
4. **C1/C2 — corrección mínima de metadatos.** Nota correctiva como comentario YAML en `state.yaml` y nota aclaratoria junto a la tabla Strict TDD en `apply-progress.md`; fecha `last_updated` actualizada; cero alteraciones de contenido técnico archivado.

## Desviaciones del plan

| Desviación | Justificación |
|------------|---------------|
| Commits agrupados según sugerencia del orquestador (3 unidades) en lugar de los 5 commits de tasks.md | La instrucción del orquestador en esta sesión consolida C1+C2+C3 en una sola unidad documental; units 1 y 2 idénticas al plan |
| Ninguna otra | Las tareas 2.2 y todas las fases se ejecutaron conforme al plan |

## Verificación (5.1)

```
node scripts/check.js        → All checks passed. (tests nativos + 7 generadores target)
node --test scripts/**/*.test.js → tests 2387 · pass 2384 · fail 0 · cancelled 0 · skipped 3
```

Los 3 skipped corresponden a pruebas condicionales preexistentes del baseline (sin relación con este change); 0 fallos y 0 regresiones.

## Pendiente fuera de alcance

- Gate 4R post-verify: lo opera el orquestador conforme al Bounded Review Lifecycle (linaje congelado; validaciones posteriores solo vía `review-correction` read-only).
