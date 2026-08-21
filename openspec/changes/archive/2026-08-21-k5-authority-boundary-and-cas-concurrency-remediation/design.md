# Design: K5 Authority Boundary and CAS Concurrency Remediation

## Technical Approach

Este diseño técnico establece la arquitectura de remediación para cerrar definitivamente los cinco bloqueantes estructurales de la fase K5 en el ciclo de vida del kernel autoritativo:

1. **Controlled Issuer Autoritativo con Store Query & Preflight Causal (`REQ-operation-permits-005`)**: `createKernelRuntime().issuePermitForSelectedTransition()` consulta el snapshot autoritativo de `AuthorityStore` (`store.snapshot(subject_id)` o `store.load(subject_id)`), verifica que la revisión coincida (`expected_revision === head.revision`), evalúa el agotamiento presupuestario de nodo y autoridad con `isBudgetExhausted()`, y valida de forma fail-closed la matriz causal de recuperación (`validateRecoveryTransition()`) antes de emitir cualquier `OperationPermit`.
2. **Commit CAS de Transiciones Terminales ante Agotamiento Presupuestario (`REQ-failure-recovery-002`, `REQ-lifecycle-kernel-runtime-025`)**: `runKernelOperation()` discrimina las operaciones terminales de control (`escalate`, `stop`) del preflight de bloqueo de presupuestos agotados, permitiendo que reduzcan a estado terminal y ejecuten el commit CAS en el Authority Store para persistir el estado consolidado de forma durable.
3. **Enforcement Causal en Boundary de Validación (`REQ-failure-recovery-003`, `REQ-lifecycle-kernel-runtime-026`)**: Integración estricta de `validateRecoveryTransition(primaryFailure.category, operation)` dentro de `validateOperationTransition()` en `operations.js` y en el preflight de `runKernelOperation()`, garantizando que ninguna operación no allowlisteada para la taxonomía causal activa pueda ejecutarse ni consumir efectos (0 llamadas a `effectExecutor`).
4. **Carry-Over Presupuestario Runtime-Owned ante Carreras CAS Multi-Writer (`REQ-execution-budgets-003`, `REQ-lifecycle-model-conformance-011`)**: El runtime rastrea automáticamente las unidades de cuota consumidas por efectos ejecutados (`turns`, `effect_attempts`, etc.) durante una operación que pierde una carrera CAS (`cas-conflict`). Al resincronizarse contra el nuevo head (`R1`), el runtime deduce monótonamente este consumo pendiente en el siguiente intento sin requerir que el llamador inyecte argumentos fabricados (`args.consumed`).
5. **Semántica Precisa de Zero-Delta Bounded a Mutaciones de Código (`REQ-execution-budgets-004`, `REQ-lifecycle-kernel-runtime-027`)**: La evaluación de `isZeroDeltaMutation()` y la deducción dual (`node.turns` + `authority_budget.effect_attempts`) se acota estrictamente a operaciones de mutación de código/archivos que no produzcan avance (`reduced.outcome === "unchanged"` con 0 archivos/líneas modificadas). Las transiciones legítimas del ciclo de vida, diagnósticos de solo lectura y operaciones de control terminal (`escalate`, `stop`) no se penalizan como zero-delta.
6. **Promoción de ADRs**: Formalización de ADR-001 a ADR-005 en `decisions/` y promoción de `docs/adr/adr-20260820-007` a `011` a `Status: accepted`.

---

## Architecture Decisions

