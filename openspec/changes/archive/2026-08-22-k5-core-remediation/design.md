# Design: K5 Core Technical Remediation

## Technical Approach

Este diseño técnico establece la arquitectura e implementación detallada para resolver de forma definitiva las 7 brechas técnicas del núcleo de K5 identificadas tras el review de v2.45.11:

1. **Test E2E CAS de Carrera Post-Efecto (`REQ-execution-budgets-003`, `REQ-authority-store-003`)**: Suite E2E con 2 writers concurrentes ejecutando `effectExecutor` antes de la resolución CAS. Se verifica que exactamente un writer gana el CAS (`R0 -> R1`), mientras el perdedor recibe `cas-conflict`, retiene todas sus cuotas consumidas en el carry-over acumulado del runtime y no duplica efectos no idempotentes al reintentar contra la revisión ganadora.
2. **Carry-Over Multidimensional Runtime-Owned (`REQ-execution-budgets-003`)**: Extensión del acumulador `pendingCarryOver` en `createKernelRuntime` para registrar y propagar exhaustivamente el consumo de las 6 dimensiones de nodo (`turns`, `commands`, `patches`, `changed_lines`, `wall_time_minutes`, `allowed_paths`) y las 4 dimensiones de autoridad (`effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`), calculadas a partir de los deltas ejecutados reales durante operaciones que sufren `cas-conflict`.
3. **Semántica Contractual de Zero-Delta (`REQ-execution-budgets-004`)**: Delimitación estricta de la detección de mutaciones zero-delta y su penalización dual (`node.turns -= 1`, `authority_budget.effect_attempts -= 1`) exclusivamente a operaciones mutantes de código/archivos donde no hubo avance semántico (`reduced.outcome === "unchanged"` y 0 archivos/líneas modificadas). Las transiciones de ciclo de vida (`start`, `complete`, `fail`, `recover`, `replan`), diagnósticos de solo lectura y control terminal (`escalate`, `stop`) quedan inmunes a la penalización zero-delta.
4. **Unificación Determinista de `resolvePrimaryFailure()` (`REQ-failure-recovery-002`, `REQ-failure-recovery-003`)**: Estandarización de la resolución de fallos primarios en `transition-selector.js`, `operations.js` (`validateOperationTransition`), `index.js` (`issuePermitForSelectedTransition`) y `host-boundary.js`, garantizando la misma precedencia causal (1: `environment_tooling` > 2: `cas_conflict` > 3: `ambiguous_effect` > 4: `validation_gap` > 5: `code_defect`) y desempates lexicográficos idénticos.
5. **Aislamiento Concurrente Multi-Writer en AuthorityStore y Journal (`REQ-authority-store-003`, `REQ-authority-store-011`)**: Reemplazo de la variable escalar `midOpTicket` por una colección indexada `midOpTickets = new Map()` en cada sujeto del `AuthorityStore`, permitiendo que múltiples writers en vuelo emitan tickets de journal sobre la misma revisión base `R0` sin sobreescrituras destructivas, consumiendo atómicamente el ticket del ganador y preservando los tickets concurrentes hasta que el estado varíe.
6. **Emisor de Permits Estrictamente Autoritativo (`REQ-operation-permits-005`)**: Eliminación del fallback a `input.state` en `issuePermitForSelectedTransition()`. La emisión de `OperationPermit` requiere obligatoriamente un snapshot autoritativo de `AuthorityStore` (`store.snapshot(subject_id)`), fallando cerrado con `authoritative-snapshot-required` ante su ausencia, y validando head revision, presupuestos y matriz causal de forma previa a la emisión.
7. **Default Fail-Closed en `mapLegacyRoutingTag` (`REQ-failure-recovery-001`)**: Reconfiguración del fallback `default` en `mapLegacyRoutingTag()` para retornar `{ category: "validation_gap", code: "UNKNOWN_ROUTING_TAG" }`, asegurando que cualquier tag no reconocido prohíba transiciones `repair` y dirija a `replan`, `escalate` o `stop`.

---

## Architecture Decisions

