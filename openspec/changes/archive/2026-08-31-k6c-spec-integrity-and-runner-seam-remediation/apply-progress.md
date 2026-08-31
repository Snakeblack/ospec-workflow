# Apply Progress: k6c-spec-integrity-and-runner-seam-remediation

## Batch 1 Summary

- **Change**: `k6c-spec-integrity-and-runner-seam-remediation`
- **Delivery mode**: `single-pr`
- **TDD Mode**: `focused`

### Implemented Tasks

- [x] **1.1 RED**: Añadido test de invariante en `scripts/manifest-sync.test.js` para auditar la ausencia de tokens `undefined` y la retención íntegra de `{#REQ-...}` en todas las especificaciones canónicas de `openspec/specs/**/spec.md`.
- [x] **1.2 GREEN**: Restaurado `openspec/specs/adversarial-challenges/spec.md` reincorporando las secciones completas de `REQ-adversarial-challenges-003` y `REQ-adversarial-challenges-004` y eliminando el token espurio `undefined`.
- [x] **1.3 REFACTOR**: Verificado que `scripts/manifest-sync.test.js` pasa al 100% y validado el formato y alineación de encabezados en las especificaciones canónicas.
- [x] **2.1 RED**: Añadidos tests unitarios en `scripts/lib/archive-plan.test.js` para los nuevos códigos `corrupted-spec-content` y `dropped-requirement-id`, verificando su pertenencia a `PLAN_REJECTION_CODES` y el rechazo de snapshots con tokens `undefined` o REQ IDs no declarados como removidos.
- [x] **2.2 GREEN**: Extendido `scripts/lib/archive-plan.js` incorporando `corrupted-spec-content` y `dropped-requirement-id` a `PLAN_REJECTION_CODES`, e implementando `extractRequirementIds`, `extractRemovedRequirementIds`, `hasCorruptedSpecContent` y las validaciones de contenido en `validatePlanAgainstSnapshot`.
- [x] **2.3 RED**: Añadidos tests de integración en `scripts/lib/archive-transaction.test.js` verificando que el preflight de `runArchiveTransaction` rechaza fail-closed planes con especificaciones que contengan `undefined` o REQ IDs suprimidos sin mutar staging ni live paths.
- [x] **2.4 GREEN**: Modificado `scripts/lib/archive-transaction.js` para capturar `preparedTexts` y `targetTexts` en `buildSnapshot` y pasarlos a `validatePlanAgainstSnapshot` durante el preflight.
- [x] **2.5 REFACTOR**: Limpiados helpers de regex y validada la suite completa de archive en `scripts/lib/archive-plan.test.js` y `scripts/lib/archive-transaction.test.js`.
- [x] **3.1 RED**: Actualizados tests unitarios en `scripts/lib/adversarial-challenges/runner.test.js` para invocar directamente `runIsolatedMutation` con el parámetro posicional `_testRunner`, y añadido test de integración adversarial que comprueba que `executeChallengePlan` ignora mocks pasados en `context.runWorkspaceTests`.
- [x] **3.2 GREEN**: Modificado `scripts/lib/adversarial-challenges/runner.js` para eliminar la lectura de `context.runWorkspaceTests` en `executeChallengePlan` y `runIsolatedMutation`, soportando `_testRunner` como parámetro opcional directo exclusivamente en `runIsolatedMutation`.
- [x] **3.3 REFACTOR**: Limpiadas invocaciones internas de ejecución de tests y verificado que toda la suite de adversarial challenges en `scripts/lib/adversarial-challenges/runner.test.js` pasa al 100%.
- [x] **4.1 Full Verification**: Ejecutado `npm test` completo (2912 passed, 0 failed, 2 skipped) verificando la ausencia de regresiones.

### Files Changed

| File | Action | What Was Done |
|---|---|---|
| `openspec/specs/adversarial-challenges/spec.md` | Modified | Restauradas secciones completas de `REQ-adversarial-challenges-003` y `REQ-adversarial-challenges-004`; eliminado token `undefined`. |
| `scripts/manifest-sync.test.js` | Modified | Añadido test de invariante que audita que las specs canónicas contengan requisitos válidos y carezcan de tokens de corrupción `undefined` o `[object Object]`. |
| `scripts/lib/archive-plan.js` | Modified | Añadidos `corrupted-spec-content` y `dropped-requirement-id` a `PLAN_REJECTION_CODES`; implementados helpers `extractRequirementIds`, `extractRemovedRequirementIds`, `hasCorruptedSpecContent` y validación de contenido en `validatePlanAgainstSnapshot`. |
| `scripts/lib/archive-plan.test.js` | Modified | Añadidos tests unitarios para verificar códigos allowlist y rechazo fail-closed ante tokens de corrupción y REQ IDs omitidos sin sección REMOVED. |
| `scripts/lib/archive-transaction.js` | Modified | Modificado `buildSnapshot` para capturar `preparedTexts` y `targetTexts` para la validación de integridad en preflight. |
| `scripts/lib/archive-transaction.test.js` | Modified | Añadidos tests de integración para verificar que el preflight aborta fail-closed ante specs corruptas o REQ IDs dropped dejando origin intacto. |
| `scripts/lib/adversarial-challenges/runner.js` | Modified | Eliminado el seam `context.runWorkspaceTests` en `executeChallengePlan` y `runIsolatedMutation`; soportado parámetro directo `_testRunner` en `runIsolatedMutation`. |
| `scripts/lib/adversarial-challenges/runner.test.js` | Modified | Migrados tests unitarios con `withWorkspace` y `_testRunner` directo; añadido test adversarial negativo que comprueba que `executeChallengePlan` ignora mocks en contexto. |
| `openspec/changes/k6c-spec-integrity-and-runner-seam-remediation/tasks.md` | Modified | Marcadas todas las tareas de fase 1 a 4 como completadas `[x]`. |

### Deviations from Design

None — implementation matches design.md exactly.

### Issues Found

None.