| ID | Título | Opción Elegida | Alternativas Descartadas | Racional Técnico |
|---|---|---|---|---|
| **ADR-001** | Controlled Issuer Autoritativo con Store Query y Matriz Causal | El runtime consulta el Authority Store (`snapshot`/`load`), evalúa `isBudgetExhausted()` sobre el snapshot autoritativo y valida `validateRecoveryTransition()` antes de emitir permisos. | 1. Emisión puramente en memoria sin validar store.<br>2. Validación diferida a `runKernelOperation`. | Evita que se emitan permisos inválidos o sobre estados desfasados; garantiza fail-closed antes de cualquier invocación pública. |
| **ADR-002** | Commit CAS de Transiciones Terminales bajo Presupuestos Agotados | `runKernelOperation()` excluye transiciones terminales de control (`escalate`, `stop`) del bloqueo preflight de agotamiento y consolida su estado vía CAS. | 1. Bloquear toda operación ante presupuesto agotado.<br>2. Abortar `escalate` en memoria sin commit CAS. | Si `escalate`/`stop` se bloquean en preflight, el sistema queda congelado en estado fallido sin persistir el desenlace terminal en el Authority Store. |
| **ADR-003** | Enforcement Causal en Boundary de Validación `validateOperationTransition` | `validateOperationTransition()` y `runKernelOperation()` validan directamente `validateRecoveryTransition(primaryFailure.category, operation)` contra la taxonomía causal. | 1. Validar solo en el selector de transiciones.<br>2. Confiar en la validación del llamador. | Impide que invocaciones arbitrarias que eludan el selector ejecuten operaciones prohibidas (ej. `repair` ante `ambiguous_effect`). |
| **ADR-004** | Carry-Over Presupuestario Runtime-Owned ante Conflicto CAS Multi-Writer | El runtime preserva internamente las cuotas consumidas por efectos ejecutados tras `cas-conflict` y las deduce en reintentos sin argumentos fabricados. | 1. Restablecer la cuota al resincronizar.<br>2. Exigir que el llamador pase manualmente `args.consumed`. | Los efectos externos ya ocurrieron; restaurar cuotas viola la monotonicidad estricta (`inv-k5-budget-monotonicity`) y exigir argumentos manuales rompe la encapsulación. |
| **ADR-005** | Zero-Delta Bounded a Mutaciones de Código sin Avance Semántico | Zero-delta solo penaliza mutaciones effect-bearing de código con `reduced.outcome === "unchanged"`. Avances del ciclo de vida y control quedan exentos. | 1. Penalizar toda operación con 0 archivos modificados.<br>2. Descontar únicamente turnos de nodo sin cuota de autoridad. | Operaciones legítimas de transición o inspección no deben consumir penalizaciones de zero-delta, y las mutaciones vacías deben registrar evento durable en journal. |

---

## Data Flow & Sequence Diagrams

### 1. Controlled Permit Issuance with Authority Store Consultation

```
Caller                   createKernelRuntime / Issuer              Authority Store
  │                                   │                                  │
  │── issuePermitForSelected... ─────→│                                  │
  │   { operation, expected_rev }     │── snapshot(subject_id) ─────────→│
  │                                   │←─ { state, journal, authority } ─│
  │                                   │
  │                                   │ [1] Check Revision: expected_rev === head_rev
  │                                   │ [2] Check Budget: isBudgetExhausted(node, authority)
  │                                   │ [3] Check Causal Allowlist: validateRecoveryTransition()
  │                                   │
  │                                   │ [Pass] Mint & Ledger Record
  │←── { ok: true, permit } ──────────│
  │    (or { ok: false, code })       │
```

### 2. Concurrent Multi-Writer CAS Race and Runtime-Owned Carry-Over

```
Writer 1 (W1)              Writer 2 (W2)              Authority Store (R0)
     │                          │                              │
     │── runOperation (start) ──┼─────────────────────────────→│ [R0]
     │   (Executes effect)      │── runOperation (start) ─────→│ [R0]
     │                          │   (Executes effect: turn=1)  │
     │── CAS Commit (R0 -> R1) ─┼─────────────────────────────→│
     │←─ { ok: true, R1 } ──────┼──────────────────────────────│ [Head advanced to R1]
     │                          │── CAS Commit (R0) ──────────→│
     │                          │←─ { ok: false, cas-conflict }│
     │                          │                              │
     │                          │ [W2 Runtime saves carry-over: { turns: 1, attempts: 1 }]
     │                          │                              │
     │                          │── Retry against R1 ─────────→│ [W2 re-syncs to R1]
     │                          │   (Auto-applies carry-over)  │
     │                          │── CAS Commit (R1 -> R2) ────→│ [Budget strictly decremented]
     │                          │←─ { ok: true, R2 } ──────────│
```