| ID | Título | Opción Elegida | Alternativas Descartadas | Racional Técnico |
|---|---|---|---|---|
| **ADR-001** | Aislamiento Multi-Writer de Tickets Mid-Op en AuthorityStore | Colección `Map` de tickets indexada por token, `fromRevision` y `stateDigest` en `entry.midOpTickets`. | 1. Variable escalar única `midOpTicket` por sujeto.<br>2. Bloqueo pesimista exclusivo entre `commitJournal` y `compareAndSwap`. | La variable escalar causaba colisiones destructivas entre writers concurrentes. El bloqueo pesimista destruye la concurrencia optimista del store. |
| **ADR-002** | Controlled Issuer Estrictamente Autoritativo (Sin Fallback) | Exigir snapshot autoritativo de `AuthorityStore`; fallar cerrado (`authoritative-snapshot-required`) si no existe. | 1. Mantener fallback a `input.state`.<br>2. Confiar en validación diferida en `runKernelOperation`. | `input.state` permite a llamadores no confiables acuñar permisos sobre estados arbitrarios, eludiendo presupuestos y revisiones autoritativas. |
| **ADR-003** | Carry-Over Multidimensional Runtime-Owned de 10 Dimensiones | Acumular deltas reales ejecutados de 6 dimensiones de nodo y 4 de autoridad en el runtime ante `cas-conflict`. | 1. Carry-over solo de `turns` y `effect_attempts`.<br>2. Exigir `args.consumed` manual al llamador. | Perder dimensiones consumidas permite inflar presupuestos de comandos, patches y tiempo tras carreras CAS. |
| **ADR-004** | Delimitación Contractual de Zero-Delta a Mutaciones sin Progreso | Evaluar zero-delta únicamente ante operaciones de mutación de archivos con `reduced.outcome === "unchanged"`. | 1. Penalizar toda operación sin cambios en disco.<br>2. Evaluar solo conteo de archivos ignorando `outcome`. | Las transiciones de ciclo de vida y diagnósticos de lectura no modifican archivos pero avanzan el estado semántico legítimamente. |
| **ADR-005** | Default Fail-Closed a `validation_gap` en `mapLegacyRoutingTag` | Retornar `category: "validation_gap"` y `code: "UNKNOWN_ROUTING_TAG"` ante tags desconocidos. | 1. Mapear default a `code_defect` con `UNKNOWN_FAILURE_CODE`.<br>2. Lanzar excepción no capturada. | `code_defect` permitía erróneamente transiciones `repair` automáticas ante fallos desconocidos o de entorno. |
| **ADR-006** | Unificación Determinista de `resolvePrimaryFailure()` | Centralizar y reutilizar `resolvePrimaryFailure()` en selector, boundary de operaciones y emisor de permisos. | 1. Lógica ad-hoc o extracción de primer fallo en cada componente.<br>2. Ignorar desempates lexicográficos. | Garantiza comportamiento predecible y consistente en todo el ciclo de vida ante fallos heterogéneos mixtos. |

### Decision: Multi-Writer Ticket Isolation in AuthorityStore (ADR-001)

**Choice**: Reemplazar la propiedad escalar `entry.midOpTicket` en el registro de sujeto de `AuthorityStore` por una estructura `Map<string, { token: string, fromRevision: string, stateDigest: string }>` denominada `midOpTickets`. En `commitJournal`, cada llamada con `fromRevision` genera un ticket único y lo almacena en el mapa. En `compareAndSwap`, se valida y consume específicamente el ticket presentado, preservando los demás tickets concurrentes siempre que el `stateDigest` base del sujeto permanezca inalterado.

**Alternatives considered**:
1. *Variable escalar única*: Descartada porque cuando dos writers W1 y W2 ejecutan `commitJournal` en paralelo, W2 sobreescribe el ticket de W1, provocando que W1 falle su CAS de forma espuria.
2. *Mutex de exclusión mutua pesimista durante toda la operación*: Descartada porque anula la ventaja del modelo de concurrencia optimista (CAS) y bloquea operaciones de solo lectura y lecturas concurrentes de efectos.

