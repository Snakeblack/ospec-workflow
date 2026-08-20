# Design: K5 Runtime Enforcement and Wiring Remediation

## Technical Approach

Este cambio remedia y cierra las brechas de cableado (wiring gaps) e integración del runtime para las garantías introducidas en el Bloque 5 de la arquitectura del lifecycle kernel (K5). La remediación conecta de forma estricta y de extremo a extremo:
1. **Evaluador Unificado `isBudgetExhausted()`**: Una función pura única en `scripts/lib/execution-budgets.js` que evalúa exhaustivamente las 6 dimensiones de nodo (`turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines`, `allowed_paths`) y las 4 dimensiones de autoridad (`effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`), gobernando el podado terminal en `transition-selector.js`, el marcaje en `reducer.js` y la emisión de permisos.
2. **Representación y Mapeo Canónico de Transiciones de Recuperación**: Mapeo determinista en `transition-selector.js` a transiciones explícitas (`repair`, `replan`, `escalate`, `stop`) derivadas de `getAllowlistedTransitions()`, erradicando la sustitución silenciosa de `escalate` por `decide`.
3. **Validación Fail-Closed de Repair Scope**: `validateRepairScope()` en `scripts/lib/failure-recovery.js` opera estrictamente fail-closed ante scopes vacíos `{}` o desprovistos de arrays cuando existen mutaciones o `targetNodeId`, y se valida en `runKernelOperation()` antes de ejecutar efectos y antes de CAS.
4. **Wiring de Honest Recovery y Zero-Delta en `runKernelOperation`**: Validación de avance de `blockingFingerprint` mediante `validateRecoveryHonesty()`, captura de métricas reales de ejecución de efectos, deducción monotónica de mutaciones zero-delta y commit atómico mediante CAS.
5. **Hardening de los 7 Invariantes K5 en `lifecycle-model.js`**: Reescritura de los 7 checkers de modelo para verificar composición real del runtime (`createKernelRuntime`, `runKernelOperation`, Authority Store CAS, `transition-selector`, `reducer` y ledger de permisos) con pruebas parametrizadas multivariante.
6. **Deuda Documental y Release 2.45.8**: Actualización de los 3 ADRs de K5 (`adr-20260817-001`, `002`, `003`) a estado `accepted` e incremento de versión a `2.45.8`.

---

## Architecture Decisions

### Decision: Evaluador Unificado y Puro de Presupuestos `isBudgetExhausted()`

| Opción | Trade-off | Decisión |
|---|---|---|
| A. Evaluadores fragmentados separados (`evaluateNodeBudget` vs `evaluateAuthorityBudget`) con condiciones disjuntas | Riesgo de comprobaciones asimétricas y omisión de dimensiones críticas como `allowed_paths` o `review_sweeps` | Rechazada |
| B. Evaluación con estado o mutación implícita en objetos de presupuesto | Pérdida de pureza funcional, problemas de concurrencia y dificultad de testeo | Rechazada |
| C. Función pura canonical `isBudgetExhausted()` que evalúa 10 dimensiones ortogonales con reporte de dimensión violada | Evaluación completa, consistente y utilizable simétricamente en reducer, selector, runtime y tests | **Elegida** |

**Choice**: Implementar `isBudgetExhausted(budget, consumed = {}, options = {})` en `scripts/lib/execution-budgets.js` como la única función de evaluación exhaustiva para las 6 dimensiones de nodo y las 4 dimensiones de autoridad. Retorna `{ ok: boolean, exhausted: boolean, dimension?: string, remaining: Object, code?: string, violations?: string[] }`.
**Alternatives considered**: Mantener evaluación parcial en helpers aislados (rechazada por permitir ejecuciones zombi sin detección completa de cuotas).
**Rationale**: Satisface `REQ-execution-budgets-001`, `REQ-execution-budgets-002` y `REQ-lifecycle-kernel-runtime-025`, permitiendo al selector y reducer podar con certeza matemática cualquier nodo o autoridad agotada.

---

### Decision: Validación Estrictamente Fail-Closed de Repair Scopes

