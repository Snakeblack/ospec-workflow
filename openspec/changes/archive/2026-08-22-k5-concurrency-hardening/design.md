# Design: K5 Concurrency Hardening

## Technical Approach

Este diseño técnico establece el blindaje de concurrencia y resuelve las 7 brechas identificadas en el núcleo K5 (v2.45.12). La estrategia se fundamenta en seis pilares arquitectónicos:

1. **Ownership Autoritatio de Consumo (`ExecutionUsage`)**: Desvincular el cómputo de deltas de consumo de la entrada externa del cliente (`input.consumed`) y anclarlo estrictamente al resultado emitido por el ejecutor de efectos (`result.usage` / `result.execution_usage`).
2. **Aislamiento de Presupuestos Concurrentes**: Particionar el acumulador de carry-over en el runtime (`pendingCarryOver`) mediante una clave compuesta `${subjectId}:${nodeId}`, impidiendo que fallos CAS en un nodo contaminen las cuotas de otros nodos paralelos bajo el mismo sujeto.
3. **Journaling Merge-Safe y Preservación de Tickets CAS**: Implementar merge/upsert idempotente por `effect_id` en `commitJournal` a través de todos los stores (`AuthorityStore`, `MemoryStore`, `FileSystemStore`), y sustituir el borrado global de tickets (`midOpTickets.clear()`) por la eliminación exclusiva del ticket ganador (`midOpTickets.delete(winner)`), preservando los tickets de los peers concurrentes.
4. **Idempotencia Absoluta de Efectos**: Garantizar 0 re-ejecuciones de efectos ya completados mediante la reconciliación previa en el journal (`action: "skip"`), validado con tests E2E de concurrencia real.
5. **Delimitación Contractual de Zero-Delta**: Delimitar el cómputo de zero-delta a mutaciones de código reales con `effectProgress === false` y cero modificaciones de archivos/líneas, distinguiéndolas de avances de estado de ciclo de vida (`repair` con `outcome: "advanced"`).
6. **Normalización Causal Unificada en Host Boundary**: Integrar `resolvePrimaryFailure` en `host-boundary.js` para normalizar fallos de transporte/puertos en la categoría canónica `environment_tooling`.

## Architecture Decisions

### Decision: Runtime/Executor-Owned ExecutionUsage Interface

**Choice**: Extraer los deltas de consumo presupuestario exclusivamente desde `result.usage` o `result.execution_usage` devueltos por `effectExecutor`. Eliminar `input.consumed` como fuente de autoridad contable en `runKernelOperation`, `reduceLifecycle` y `createKernelRuntime`.
**Alternatives considered**:
- *Mantener `input.consumed` como autoridad*: Rechazado porque permite a llamadores externos manipular o subdeclarar su consumo saltándose los límites autoritativos.
- *Estimación estática pre-ejecución*: Rechazado porque variables dinámicas (líneas modificadas reales, tiempo de pared, comandos ejecutados) solo se conocen tras invocar el efecto.
**Rationale**: Garantiza la integridad del ledger de presupuestos autoritativos e impide evasiones de cuota.

### Decision: Partitioned Carry-Over Keying by `${subjectId}:${nodeId}`

**Choice**: Indexar `pendingCarryOver` en el runtime utilizando la clave `${subjectId}:${nodeId}` (con fallback `${subjectId}:default`), evaluando y deduciendo el carry-over de forma estrictamente aislada por nodo.
**Alternatives considered**:
- *Carry-over plano a nivel de sujeto*: Rechazado porque dos tareas concurrentes (`N1` y `N2`) bajo el mismo sujeto se contaminan mutuamente, causando agotamiento espurio de cuotas en `N2` tras un conflicto CAS en `N1`.
- *Paso efímero de carry-over en argumentos*: Rechazado porque rompe el desacoplamiento ante reintentos asíncronos y depende de la honestidad del caller.
**Rationale**: Garantiza aislamiento multi-nodo en ejecuciones paralelas bajo un mismo sujeto.

### Decision: Merge-Safe Journal Upsert by `effect_id` and Peer Mid-Op Ticket Preservation