**Rationale**: Permite que múltiples writers avancen paralelamente sus fases de journal (efectos en vuelo) y compitan limpiamente en el CAS final, garantizando que el ganador se consolide y el perdedor reciba un `cas-conflict` limpio sin corrupción de tickets.

### Decision: Strict Authoritative Controlled Issuer (ADR-002)

**Choice**: Eliminar `input.state` como fallback en `issuePermitForSelectedTransition()`. La función obtiene el snapshot autoritativo de `store.snapshot(subject_id)`. Si no existe o `store` no está presente, la emisión se rechaza con `{ ok: false, code: "authoritative-snapshot-required" }`.

**Alternatives considered**:
1. *Permitir `input.state` si el store no está configurado*: Descartada porque abre una brecha de seguridad donde componentes de host o workers pueden auto-otorgarse permisos sin verificación de revisión ni presupuestos autoritativos.
2. *Emitir permisos provisionales en memoria*: Descartada porque rompe el modelo autoritativo de K5 donde el AuthorityStore es la única fuente de verdad.

**Rationale**: Cumple estrictamente con `REQ-operation-permits-005`, cerrando la superficie pública de mutación contra permisos auto-acuñados o desalineados.

### Decision: Runtime-Owned Multidimensional Carry-Over (ADR-003)

**Choice**: El objeto `runKernelOperation` registra el consumo real incurrido en la ejecución de la operación (incluyendo `turns`, `patches`, `commands`, `changed_lines`, `wall_time_minutes`, `effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`). Ante un `cas-conflict`, devuelve este delta en `consumed_delta`. La envoltura `createKernelRuntime` acumula todas estas dimensiones en `pendingCarryOver.get(subjectId)` y las aplica monótonamente en el siguiente `runOperation` contra la nueva revisión `R1`.

**Alternatives considered**:
1. *Tracking parcial de solo turnos e intentos*: Descartada porque permite a un worker consumir cuotas masivas de comandos o líneas modificadas en un intento que pierde CAS y reiniciar esos contadores a cero en el reintento.
2. *Carry-over manejado manualmente por el llamador*: Descartada porque delega invariantes críticas del kernel a código externo no confiable.

**Rationale**: Asegura la monotonicidad estricta (`REQ-execution-budgets-003`) y previene la reposición fraudulenta de cuotas ante carreras CAS.

---

## Data Flow & Interaction Diagrams

### 1. Concurrent Post-Effect CAS Race with 2 Writers and Monotonic Carry-Over

```
Writer 1 (W1)               Writer 2 (W2)              Authority Store (R0)
     │                           │                              │
     │── [1] load(R0) ───────────┼─────────────────────────────→│ Head: R0
     │←─ state, rev: R0 ─────────┼──────────────────────────────│
     │                           │── [1] load(R0) ─────────────→│
     │                           │←─ state, rev: R0 ────────────│
     │                           │                              │
     │── [2] execute effect ─────┼──────────────────────────────│ W1 executes side-effects
     │   (turns:1, cmd:2, lines:50)                             │
     │                           │── [2] execute effect ────────│ W2 executes side-effects
     │                           │   (turns:1, cmd:3, lines:80) │
     │                           │                              │
     │── [3] commitJournal(R0) ──┼─────────────────────────────→│ Issue Ticket T1
     │←─ ok, ticket: T1 ─────────┼──────────────────────────────│ midOpTickets.set(T1)
     │                           │── [3] commitJournal(R0) ────→│ Issue Ticket T2
     │                           │←─ ok, ticket: T2 ────────────│ midOpTickets.set(T2) [T1 preserved!]
     │                           │                              │
     │── [4] compareAndSwap(R0,T1)─────────────────────────────→│ CAS Wins! R0 -> R1
     │←─ { ok: true, rev: R1 } ──┼──────────────────────────────│ Deletes T1; Head is now R1
     │                           │                              │
     │                           │── [4] compareAndSwap(R0,T2)─→│ CAS Loses! (rev mismatch R1 != R0)
     │                           │←─ { ok: false, cas-conflict }│
     │                           │                              │
     │                           │ [5] W2 Runtime Accumulates Carry-Over:
     │                           │     { turns: 1, commands: 3, changed_lines: 80, effect_attempts: 1 }
     │                           │                              │
     │                           │── [6] Re-sync & Retry (R1) ──→│ W2 loads R1
     │                           │   Deducts pending carry-over │
     │                           │── [7] compareAndSwap(R1) ───→│ CAS Wins! R1 -> R2
     │                           │←─ { ok: true, rev: R2 } ─────│ Budget strictly reflects W1 + W2
```