### 3. Preflight & Execution Boundary with Terminal Transition CAS Bypass

```
runKernelOperation(input)
  │
  ├─► [Preflight 1]: Operation allowed in transition taxonomy?
  │
  ├─► [Preflight 2]: Is terminal control op ("escalate" | "stop")?
  │     ├─► YES: Bypass isBudgetExhausted() check.
  │     └─► NO:  Evaluate isBudgetExhausted(node.budget, state.authority_budget).
  │              If exhausted → FAIL CLOSED (0 effectExecutor calls).
  │
  ├─► [Preflight 3]: validateRecoveryTransition(primaryFailure.category, operation).
  │                  If unallowlisted → FAIL CLOSED (0 effectExecutor calls).
  │
  ├─► [Preflight 4]: If operation === "repair", validateRepairScope(args.scope).
  │                  If missing/invalid → FAIL CLOSED (0 effectExecutor calls).
  │
  ├─► [Execution]: Execute effects via effectExecutor() with journal barriers.
  │
  ├─► [Post-Effect]: If mutation is zero-delta AND reduced.outcome === "unchanged":
  │                  Dual decrement (node.turns + authority.effect_attempts) & persist journal event.
  │
  └─► [CAS Commit]: Commit state & authority bag to AuthorityStore via compareAndSwap().
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/lifecycle-kernel/index.js` | Modify | 1. `createKernelRuntime().issuePermitForSelectedTransition()` consulta `store.snapshot(subject_id)` (o `store.load`), valida `expected_revision`, `isBudgetExhausted()` y `validateRecoveryTransition()` fail-closed.<br>2. `runKernelOperation()` excluye transiciones `escalate` y `stop` del bloqueo preflight de budget exhaustion.<br>3. Integrar validación causal preflight con `validateRecoveryTransition()`.<br>4. Retener consumo en el runtime ante `cas-conflict` y deducir automáticamente en reintentos.<br>5. Restringir `isZeroDelta` a mutaciones con `reduced.outcome === "unchanged"`. |
| `scripts/lib/lifecycle-kernel/operations.js` | Modify | Integrar `validateRecoveryTransition(primaryFailure.category, operation)` dentro de `validateOperationTransition()` para fail-closed ante transiciones causales no allowlisteadas. |
| `scripts/lib/lifecycle-kernel/reducer.js` | Modify | Asegurar que `reduceLifecycle` procese correctamente carry-over de presupuestos y que las transiciones terminales `escalate`/`stop` generen `outcome: "terminal"` persistible. |
| `scripts/lib/lifecycle-model.js` | Modify | Actualizar `checkK5BudgetMonotonicity()` para ejecutar una carrera multi-writer real con 2 writers concurrentes sobre `R0` vía `Promise.all`, verificando que el writer perdedor de CAS retiene su cuota consumida al reintentar contra `R1` sin argumentos fabricados. Actualizar `checkK5ZeroDeltaConsumption()` para verificar mutaciones no avanzadas vs avances de ciclo de vida. |
| `docs/adr/adr-20260820-007-canonical-recovery-transitions.md` | Modify | Actualizar a `Status: accepted`. |
| `docs/adr/adr-20260820-008-exhaustive-budget-preflight.md` | Modify | Actualizar a `Status: accepted`. |
| `docs/adr/adr-20260820-009-mandatory-repair-scope-preflight.md` | Modify | Actualizar a `Status: accepted`. |
| `docs/adr/adr-20260820-010-dual-zero-delta-accounting-and-journaling.md` | Modify | Actualizar a `Status: accepted`. |
| `docs/adr/adr-20260820-011-cas-conflict-budget-preservation.md` | Modify | Actualizar a `Status: accepted`. |
| `openspec/changes/k5-authority-boundary-and-cas-concurrency-remediation/decisions/adr-001.md` | Create | ADR de Controlled Issuer con Authority Store Query y Matriz Causal. |
| `openspec/changes/k5-authority-boundary-and-cas-concurrency-remediation/decisions/adr-002.md` | Create | ADR de Transiciones Terminales en CAS ante Presupuesto Agotado. |
| `openspec/changes/k5-authority-boundary-and-cas-concurrency-remediation/decisions/adr-003.md` | Create | ADR de Enforcement Causal en Boundary de Validación. |
| `openspec/changes/k5-authority-boundary-and-cas-concurrency-remediation/decisions/adr-004.md` | Create | ADR de Carry-Over Presupuestario Runtime-Owned ante Conflicto CAS. |
| `openspec/changes/k5-authority-boundary-and-cas-concurrency-remediation/decisions/adr-005.md` | Create | ADR de Semántica Precisa de Zero-Delta Bounded a Mutaciones de Código. |