| Opción | Trade-off | Decisión |
|---|---|---|
| A. Permitir que scopes vacíos `{}` pasen abiertos si los arrays no están definidos | Vulnerabilidad de seguridad: trabajadores de reparación pueden mutar archivos fuera de su ámbito sin control | Rechazada |
| B. Validación exclusiva en tiempo de compilación o grafo estático | No detecta mutaciones reales realizadas dinámicamente durante la ejecución del efecto | Rechazada |
| C. Validación fail-closed en `validateRepairScope` y chequeo activo pre-efecto y pre-CAS en `runKernelOperation` | Contención absoluta del radio de explosión (blast radius) de las reparaciones automatizadas | **Elegida** |

**Choice**: Modificar `validateRepairScope()` para fallar cerrado (`ok: false`) si `scope` es `{}` / `undefined` cuando existen `targetNodeId`, `modifiedPaths` o `resolvedFindingIds`. Integrar la llamada en `runKernelOperation()` validando el scope antes de ejecutar efectos y verificando las rutas modificadas antes del commit CAS.
**Alternatives considered**: Emitir advertencias en log pero permitir CAS (rechazada por incumplir `REQ-failure-recovery-004`).
**Rationale**: Garantiza que ninguna reparación automática pueda modificar archivos fuera de los globs de propiedad del nodo fallido ni resolver findings no congelados.

---

### Decision: Pipeline de Honest Recovery y Contabilidad Zero-Delta en `runKernelOperation`

| Opción | Trade-off | Decisión |
|---|---|---|
| A. Contabilidad zero-delta solo en pruebas sintéticas de modelo | El runtime real puede entrar en bucles de reparación infinitos si un trabajador emite no-ops | Rechazada |
| B. Confiar en límites de tiempo de reloj (wall-clock) externos | No determinista; malgasta recursos y no penaliza intentos no productivos | Rechazada |
| C. Detección post-efecto de zero-delta y validación de `blockingFingerprint` pre-CAS en el ciclo atómico | Garantía formal de terminación y avance monotónico con persistencia atómica en CAS | **Elegida** |

**Choice**: En `runKernelOperation()`, capturar el `beforeFingerprint` antes de la ejecución del efecto, obtener las métricas de mutación del executor (`modified_files_count`, `changed_lines`, hashes de salida), evaluar `isZeroDeltaMutation()`, aplicar deducción presupuestaria (`turns - 1`, `effect_attempts - 1`) y validar avance con `validateRecoveryHonesty()`. Si el recovery no avanza el fingerprint, fallar cerrado y forzar transición a `escalate` o `stop`.
**Alternatives considered**: Deducción previa al efecto sin reconciliación (rechazada porque lecturas o inspecciones no deben consumir cuotas zero-delta).
**Rationale**: Satisface `REQ-execution-budgets-004` y `REQ-lifecycle-kernel-runtime-005`.

---

### Decision: Emisión Explícita de Transiciones de Recuperación en Selector sin Sustitución Silenciosa

| Opción | Trade-off | Decisión |
|---|---|---|
| A. Sustituir `escalate` por `decide` genérico cuando no hay transiciones de ejecución | Oculta la causa raíz de la escalación y rompe la semántica de la taxonomía causal | Rechazada |
| B. Reintentar ciegamente `repair` ante fallos de entorno o gaps de validación | Causa bucles erróneos culpando al código de fallos de infraestructura o especificación | Rechazada |
| C. Emitir estrictamente transiciones allowlisted (`repair`, `replan`, `escalate`, `stop`) según la categoría primaria | Mapeo determinista, visibilidad total del fallo y control riguroso de escalación | **Elegida** |

**Choice**: Actualizar `transition-selector.js` para consultar `getAllowlistedTransitions(category, { remainingAttempts })` y emitir transiciones explícitas (`{ kind: "escalate", operation: "escalate" }`, `{ kind: "execute", operation: "replan" }`, `{ kind: "stop", operation: "stop" }`).
**Alternatives considered**: Aliasing implícito en el reducer (rechazada por violar `REQ-failure-recovery-002` y `REQ-lifecycle-kernel-runtime-026`).
**Rationale**: Proporciona trazabilidad completa y garantiza que cada tipo de fallo (`environment_tooling`, `cas_conflict`, `ambiguous_effect`, `validation_gap`, `code_defect`) reciba el tratamiento de recuperación formal estipulado.

---

### Decision: Hardening de Invariantes K5 en `lifecycle-model.js` con Composición Runtime/CAS Real