**Choice**: Aplicar merge/upsert por `effect_id` en `commitJournal` en `MemoryStore`, `FileSystemStore` y `AuthorityStore`. En `AuthorityStore.compareAndSwap`, eliminar únicamente el ticket del writer ganador (`entry.midOpTickets.delete(midOpTicket)`), preservando intactos los tickets de los peers concurrentes.
**Alternatives considered**:
- *Sobreescritura destructiva de journal*: Rechazado porque los reintentos multi-writer sobreescriben entradas intermedias registradas por otros writers concurrentes.
- *Limpieza total `entry.midOpTickets.clear()` tras commit*: Rechazado porque invalida destructivamente los tickets de writers perdedores que aún necesitan reconciliar su CAS.
**Rationale**: Permite reconciliación segura y libre de carreras destructivas en escrituras en dos fases concurrentes.

### Decision: Zero-Re-execution Guarantee on CAS Conflict Retry

**Choice**: Ante un reintento post-conflicto CAS, el runtime consulta el journal autoritativo; si el efecto ya fue completado (`status: "completed"` para ese `effect_id`), `reconcileEffect` emite `action: "skip"`, evitando invocar `effectExecutor` y reutilizando el resultado durable previo.
**Alternatives considered**:
- *Re-ejecutar el efecto en cada intento*: Rechazado porque duplica efectos secundarios no idempotentes y agota cuotas innecesariamente.
- *Rollback de efectos ejecutados*: Rechazado porque efectos en el mundo real no siempre son reversibles atómicamente.
**Rationale**: Idempotencia estricta y protección contra duplicación de efectos secundarios en carreras CAS.

### Decision: Contractual Zero-Delta Scoped to Stagnant Code Mutations

**Choice**: Restringir la deducción dual de zero-delta (`turns` de nodo y `effect_attempts` de autoridad) exclusivamente a pasos de mutación de código/archivos que no produzcan avance de estado (`effectProgress === false` y cero líneas/archivos modificados). Eximir explícitamente operaciones de control de ciclo de vida (`repair` retornando `advanced`, `escalate`, `stop`, consultas de estado e inspecciones).
**Alternatives considered**:
- *Penalizar cualquier operación con 0 modificaciones de archivos*: Rechazado porque transiciones legítimas de ciclo de vida no modifican código y quedarían bloqueadas indebidamente.
- *No penalizar mutaciones de código vacías*: Rechazado porque permitiría bucles infinitos de reparación estéril sin coste.
**Rationale**: Cumple `REQ-execution-budgets-004` alineando la penalización con la inactividad real en mutaciones de código.

### Decision: Unified Causal Failure Normalization in Host Boundary

**Choice**: Integrar `resolvePrimaryFailure` en `host-boundary.js` para clasificar fallos de transporte, puertos y procesos bajo la categoría canónica `environment_tooling` con precedencia determinista.
**Alternatives considered**:
- *Códigos ad-hoc por transporte*: Rechazado porque rompe la matriz de recuperación canónica en las capas superiores.
- *Mapear a `code_defect`*: Rechazado porque habilitaría indebidamente transiciones de `repair` sobre fallos de infraestructura.
**Rationale**: Unifica la semántica causal en todas las fronteras del sistema.

## Data Flow