### 2. Multi-Ticket Isolation in Authority Store Two-Phase Commit

```
                                  AuthorityStore (Subject: default)
                                 ┌─────────────────────────────────┐
Writer A: commitJournal(R0) ───► │ midOpTickets:                   │
                                 │   "ticket-A" => { R0, digestS0 }│
Writer B: commitJournal(R0) ───► │   "ticket-B" => { R0, digestS0 }│ ◄── Both tickets co-exist!
                                 └─────────────────────────────────┘
                                                  │
Writer A: CAS(R0, ticket-A) ──────────────────────┤
                                                  ▼
                                 ┌─────────────────────────────────┐
                                 │ State: S1                       │
                                 │ Head Revision: R1               │
                                 │ midOpTickets:                   │
                                 │   "ticket-A" => [DELETED]       │
                                 │   "ticket-B" => [INVALIDATED/CLR]
                                 └─────────────────────────────────┘
```

### 3. Controlled Permit Issuance Decision Flow

```
issuePermitForSelectedTransition(input)
  │
  ├─► [1] Query store.snapshot(subject_id)
  │     └─► null or missing? ──► FAIL CLOSED: { ok: false, code: "authoritative-snapshot-required" }
  │
  ├─► [2] Verify expected_revision === head.revision
  │     └─► mismatch? ──► FAIL CLOSED: { ok: false, code: "stale-revision" }
  │
  ├─► [3] Check isBudgetExhausted(node.budget, state.authority_budget)
  │     ├─► Is operation "escalate" | "stop"? ──► Allowed (terminal control bypass)
  │     └─► Exhausted? ──► FAIL CLOSED: { ok: false, code: "budget-exhausted" }
  │
  ├─► [4] Resolve Primary Failure: primary = resolvePrimaryFailure(failures)
  │     └─► validateRecoveryTransition(primary.category, operation)
  │           └─► Unallowlisted? ──► FAIL CLOSED: { ok: false, code: "unallowlisted-recovery-transition" }
  │
  └─► [5] Mint OperationPermit & Record in Private Ledger
        └─► Return { ok: true, permit }
```

### 4. Zero-Delta Accounting Decision Flow