| Opción | Trade-off | Decisión |
|---|---|---|
| A. Comprobar helpers puros aislados en funciones síncronas estáticas | No demuestra que el runtime completo, el Authority Store y el CAS sostengan los invariantes | Rechazada |
| B. Pruebas E2E en suites externas sin conexión al modelo de invariantes | Viola la especificación formal del modelo de conformidad del kernel | Rechazada |
| C. Reingeniería de los 7 checkers de invariantes K5 ejecutando runtime, store, selector, reducer y CAS | Verificación matemática y ejecutable de la composición íntegra del sistema | **Elegida** |

**Choice**: Reemplazar los 7 checkers K5 en `scripts/lib/lifecycle-model.js` para instanciar `createKernelRuntime()`, inicializar `AuthorityStore`, simular colisiones CAS reales, ejecutar transiciones de fallo y verificar la preservación monotónica de presupuestos, precedencia causal y avance de fingerprint.
**Alternatives considered**: Mantener checkers unitarios (rechazada por `REQ-lifecycle-model-conformance-011`).
**Rationale**: Garantiza que el modelo de ciclo de vida valide la implementación viva del kernel y no meros stubs.

---

## Data Flow

### 1. Flujo de Evaluación Presupuestaria Unificada (`isBudgetExhausted`)

```
   ┌─────────────────────────────────────────────────────────────┐
   │ Operación / Transición Solicitada (`start`, `recover`, etc.) │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ execution-budgets.js: isBudgetExhausted(budget, consumed)   │
   │  - 6 Dimensiones Nodo: turns, patches, commands,            │
   │    wall_time_minutes, changed_lines, allowed_paths          │
   │  - 4 Dimensiones Autoridad: effect_attempts,                │
   │    authority_mutations, evidence_runs, review_sweeps        │
   └──────────────┬───────────────────────────────┬──────────────┘
                  │ [No Agotado]                  │ [Agotado: exhausted=true]
                  ▼                               ▼
   ┌──────────────────────────────┐ ┌────────────────────────────┐
   │ reducer.js & runtime         │ │ Bloqueo Fail-Closed        │
   │ - Continúa ejecución         │ │ - Marca node.exhausted=true│
   │ - Deducción monotónica       │ │ - Selector poda ejecución  │
   │   (B_next = B_prev - delta)  │ │ - Emite `escalate` | `stop`│
   └──────────────────────────────┘ └────────────────────────────┘
```

### 2. Flujo de Selección de Transiciones Causales y Escalación Explícita

```
   ┌─────────────────────────────────────────────────────────────┐
   │ Nodo en fase `failed` o `interrupted`                       │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ causal-failure.js: resolvePrimaryFailure(failures)          │
   │  - Precedencia: Env (1) > CAS (2) > Ambiguous (3)           │
   │                > Gap (4) > Defect (5)                       │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ failure-recovery.js: getAllowlistedTransitions(category)    │
   │  - ambiguous_effect:   ['escalate', 'stop']                 │
   │  - validation_gap:     ['replan', 'escalate', 'stop']       │
   │  - cas_conflict:       ['replan', 'escalate', 'stop']       │
   │  - env_tooling:        ['replan', 'escalate', 'stop']       │
   │  - code_defect:        ['repair', 'replan', 'escalate', 'stop']
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ transition-selector.js: selectTransitions(state)            │
   │  - Si remaining attempts > 0 y 'repair' permitido:          │
   │    emite `{ kind: 'execute', operation: 'recover' }`        │
   │  - Si requiere escalación o budget agotado:                 │
   │    emite `{ kind: 'escalate', operation: 'escalate' }`      │
   │    (PROHIBIDO emitir `decide` como fallback silencioso)     │
   │  - Siempre ofrece `{ kind: 'stop', operation: 'stop' }`     │
   └─────────────────────────────────────────────────────────────┘
```

### 3. Pipeline de Ejecución de Efecto, Zero-Delta, Scope Guard y Commit CAS