```text
               ┌─────────────────────────────────────────────────────────┐
               │                     Kernel Runtime                      │
               └────────────────────────────┬────────────────────────────┘
                                            │
           ┌────────────────────────────────┴────────────────────────────────┐
           ▼                                                                 ▼
┌───────────────────────┐                                         ┌───────────────────────┐
│ Writer 1 (Node N1)    │                                         │ Writer 2 (Node N2)    │
│ key: S1:N1            │                                         │ key: S1:N2            │
└──────────┬────────────┘                                         └──────────┬────────────┘
           │                                                                 │
           ├─► effectExecutor()                                              ├─► effectExecutor()
           │   emits: result.usage                                           │   emits: result.usage
           │                                                                 │
           ├─► commitJournal(effect_1)                                       ├─► commitJournal(effect_2)
           │   [upsert by effect_id]                                         │   [upsert by effect_id]
           │   midOpTicket_1 issued                                          │   midOpTicket_2 issued
           │                                                                 │   (ticket_1 preserved!)
           ▼                                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    AuthorityStore                                       │
│ midOpTickets: Map { "t1" => ticket_1, "t2" => ticket_2 }                                │
└──────────────────────────┬──────────────────────────────────────────────────────────────┘
                           │
       ┌───────────────────┴───────────────────┐
       ▼                                       ▼
┌─────────────────────────┐         ┌─────────────────────────┐
│ compareAndSwap(R0) [W1] │         │ compareAndSwap(R0) [W2] │
│ WIN: Advances to R1     │         │ LOSE: cas-conflict      │
│ Deletes ONLY ticket_1   │         │ Retains carry-over      │
│ (ticket_2 preserved!)   │         │ under key S1:N2         │
└─────────────────────────┘         └────────────┬────────────┘
                                                 │
                                                 ▼
                                    ┌─────────────────────────┐
                                    │ Writer 2 Re-sync & Retry│
                                    │ against revision R1     │
                                    │ Replay: 0 effect calls  │
                                    │ Deducts S1:N2 carry-over│
                                    └─────────────────────────┘
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/lifecycle-kernel/index.js` | Modify | Extraer deltas de consumo exclusivamente de `result.usage` / `result.execution_usage`; eliminar `input.consumed`; particionar `pendingCarryOver` con `${subjectId}:${nodeId}`; refinar condición zero-delta. |
| `scripts/lib/authority-store/index.js` | Modify | Implementar upsert por `effect_id` en `commitJournal` y commit atómico; borrar únicamente el ticket ganador (`entry.midOpTickets.delete(midOpTicket)`), preservando los peers. |
| `scripts/lib/lifecycle-kernel/memory-store.js` | Modify | Implementar upsert/merge por `effect_id` en `commitJournal` y `commit`. |
| `scripts/lib/filesystem-store.js` | Modify | Implementar upsert/merge por `effect_id` en `commitJournal` y `commit`. |
| `scripts/lib/lifecycle-kernel/host-boundary.js` | Modify | Integrar `resolvePrimaryFailure` para normalizar fallos de transporte en `environment_tooling`. |
| `scripts/lib/execution-budgets.js` | Modify | Formalizar contratos de evaluación de `ExecutionUsage` y detección de zero-delta. |
| `scripts/k5-e2e-budgets-recovery.test.js` | Modify | Añadir suite de no-duplicación de efectos (0 re-ejecuciones post-CAS), aislamiento de carry-over particionado y preservación de tickets. |
| `openspec/changes/k5-concurrency-hardening/design.md` | Create | Documento de diseño arquitectónico formal de la fase SDD Design. |
| `openspec/changes/k5-concurrency-hardening/decisions/adr-001.md` | Create | ADR: Ownership autoritativo de `ExecutionUsage`. |
| `openspec/changes/k5-concurrency-hardening/decisions/adr-002.md` | Create | ADR: Particionado de `pendingCarryOver` por `${subjectId}:${nodeId}`. |
| `openspec/changes/k5-concurrency-hardening/decisions/adr-003.md` | Create | ADR: Journal merge-safe y preservación de tickets peer en CAS. |
| `openspec/changes/k5-concurrency-hardening/decisions/adr-004.md` | Create | ADR: Idempotencia y no-duplicación de efectos en reintentos CAS. |
| `openspec/changes/k5-concurrency-hardening/decisions/adr-005.md` | Create | ADR: Contrato de zero-delta delimitado a mutaciones de código sin avance. |
| `openspec/changes/k5-concurrency-hardening/decisions/adr-006.md` | Create | ADR: Integración causal de `resolvePrimaryFailure` en Host Boundary. |
| `openspec/changes/k5-concurrency-hardening/state.yaml` | Modify | Actualizar estado de la fase `design` a `done` con resumen y decisiones clave. |

## Interfaces / Contracts

### 1. `ExecutionUsage` Interface

```javascript
/**
 * Estructura de consumo emitida por effectExecutor y gestionada por el runtime.
 * @typedef {Object} ExecutionUsage
 * @property {number} [turns] - Turnos de nodo consumidos
 * @property {number} [patches] - Parches aplicados
 * @property {number} [commands] - Comandos ejecutados
 * @property {number} [changed_lines] - Líneas modificadas (agregadas + eliminadas)
 * @property {number} [wall_time_minutes] - Minutos de reloj consumidos
 * @property {number} [effect_attempts] - Intentos de efecto de autoridad consumidos
 * @property {number} [authority_mutations] - Mutaciones de estado autoritativo
 * @property {number} [evidence_runs] - Ejecuciones de tests/evidencia
 * @property {number} [review_sweeps] - Pasadas de revisión
 */
```

