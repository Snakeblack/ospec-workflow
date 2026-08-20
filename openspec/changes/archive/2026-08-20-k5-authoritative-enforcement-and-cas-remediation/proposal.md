# Proposal: K5 Authoritative Enforcement and CAS Remediation

## Intent

Remediar los 5 blockers autoritativos identificados en K5 (v2.45.8) para la versión `2.45.9`:
1. Emitir transiciones canónicas de recuperación (`operation: "repair"` para `code_defect` sin degradar a `recover`), armonizar la taxonomía de `kind` (`execute`, `decide`, `stop`) y `operation` (`repair`, `recover`, `replan`, `escalate`, `stop`), y permitir que `escalate` se consolide en el CAS sin aborto prematuro.
2. Implementar preflight exhaustivo de presupuestos de nodo y autoridad en selector, emisión de permisos y `runKernelOperation` antes de invocar `effectExecutor`.
3. Exigir `args.scope` obligatorio en `operation: "repair"`, eliminando el fallback muerto `effectRecords[0]?.payload?.scope` y fallando cerrado con 0 llamadas al executor si falta.
4. Completar la contabilidad zero-delta descontando `node.turns` y `state.authority_budget.effect_attempts`, persistiendo el evento durable `zero-delta-attempt`.
5. Preservar el consumo presupuestario ante conflicto CAS cuando un efecto ya fue ejecutado, transformando `inv-k5-budget-monotonicity` en una prueba concurrente de 2 writers con CAS conflict.

## Scope

### In Scope
- **Transiciones Canónicas y Armonización**: Emisión de `repair` para `code_defect`, eliminación de degradación `repair -> recover`, alineación `kind`/`operation`, y consolidación de `escalate` en CAS.
- **Preflight de Presupuestos**: Evaluación de `node.budget` y `state.authority_budget` mediante `isBudgetExhausted()` en selector, permisos y `runKernelOperation` previo a `effectExecutor`.
- **Scope Obligatorio en Repair**: `args.scope` obligatorio en preflight fail-closed para `operation: "repair"`, con 0 llamadas a `effectExecutor` si falta o es inválido, y eliminación de fallbacks muertos.
- **Contabilidad Zero-Delta Completa**: Deducción simultánea de `node.turns` y `authority_budget.effect_attempts`, con emisión y proyección del evento `zero-delta-attempt`.
- **Preservación Presupuestaria ante Conflicto CAS**: No reponer presupuestos de efectos ejecutados tras perder el CAS, y refactorizar `inv-k5-budget-monotonicity` a un test real con 2 writers concurrentes.
- **Release 2.45.9**: Bump de versión a `2.45.9` en `package.json` y `openspec/config.yaml`.

### Out of Scope
- Reestructuración de aislamiento en contenedores de workers (K6a).
- Verificación multi-estrategia y review authority externa (K6b, K7, K8).

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `failure-recovery`: Emisión explícita de `repair` para `code_defect`, armonización de taxonomía `kind`/`operation`, consolidación de `escalate` en CAS, y validación estricta fail-closed de `scope` en `repair`.
- `execution-budgets`: Preflight integral de presupuestos (nodo y autoridad), contabilidad zero-delta con deducción dual (`turns` y `effect_attempts`), y preservación monotónica de consumo tras conflicto CAS.
- `lifecycle-kernel-runtime`: Preflight previo a `effectExecutor`, ejecución de `escalate` con commit CAS, guard de scope obligatorio en `repair` (0 ejecuciones), y registro del evento durable `zero-delta-attempt`.
- `operation-permits`: Preflight de presupuestos de autoridad y nodo antes de registrar u otorgar operation permits.
- `lifecycle-model-conformance`: Endurecimiento de `inv-k5-budget-monotonicity` con prueba real de 2 writers en conflicto CAS y actualización de invariante `inv-k5-zero-delta-consumption`.

## Approach