```
   ┌─────────────────────────────────────────────────────────────┐
   │ runKernelOperation({ operation, arguments, store, ... })    │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Pre-Effect Phase:                                           │
   │  1. Captura beforeState y beforeFingerprint                 │
   │  2. Si es repair: validateRepairScope(scope) FAIL-CLOSED    │
   │  3. reduceLifecycle() -> calcula efectos y deducciones base │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Executor Phase:                                             │
   │  - Invoca effectExecutor() -> retorna { ok, modified_files, │
   │    changed_lines, output_hashes, modified_paths, ... }      │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Post-Effect & Pre-CAS Validation:                           │
   │  1. Si repair: verifica modifiedPaths contra allowed_paths  │
   │  2. isZeroDeltaMutation() -> si true, descuenta 1 intento   │
   │     y 1 turno monotónicamente; registra evento en journal   │
   │  3. validateRecoveryHonesty() -> compara blockingFingerprint│
   │     - Si no avanza: rechaza ciclo y fuerza `escalate`/`stop`│
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Atomic CAS Commit:                                          │
   │  - authorityStore.compareAndSwap(headRevision, state, ...)  │
   │  - En conflicto CAS: re-sync preservando presupuestos       │
   └─────────────────────────────────────────────────────────────┘
```

---

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/lib/execution-budgets.js` | Modify | Exporta `isBudgetExhausted()` unificado (6 dimensiones de nodo + 4 de autoridad) con soporte para evaluación exhaustiva y reporte de dimensión. |
| `scripts/lib/execution-budgets.test.js` | Modify | Añade tests unitarios para `isBudgetExhausted()` con matrices de prueba para las 10 dimensiones individuales y compuestas. |
| `scripts/lib/failure-recovery.js` | Modify | Hace fail-closed a `validateRepairScope()` ante scopes vacíos/inválidos e integra validación de finding IDs y node IDs obligatorios ante mutaciones. |
| `scripts/lib/failure-recovery.test.js` | Modify | Añade casos de prueba negativos para `validateRepairScope` fail-closed y matrices de transición permitidas. |
| `scripts/lib/lifecycle-kernel/transition-selector.js` | Modify | Emite transiciones explícitas (`escalate`, `replan`, `repair`, `stop`) sin sustitución silenciosa de `escalate` por `decide`, integrando `isBudgetExhausted()`. |
| `scripts/lib/lifecycle-kernel/transition-selector.test.js` | Modify | Verifica la emisión de `escalate` explícito ante fallos ambiguos/agotamiento y el podado de recuperaciones agotadas. |
| `scripts/lib/lifecycle-kernel/reducer.js` | Modify | Integra `isBudgetExhausted()` para marcar `exhausted: true` en nodo/estado, y conecta contabilidad zero-delta estricta. |
| `scripts/lib/lifecycle-kernel/reducer.test.js` | Modify | Comprueba la preservación monotónica de presupuestos y el bloqueo de nodos agotados en `reducer`. |
| `scripts/lib/lifecycle-kernel/index.js` | Modify | Conecta `validateRepairScope()`, `validateRecoveryHonesty()`, zero-delta accounting y control presupuestario pre-CAS en `runKernelOperation()`. |
| `scripts/lib/lifecycle-kernel/index.test.js` | Modify | Tests de integración en `runKernelOperation` verificando honest recovery, scope fail-closed y contabilidad zero-delta en CAS. |
| `scripts/lib/lifecycle-model.js` | Modify | Reescritura completa de los 7 checkers de invariantes K5 hacia composición runtime/CAS/store real. |
| `scripts/lib/lifecycle-model.test.js` | Modify | Valida que los 7 checkers de invariantes K5 pasan contra la composición real del kernel. |
| `scripts/lib/k5-budgets-failures-recovery.test.js` | Modify | Amplía la suite de integración E2E de K5 con los nuevos contratos. |
| `docs/adr/adr-20260817-001-pure-decoupled-budget-evaluator-and-monotonic-state-accounting-with-telemetry-isolation.md` | Modify | Actualiza status de `proposed` a `accepted`. |
| `docs/adr/adr-20260817-002-structured-5-category-causal-failure-taxonomy-with-precedence.md` | Modify | Actualiza status de `proposed` a `accepted`. |
| `docs/adr/adr-20260817-003-closed-allowlisted-transition-matrix-bounded-repair-scopes-and-zero-delta-honesty-guarantees.md` | Modify | Actualiza status de `proposed` a `accepted`. |
| `package.json` | Modify | Incremento de versión de `2.45.7` a `2.45.8`. |
| `openspec/config.yaml` | Modify | Sincronización de versión a `2.45.8`. |

---

## Interfaces / Contracts

### 1. Evaluador Unificado de Presupuestos (`scripts/lib/execution-budgets.js`)

```javascript
/**
 * Evaluates whether any declared quota in a budget envelope is exhausted.
 * Inspects all 6 node dimensions (turns, patches, commands, wall_time_minutes, changed_lines, allowed_paths)
 * and all 4 authority dimensions (effect_attempts, authority_mutations, evidence_runs, review_sweeps).
 *
 * @param {Object} [budget] - Budget declaration object or container.
 * @param {Object} [consumed] - Consumed telemetry metrics.
 * @param {Object} [options]
 * @param {boolean} [options.isAuthority] - Explicitly check authority budget quotas.
 * @returns {{
 *   ok: boolean,
 *   exhausted: boolean,
 *   dimension?: string,
 *   code?: string,
 *   remaining: Object,
 *   violations: string[]
 * }}
 */