---

## Interfaces / Contracts

### 1. Controlled Issuer & Store Authority Validation Signature

```typescript
interface IssuePermitInput {
  subject_id?: string;
  operation: "start" | "complete" | "fail" | "repair" | "recover" | "replan" | "escalate" | "stop" | "invalidate-node";
  expected_revision: string;
  arguments?: Record<string, any>;
  transitionOffer?: TransitionOffer;
  policyDecision?: PolicyDecision;
  humanDecision?: HumanDecision;
  kernelRule?: KernelRule;
  offer_id?: string;
  decision_id?: string;
  rule_id?: string;
}

interface IssuePermitResult {
  ok: boolean;
  code?: string;
  permit?: OperationPermit;
  violations?: string[];
}
```

**Comportamiento del Controlled Issuer en `createKernelRuntime`:**
```javascript
issuePermitForSelectedTransition(input = {}) {
  const subject_id = input.subject_id || options.subjectId || DEFAULT_SUBJECT_ID;
  const snap = store.snapshot ? store.snapshot(subject_id) : null;
  const state = snap?.state || input.state || null;
  const currentRevision = snap && store.computeRevision
    ? store.computeRevision(snap.state, snap.journal, snap.authority)
    : null;

  // 1. Revision Check
  if (input.expected_revision && currentRevision && input.expected_revision !== currentRevision) {
    return { ok: false, code: "stale-revision" };
  }

  // 2. Budget Exhaustion Check
  if (state) {
    if (state.authority_budget && isBudgetExhausted(state.authority_budget, {}, { isAuthority: true }).exhausted) {
      return { ok: false, code: "budget-exhausted" };
    }
    const nodeId = input.arguments?.node_id;
    if (nodeId && state.nodes?.[nodeId]) {
      const node = state.nodes[nodeId];
      if (node.exhausted || (node.budget && isBudgetExhausted(node.budget).exhausted)) {
        return { ok: false, code: "budget-exhausted" };
      }
    }
  }

  // 3. Causal Recovery Matrix Validation
  const operation = input.operation || input.transitionOffer?.operation;
  const targetNode = state?.nodes?.[input.arguments?.node_id];
  const primaryFailure = targetNode?.failure || state?.failure;
  if (primaryFailure && primaryFailure.category) {
    const causalCheck = validateRecoveryTransition(primaryFailure.category, operation, {
      remainingAttempts: state?.authority_budget?.effect_attempts,
    });
    if (!causalCheck.ok) {
      return { ok: false, code: "unallowlisted-recovery-transition" };
    }
  }

  // 4. Delegate to internal issueOperationPermit
  return issueOperationPermit({
    ledger: permitIssuer,
    expected_revision: input.expected_revision,
    subject_id,
    ...
  });
}
```

### 2. Runtime CAS Carry-Over Context Management