1. **Transiciones y Escalate**: Actualizar `transition-selector.js` para emitir `{ kind: "execute", operation: "repair" }` ante `code_defect` con intentos disponibles. Ajustar `reducer.js` y `index.js` para procesar `escalate` como avance terminal consolidado en CAS.
2. **Preflight Presupuestario**: Integrar evaluación `isBudgetExhausted()` en `permits.js`, `transition-selector.js` y `index.js` antes de despachar hacia `effectExecutor`.
3. **Guard de Scope en Repair**: Verificar presencia y validez de `args.scope` en `runKernelOperation` antes del loop de efectos. Si es inválido o ausente, retornar `blockedResult("repair-scope-violation")` con 0 llamadas al executor.
4. **Contabilidad Zero-Delta**: En `index.js`, descontar tanto `node.budget.turns` como `state.authority_budget.effect_attempts` ante mutaciones zero-delta y persistir evento `zero-delta-attempt` en el journal.
5. **CAS Conflict & Budget Monotonicity**: Registrar consumo de intentos en el store/journal previo a la resolución CAS para evitar reposición si el CAS pierde. Crear test con 2 runtimes/writers concurrentes compitiendo por la misma revisión.
6. **Validación de Invariantes**: Actualizar checkers y suites de pruebas en `scripts/lib/lifecycle-model.js` y `scripts/lib/k5-lifecycle-model.test.js`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/lifecycle-kernel/transition-selector.js` | Modified | Emisión canónica de `repair` para `code_defect` y preflight presupuestario de autoridad |
| `scripts/lib/lifecycle-kernel/index.js` | Modified | Preflight antes de `effectExecutor`, guard de scope en `repair`, `escalate` a CAS, zero-delta dual y preservación presupuestaria |
| `scripts/lib/lifecycle-kernel/permits.js` | Modified | Preflight de `node.budget` y `authority_budget` antes de emisión de permisos |
| `scripts/lib/lifecycle-kernel/reducer.js` | Modified | Manejo de transición `escalate` y mutaciones de estado asociadas |
| `scripts/lib/failure-recovery.js` | Modified | Validación fail-closed de repair scope y taxonomía de recuperación |
| `scripts/lib/execution-budgets.js` | Modified | Helpers de preflight y decremento monotónico dual para zero-delta |
| `scripts/lib/lifecycle-model.js` | Modified | Checker `inv-k5-budget-monotonicity` con 2 writers concurrentes y `inv-k5-zero-delta-consumption` |
| `scripts/lib/k5-lifecycle-model.test.js` | Modified | Test cases actualizados para los 5 blockers |
| `package.json`, `openspec/config.yaml` | Modified | Incremento de versión a `2.45.9` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Falso positivo en preflight de presupuestos bloqueando operaciones legítimas | Low | Validar defaults permisivos cuando el nodo o estado no declara presupuestos explícitos |
| Regresión en tests que esperaban `operation: "recover"` para `code_defect` | Med | Actualizar fixtures y tests para alinearse con la matriz canónica `operation: "repair"` |
| Carrera en test de 2 writers con CAS conflict | Low | Usar memoria aislada con un `authorityStore` compartido y checkpoints deterministas |

## Rollback Plan

Revertir los commits mediante `git revert`. Los cambios se limitan a la lógica de ejecución en memoria, validación y tests en Node.js, sin migraciones destructivas de almacenamiento persistente.

## Dependencies

- Archivo de K5 (`2026-08-20-k5-runtime-enforcement-and-wiring-remediation` archivado en v2.45.8).

## Success Criteria

- [ ] Selector emite `operation: "repair"` ante `code_defect` y preserva distinción `kind`/`operation`.
- [ ] Operación `escalate` se registra y consolida en el CAS sin aborto prematuro.
- [ ] Preflight rechaza operaciones con presupuesto agotado (nodo o autoridad) antes de llamar a `effectExecutor` (0 invocaciones).
- [ ] Operación `repair` sin `args.scope` falla cerrado inmediatamente con 0 llamadas a `effectExecutor`.
- [ ] Mutación zero-delta descuenta `node.turns` y `authority_budget.effect_attempts` y registra evento `zero-delta-attempt`.
- [ ] Conflicto CAS preserva el presupuesto consumido por efectos ejecutados sin reiniciarlo.
- [ ] Invariante `inv-k5-budget-monotonicity` pasa con prueba concurrente real de 2 writers.
- [ ] Suite completa `npm test` pasa al 100% y versión se actualiza a `2.45.9`.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