### 2. Extracción de Consumo en `runKernelOperation`

```javascript
// Cómputo autoritativo de delta ejecutado a partir de result.usage / result.execution_usage
const rawUsage = (result && (result.usage || result.execution_usage)) || {};
const executedDelta = {
  turns: Number(rawUsage.turns ?? 1),
  patches: Number(rawUsage.patches ?? (args.patches || (args.patch ? 1 : 0) || 0)),
  commands: Number(rawUsage.commands ?? (args.commands || (args.command ? 1 : 0) || 0)),
  changed_lines: Number(rawUsage.changed_lines ?? totalChangedLines),
  wall_time_minutes: Number(rawUsage.wall_time_minutes ?? (args.wall_time_minutes || 0)),
  effect_attempts: Number(rawUsage.effect_attempts ?? 1),
  authority_mutations: Number(rawUsage.authority_mutations ?? 1),
  evidence_runs: Number(rawUsage.evidence_runs ?? (args.evidence_runs || 0)),
  review_sweeps: Number(rawUsage.review_sweeps ?? (args.review_sweeps || 0)),
};
```

### 3. Clave Compuesta de Carry-Over en `createKernelRuntime`

```javascript
function getCarryOverKey(subjectId, nodeId) {
  const s = subjectId || DEFAULT_SUBJECT_ID;
  const n = nodeId || "default";
  return `${s}:${n}`;
}
```

### 4. Merge-Safe Journal Upsert Helper

```javascript
function upsertJournalEntries(existing = [], incoming = []) {
  const map = new Map();
  for (const entry of existing) {
    if (entry && entry.effect_id) map.set(entry.effect_id, entry);
  }
  for (const entry of incoming) {
    if (entry && entry.effect_id) map.set(entry.effect_id, entry);
  }
  const merged = Array.from(map.values());
  merged.sort((a, b) => (a.effect_id || "").localeCompare(b.effect_id || ""));
  return merged;
}
```

### 5. Preservación de Tickets en `AuthorityStore.compareAndSwapLocked`

```javascript
// Eliminación exclusiva del ticket ganador, preservando tickets de escritores concurrentes
if (midOpTicket) {
  entry.midOpTickets.delete(midOpTicket);
}
// baselines se actualizan para el nuevo head; los midOpTickets restantes se conservan
```

### 6. Normalización Causal en `host-boundary.js`

```javascript
const { resolvePrimaryFailure, createCausalFailure, CAUSAL_CATEGORIES } = require("../causal-failure.js");

function normalizeHostTransportFault(faultOutcome) {
  const failure = createCausalFailure({
    category: CAUSAL_CATEGORIES.ENVIRONMENT_TOOLING,
    code: faultOutcome.code || "HOST_TRANSPORT_ERROR",
    details: faultOutcome,
  });
  return resolvePrimaryFailure([failure]);
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Extracción estricta de `ExecutionUsage` ignorando `input.consumed` | Validar en `lifecycle-kernel/index.test.js` que el runtime ignora `input.consumed` y utiliza únicamente `result.usage`. |
| Unit | Particionado de `pendingCarryOver` por `${subjectId}:${nodeId}` | Verificar que carry-over en `S1:N1` no afecta la evaluación de cuota de `S1:N2`. |
| Unit | Preservación de peer tickets en `AuthorityStore` | Test unitario con 2 tickets concurrentes verificando que el commit de T1 no elimina T2. |
| Unit | Merge-safe upsert en `commitJournal` | Test unitario en MemoryStore, FileSystemStore y AuthorityStore verificando upsert por `effect_id`. |
| Integration | Integración de `resolvePrimaryFailure` en `host-boundary.js` | Test de normalización de fallos de puertos mapeando a `environment_tooling`. |
| E2E | Idempotencia y 0 duplicaciones de efectos post-CAS conflict | Ejecutar carrera CAS real de 2 writers con comprobación estricta de contador de llamadas a `effectExecutor` (`callCount === 1`). |
| E2E | Monotonicidad de presupuestos y zero-delta | Verificar deducción dual y emisión de eventos `zero-delta-attempt` en `k5-e2e-budgets-recovery.test.js`. |

## Migration / Rollout

No data migration required. Los cambios son compatibles hacia atrás con el almacenamiento existente y fortalecen las garantías de aislamiento en tiempo de ejecución.

## Open Questions

- None