```
Post-Effect Evaluation
  │
  ├─► Is operation === "status" OR is terminal control ("escalate" | "stop")?
  │     └─► YES ──► Normal Completion (No Zero-Delta Check)
  │
  ├─► Did state advance semantically? (reduced.outcome !== "unchanged")
  │     └─► YES ──► Lifecycle Progress: Normal Completion
  │
  ├─► Were filesystem files or lines modified? (modifiedFiles > 0 || changedLines > 0)
  │     └─► YES ──► Code Mutation Succeeded: Normal Completion
  │
  └─► ZERO DELTA DETECTED: (reduced.outcome === "unchanged" AND 0 file changes)
        │
        ├─► [1] Increment targetNode.zero_delta_attempts += 1
        ├─► [2] Decrement targetNode.budget.turns -= 1
        ├─► [3] Decrement state.authority_budget.effect_attempts -= 1
        ├─► [4] Persist Journal Record: status="zero-delta-attempt", effect_id="zero-delta:..."
        └─► [5] Emit Event: { kind: "zero-delta-attempt", payload: { ... } }
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/causal-failure.js` | Modify | Actualizar `mapLegacyRoutingTag` para que `default` retorne `{ category: CAUSAL_CATEGORIES.VALIDATION_GAP, code: "UNKNOWN_ROUTING_TAG" }`. |
| `scripts/lib/authority-store/index.js` | Modify | Reemplazar `midOpTicket` escalar por `midOpTickets = new Map()` en `ensureSubject`. Gestionar múltiples tickets concurrentes en `commitJournal` y `compareAndSwapLocked`. |
| `scripts/lib/lifecycle-kernel/index.js` | Modify | 1. Eliminar fallback `input.state` en `issuePermitForSelectedTransition` (exigir snapshot autoritativo).<br>2. Integrar `resolvePrimaryFailure()` en emisor de permisos y boundary.<br>3. Computar deltas multidimensionales exhaustivos (10 dimensiones) en `runKernelOperation` y acumularlos en `pendingCarryOver` ante `cas-conflict`.<br>4. Acotar evaluación zero-delta a mutaciones de código con `reduced.outcome === "unchanged"`. |
| `scripts/lib/lifecycle-kernel/transition-selector.js` | Modify | Unificar extracción de fallos usando `resolvePrimaryFailure()` y asegurar emisión explícita de `{ kind: "escalate", operation: "escalate" }` ante fallos que requieran escalación. |
| `scripts/lib/lifecycle-kernel/operations.js` | Modify | En `validateOperationTransition()`, resolver fallos primarios vía `resolvePrimaryFailure()` antes de invocar `validateRecoveryTransition()`. |
| `scripts/lib/lifecycle-kernel/reducer.js` | Modify | Soportar deducción multidimensional completa de `consumedDelta` sobre las 6 dimensiones de nodo y 4 de autoridad. |
| `scripts/lib/execution-budgets.js` | Modify | Asegurar que `decrementBudgetMonotonic` y `isBudgetExhausted` manejen de forma simétrica las 6 dimensiones de nodo y 4 de autoridad. |
| `scripts/k5-e2e-budgets-recovery.test.js` | Modify | Añadir test E2E con 2 writers concurrentes ejecutando `effectExecutor` antes del commit CAS, validando monotonicidad de carry-over, aislamiento de tickets y no duplicación de efectos. |
| `openspec/changes/k5-core-remediation/decisions/adr-001.md` | Create | ADR: Multi-Writer Ticket Isolation in AuthorityStore. |
| `openspec/changes/k5-core-remediation/decisions/adr-002.md` | Create | ADR: Strict Authoritative Controlled Permit Issuer without `input.state` Fallback. |
| `openspec/changes/k5-core-remediation/decisions/adr-003.md` | Create | ADR: Runtime-Owned Multidimensional Carry-Over Across CAS Conflicts. |
| `openspec/changes/k5-core-remediation/decisions/adr-004.md` | Create | ADR: Contractual Zero-Delta Scoped to Stagnant Effect-Bearing Code Mutations. |
| `openspec/changes/k5-core-remediation/decisions/adr-005.md` | Create | ADR: Fail-Closed Default Mapping of Unknown Legacy Routing Tags to Validation Gap. |
| `openspec/changes/k5-core-remediation/decisions/adr-006.md` | Create | ADR: Unified Deterministic `resolvePrimaryFailure()` across Components. |

---

## Interfaces / Contracts

### 1. Multi-Ticket Management in AuthorityStore

```typescript
interface MidOpTicketRecord {
  token: string;
  fromRevision: string;
  stateDigest: string;
}

interface SubjectEntry {
  inner: MemoryStore;
  authority: AuthorityBag;
  budgets: Readonly<Budgets>;
  baselines: Map<string, string>; // revision => stateDigest
  midOpTickets: Map<string, MidOpTicketRecord>; // token => record
  midOpSeq: number;
  lock: Mutex;
  inflight: CoherentView | null;
}
```

**Modificación en `commitJournal`:**
```javascript
async function commitJournal(nextJournal, subjectId = defaultSubjectId, fromRevision = null) {
  const entry = subjects.get(subjectId);
  if (!entry) return fail("subject-not-found", { subject_id: subjectId });
  return entry.lock(async () => {
    await entry.inner.commitJournal(nextJournal);
    const loaded = await entry.inner.load();
    const revision = computeRevision(loaded.state, loaded.journal, entry.authority);
    let mid_op_ticket = null;
    if (fromRevision != null && fromRevision !== "") {
      const stateDigest = digestLifecycleState(loaded.state);
      mid_op_ticket = sha256Fingerprint("authority-store:mid-op-ticket", {
        from_revision: fromRevision,
        state_digest: stateDigest,
        seq: ++entry.midOpSeq,
      });
      entry.midOpTickets.set(mid_op_ticket, { token: mid_op_ticket, fromRevision, stateDigest });
    }
    return { ok: true, mid_op_ticket, revision };
  });
}
```