```javascript
function createKernelRuntime(options = {}) {
  const permitIssuer = createPermitAuthorityIssuer();
  const store = options.store || createAuthorityStore(options);
  const pendingCarryOver = new Map(); // key: subject_id -> { turns: N, effect_attempts: M, ... }

  return {
    async runOperation(input = {}) {
      const subjectId = input.subjectId || DEFAULT_SUBJECT_ID;
      const carryOver = pendingCarryOver.get(subjectId) || null;
      
      const result = await runKernelOperation({
        ...input,
        store,
        permitLedger: permitIssuer,
        carryOverConsumed: carryOver,
      });

      if (!result.ok && result.code === "cas-conflict") {
        // Accumulate consumed units incurred during the attempted execution
        const consumedInRun = result.consumedInRun || { turns: 1, effect_attempts: 1 };
        pendingCarryOver.set(subjectId, mergeConsumed(carryOver, consumedInRun));
      } else if (result.outcome === "advanced" || result.outcome === "terminal") {
        // Clear carry-over on successful CAS commit
        pendingCarryOver.delete(subjectId);
      }

      return result;
    },
    ...
  };
}
```

### 3. Boundary Causal Validation in `operations.js`

```javascript
function validateOperationTransition(state, action = {}) {
  const operation = action.operation;
  const args = action.arguments && typeof action.arguments === "object" ? action.arguments : {};
  const nodeId = args.node_id;
  const node = getNode(state, nodeId);

  // Check Causal Matrix if node or state has an active failure
  const primaryFailure = node?.failure || args.failure || state?.failure;
  if (primaryFailure && primaryFailure.category) {
    const remainingAttempts = state?.authority_budget?.effect_attempts;
    const causalRes = validateRecoveryTransition(primaryFailure.category, operation, { remainingAttempts });
    if (!causalRes.ok) {
      return failClosed(state, "unallowlisted-recovery-transition", allowedOperationsFor(state, nodeId));
    }
  }
  ...
}
```

---

## Testing Strategy

| Layer | Component | Test Target & Scenario |
|-------|-----------|------------------------|
| **Unit** | `scripts/lib/lifecycle-kernel/permits.test.js` | 1. Issuer rechaza emisión cuando el Authority Store tiene presupuestos agotados.<br>2. Issuer rechaza emisión cuando `expected_revision` no coincide con el store.<br>3. Issuer rechaza operaciones no allowlisteadas para el fallo causal activo. |
| **Unit** | `scripts/lib/lifecycle-kernel/operations.test.js` | 1. `validateOperationTransition` rechaza `repair` ante `ambiguous_effect` o `validation_gap`.<br>2. `validateOperationTransition` permite `repair` ante `code_defect` con cuota positiva.<br>3. `validateOperationTransition` permite `escalate` y `stop` universalmente. |
| **Integration** | `scripts/lib/lifecycle-kernel/index.test.js` | 1. Preflight budget exhaustion bloquea ejecuciones normales con 0 llamadas a `effectExecutor`.<br>2. `escalate` y `stop` ejecutan y persisten commit CAS ante presupuesto agotado.<br>3. Zero-delta dual decrement se aplica a mutaciones no avanzadas (`reduced.outcome === "unchanged"`) y registra journal durable.<br>4. Avances de ciclo de vida sin cambios en archivos no sufren penalización zero-delta. |
| **Model Invariants** | `scripts/lib/lifecycle-model.js` | 1. `inv-k5-budget-monotonicity`: carrera concurrente real con 2 writers (`Promise.all`), verificando carry-over runtime-owned sin `args.consumed` inyectado.<br>2. `inv-k5-allowlist-enforcement`: enforcement estricto de matriz causal en boundary.<br>3. `inv-k5-zero-delta-consumption`: verificación de contabilidad dual para mutaciones no avanzadas.<br>4. `inv-k5-budget-exhaustion-terminal`: verificación de commit CAS terminal bajo presupuestos agotados. |

---

## Migration / Rollout

No data migration required. El cambio preserva la compatibilidad hacia atrás del Authority Store y el formato de los recibos de operación. Las suites de tests existentes continuarán ejecutándose de forma determinista bajo el runtime del kernel remediado.

---

## Open Questions

- None. Todos los requisitos y bloqueantes estructurales de K5 han sido acotados y resueltos en las especificaciones delta y en este diseño.