function isBudgetExhausted(budget = {}, consumed = {}, options = {}) {
  // Evaluates node dimensions and authority dimensions
  // Returns exhausted: true and code: 'BUDGET_EXHAUSTED' / 'AUTHORITY_BUDGET_EXHAUSTED'
  // if ANY single dimension reaches 0 remaining or is exceeded by consumed units.
}
```

### 2. Scope Guard de Reparación Fail-Closed (`scripts/lib/failure-recovery.js`)

```javascript
/**
 * Validates that a repair operation mutates strictly within declared, bounded scope.
 * Fails closed (ok: false) if scope is empty, undefined, or missing required bounding arrays
 * whenever targetNodeId, modifiedPaths, or resolvedFindingIds are present.
 *
 * @param {Object} params
 * @param {Object} params.scope - { node_ids?: string[], allowed_paths?: string[], finding_ids?: string[] }
 * @param {string} [params.targetNodeId]
 * @param {string[]} [params.modifiedPaths]
 * @param {string[]} [params.resolvedFindingIds]
 * @returns {{ ok: boolean, violations: string[] }}
 */
function validateRepairScope({
  scope = {},
  targetNodeId,
  modifiedPaths = [],
  resolvedFindingIds = [],
} = {}) {
  const violations = [];

  // Fail-closed check: if mutations, target node or findings are present, scope must provide bounding arrays
  if (targetNodeId) {
    if (!Array.isArray(scope.node_ids) || scope.node_ids.length === 0) {
      violations.push(`Scope missing required non-empty 'node_ids' array for target node '${targetNodeId}'`);
    } else if (!scope.node_ids.includes(targetNodeId)) {
      violations.push(`Target node ID '${targetNodeId}' is not in allowlisted scope: [${scope.node_ids.join(", ")}]`);
    }
  }

  if (Array.isArray(modifiedPaths) && modifiedPaths.length > 0) {
    if (!Array.isArray(scope.allowed_paths) || scope.allowed_paths.length === 0) {
      violations.push(`Scope missing required non-empty 'allowed_paths' array for modified paths [${modifiedPaths.join(", ")}]`);
    } else {
      for (const modPath of modifiedPaths) {
        if (!isPathAllowed(modPath, scope.allowed_paths)) {
          violations.push(`Modified path '${modPath}' violates bounded scope globs: [${scope.allowed_paths.join(", ")}]`);
        }
      }
    }
  }

  if (Array.isArray(resolvedFindingIds) && resolvedFindingIds.length > 0) {
    if (!Array.isArray(scope.finding_ids) || scope.finding_ids.length === 0) {
      violations.push(`Scope missing required non-empty 'finding_ids' array for resolved findings [${resolvedFindingIds.join(", ")}]`);
    } else {
      for (const fId of resolvedFindingIds) {
        if (!scope.finding_ids.includes(fId)) {
          violations.push(`Resolved finding ID '${fId}' is not in frozen finding scope: [${scope.finding_ids.join(", ")}]`);
        }
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}
```

### 3. Selector de Transiciones Explícitas (`scripts/lib/lifecycle-kernel/transition-selector.js`)

```javascript
/**
 * Selects valid lifecycle transitions from current state.
 * Emits explicit 'repair', 'replan', 'escalate', 'stop' operations based on causal failure category
 * and remaining budget quotas, without substituting 'escalate' with 'decide'.
 *
 * @param {Object} state
 * @returns {Array<Object>} orderedTransitions
 */
function selectTransitions(state) {
  // Evaluates node states and causal failure priority
  // Uses isBudgetExhausted() to prune execution transitions for exhausted nodes
  // Emits explicit escalate transitions when recovery cannot proceed within budget
}
```

### 4. Wiring en `runKernelOperation` (`scripts/lib/lifecycle-kernel/index.js`)

```javascript
// Post-effect evaluation & pre-CAS validation pipeline:
// 1. Repair Scope Validation:
if (operation === "repair" || operation === "recover" || args.scope) {
  const scopeValidation = validateRepairScope({
    scope: args.scope || effect.payload?.scope,
    targetNodeId: args.node_id,
    modifiedPaths: effectResult.modified_paths || args.modified_paths || [],
    resolvedFindingIds: effectResult.resolved_finding_ids || args.resolved_finding_ids || [],
  });
  if (!scopeValidation.ok) {
    return blockedResult(state, journal, "repair-scope-violation", {
      violations: scopeValidation.violations,
    });
  }
}

// 2. Zero-Delta Mutation Accounting:
const isZeroDelta = isZeroDeltaMutation({
  modifiedFilesCount: effectResult.modified_files_count ?? 0,
  changedLines: effectResult.changed_lines ?? 0,
  stateAdvanced: reduced.outcome === "advanced",
  outputHashBefore: effectResult.output_hash_before,
  outputHashAfter: effectResult.output_hash_after,
});
if (isZeroDelta && node) {
  node.budget = decrementBudgetMonotonic(node.budget, { turns: 1, effect_attempts: 1 });
  node.zero_delta_attempts = (node.zero_delta_attempts || 0) + 1;
}

// 3. Honest Recovery Validation:
if (operation === "recover" || operation === "repair") {
  const honesty = validateRecoveryHonesty({
    beforeState: state,
    afterState: reduced.state,
    outcome: reduced.outcome,
    causalFailure: node.failure || args.failure,
  });
  if (!honesty.ok) {
    return blockedResult(state, journal, honesty.code || "recovery-non-advancing", {
      next_transition: { kind: "escalate", operation: "escalate" },
    });
  }
}
```

---

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `isBudgetExhausted()` en `execution-budgets.test.js` | Pruebas parametrizadas para las 6 dimensiones de nodo y 4 de autoridad, con límites en cero, consumos exactos y excesos. |
| Unit | `validateRepairScope()` fail-closed en `failure-recovery.test.js` | Casos negativos con scopes `{}` / vacíos ante mutaciones, paths fuera de glob y findings ajenos. |
| Unit | `selectTransitions()` en `transition-selector.test.js` | Validación de emisión de `escalate` explícito ante `ambiguous_effect` y rechazo de silent `decide`. |
| Unit | `reduceLifecycle()` en `reducer.test.js` | Deducción monotónica en `start`, `fail`, `recover` y marcaje `exhausted: true` al agotar cuotas. |
| Integration | `runKernelOperation()` en `index.test.js` | Escenarios E2E con executor real: zero-delta decrementa turnos antes de CAS, rechazo fail-closed de repair scope y comprobación de `blockingFingerprint`. |
| Conformance | 7 Checkers K5 en `lifecycle-model.js` | Ejecución de los 7 checkers evaluando `createKernelRuntime()`, Store CAS, reconciliación de conflictos y ledger de permisos reales. |
| Regression | Suite completa del repositorio | Ejecución de `npm test` verificando 100% de paso en suites de unit, integration, lint y modelo. |

---

## Migration / Rollout

No requiere migración de esquemas de datos persistidos.
- **Transición de ADRs**: Los ADRs `adr-20260817-001`, `adr-20260817-002` y `adr-20260817-003` pasan de `proposed` a `accepted`.
- **Release Bump**: `package.json` y `openspec/config.yaml` se incrementan a versión `2.45.8`.
- **Rollback**: En caso de reversión, `git revert` restaura el estado previo sin efectos secundarios en disco.

---

## Open Questions

Ninguna. Todos los aspectos arquitectónicos y requerimientos de las 4 delta specs están completamente resueltos y especificados.