**Modificación en `compareAndSwapLocked`:**
```javascript
// Mid-op path: validar ticket específico en la colección
const ticket = midOpTicket ? entry.midOpTickets.get(midOpTicket) : null;
const midOpWithWriterTicket =
  baselineStateDigest != null &&
  baselineStateDigest === currentStateDigest &&
  nextJournal !== undefined &&
  digestJournal(nextJournal) === currentJournalDigest &&
  midOpTicket != null &&
  ticket != null &&
  midOpTicket === ticket.token &&
  expectedRevision === ticket.fromRevision &&
  baselineStateDigest === ticket.stateDigest;

// Tras commit exitoso:
if (midOpTicket) {
  entry.midOpTickets.delete(midOpTicket);
}
if (!stateUnchanged) {
  entry.midOpTickets.clear();
  entry.baselines.clear();
}
```

### 2. Strict Controlled Issuer Contract (`index.js`)

```typescript
interface IssuePermitInput {
  subject_id?: string;
  operation: LifecycleOperation;
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

type IssuePermitResult = 
  | { ok: true; permit: OperationPermit }
  | { ok: false; code: "authoritative-snapshot-required" | "stale-revision" | "budget-exhausted" | "unallowlisted-recovery-transition" | string };
```

**Implementación del Snapshot Autoritativo en `issuePermitForSelectedTransition`:**
```javascript
issuePermitForSelectedTransition(input = {}) {
  const subject_id = input.subject_id || options.subjectId || DEFAULT_SUBJECT_ID;
  const operation = input.operation || input.transitionOffer?.operation;
  const snap = store && typeof store.snapshot === "function" ? store.snapshot(subject_id) : null;
  
  // FAIL CLOSED: No fallback to input.state!
  if (!snap || !snap.state) {
    return { ok: false, code: "authoritative-snapshot-required" };
  }
  const state = snap.state;
  const currentRevision =
    store && typeof store.computeRevision === "function"
      ? store.computeRevision(snap.state, snap.journal, snap.authority)
      : null;

  // 1. Revision Check
  if (input.expected_revision && currentRevision && input.expected_revision !== currentRevision) {
    return { ok: false, code: "stale-revision" };
  }

  // 2. Budget Exhaustion Check (terminal control exempt)
  const isTerminalControlOp = operation === "escalate" || operation === "stop";
  if (!isTerminalControlOp) {
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

  // 3. Unified Causal Matrix Validation
  const targetNode = state.nodes?.[input.arguments?.node_id];
  if (targetNode && (targetNode.phase === "failed" || targetNode.phase === "interrupted")) {
    const rawFailures = [
      targetNode.failure,
      ...(Array.isArray(targetNode.failures) ? targetNode.failures : []),
      input.arguments?.failure,
      state.failure,
      ...(Array.isArray(state.failures) ? state.failures : []),
    ].filter(Boolean);
    const primaryFailure = resolvePrimaryFailure(rawFailures);
    if (primaryFailure && primaryFailure.category) {
      const remainingAttempts = state.authority_budget?.effect_attempts ?? (targetNode.budget?.turns);
      const causalCheck = validateRecoveryTransition(primaryFailure.category, operation, { remainingAttempts });
      if (!causalCheck.ok) {
        return { ok: false, code: "unallowlisted-recovery-transition" };
      }
    }
  }

  // ... proceed to permit minting
}
```

### 3. Exhaustive Multidimensional Carry-Over Contract

```typescript
interface ConsumedDelta {
  // 6 Node Dimensions
  turns?: number;
  patches?: number;
  commands?: number;
  wall_time_minutes?: number;
  changed_lines?: number;
  allowed_paths?: string[];
  // 4 Authority Dimensions
  effect_attempts?: number;
  authority_mutations?: number;
  evidence_runs?: number;
  review_sweeps?: number;
}
```

**Acumulación y Replay en `createKernelRuntime`:**
```javascript
function mergeDeltas(target, source) {
  const numericKeys = [
    "turns", "patches", "commands", "wall_time_minutes", "changed_lines",
    "effect_attempts", "authority_mutations", "evidence_runs", "review_sweeps",
  ];
  const out = { ...target };
  for (const k of numericKeys) {
    out[k] = (Number(target[k]) || 0) + (Number(source[k]) || 0);
  }
  return out;
}

// In runOperation():
const carryOver = pendingCarryOver.get(subjectId) || {};
const effectiveConsumed = mergeDeltas(carryOver, operationInput.consumed || {});

const res = await runKernelOperation({
  ...operationInput,
  consumed: effectiveConsumed,
  store,
  permitLedger: permitIssuer,
});

if (res.outcome === "blocked" && res.code === "cas-conflict") {
  const executedDelta = res.consumed_delta || { turns: 1, effect_attempts: 1 };
  const prior = pendingCarryOver.get(subjectId) || {};
  pendingCarryOver.set(subjectId, mergeDeltas(prior, executedDelta));
} else if (res.outcome === "advanced" || res.outcome === "terminal") {
  pendingCarryOver.delete(subjectId);
}
```

---

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| **Unit** (`scripts/lib/causal-failure.test.js`) | Default fail-closed en `mapLegacyRoutingTag` retornando `validation_gap` (`UNKNOWN_ROUTING_TAG`). | Test de aserción con tags desconocidos como `unknown-tag-xyz`, `invalid`, `""`. |
| **Unit** (`scripts/lib/authority-store/index.test.js`) | Aislamiento concurrente de `midOpTickets` con 2 writers llamando `commitJournal` en paralelo sobre `R0`. | Test unitario de tickets concurrentes verificando que ambos coexisten en el store y que el consumo de T1 no invalida T2 antes del avance de estado. |
| **Unit** (`scripts/lib/lifecycle-kernel/index.test.js`) | Rechazo fail-closed en `issuePermitForSelectedTransition` cuando no hay snapshot autoritativo (`input.state` no utilizado). | Invocar emisor sin store snapshot y con `input.state` falso; verificar retorno `authoritative-snapshot-required`. |
| **Integration** (`scripts/lib/k5-budgets-failures-recovery.test.js`) | Unificación de `resolvePrimaryFailure` en selector y boundary; semántica contractual zero-delta. | Tests de transición con fallos mixtos (`code_defect` + `environment_tooling`) y validación de penalización zero-delta solo ante mutaciones vacías con `reduced.outcome === "unchanged"`. |
| **E2E** (`scripts/k5-e2e-budgets-recovery.test.js`) | Carrera CAS post-efecto con 2 writers concurrentes, ejecución previa de `effectExecutor`, retención multidimensional de carry-over en perdedor y reintento exitoso sobre revisión ganadora sin duplicación de efectos. | Ejecución asíncrona concurrente con `Promise.all([writer1.runOperation(), writer2.runOperation()])`, verificando desenlace CAS, cuotas decrecientes monótonas y no duplicación de efectos en loser retry. |

---

## Migration / Rollout Plan

1. **Compatibilidad Hacia Atrás**:
   - Todas las llamadas estándar a `createKernelRuntime` y `createAuthorityStore` son 100% compatibles hacia atrás.
   - Los tests existentes que interactúen con `issuePermitForSelectedTransition` recibirán soporte transparente siempre que se utilice la instancia estándar de store vinculada al runtime.
2. **Endurecimiento de Invocaciones Inseguras**:
   - Llamadores que previamente pasaban `input.state` huérfano deberán migrar a proveer el store autoritativo (`createAuthorityStore` o `createMemoryStore` empaquetado).
3. **Rollout Atómico**:
   - Las 7 remediaciones se aplican conjuntamente en el kernel de K5, garantizando que el conjunto completo de especificaciones K5 quede unificado y validado por la suite de tests (`npm test`).

---

## Open Questions

None. Todas las decisiones arquitectónicas y contratos técnicos están cerrados y alineados con las 4 especificaciones delta de K5.
