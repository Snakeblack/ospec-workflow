# Design: K4b Correctness Remediation

## Technical Approach

La remediación mantiene la frontera K4b → K6a y corrige el flujo existente en cinco puntos: (1) construir una invocación cerrada de `executeWorkOrder({ ... })`; (2) integrar cada `WorkResult` inmediatamente contra la base efectiva del nodo; (3) conservar por nodo un árbol integrado determinista que sirva de base material a sus dependientes; (4) congelar el Candidate final sobre el `SourceSnapshot` original; y (5) comparar las siete dimensiones y persistir un registro auditable mediante `filesystem-store`.

La base efectiva no es un nuevo `SourceSnapshot`: es un `EffectiveShadowBase` interno con archivos y digest derivados. `materializeSourceSnapshot` seguirá validando la identidad original `Workspace == WorkOrder == SourceSnapshot`, pero aceptará una opción genérica `effectiveBase` cuyo digest se verifica contra sus bytes antes de materializar. Así K6a continúa agnóstico de Repair y el `candidate.base_tree` nunca deriva hacia un snapshot sintético.

## Architecture Decisions

### Decision: Base shadow derivada sin cambiar la identidad de origen (ADR-001)

| Opción | Tradeoff | Decisión |
|---|---|---|
| Árbol derivado por nodo, workspace fresco e identidad original | Añade estado en memoria y validación de digest; conserva aislamiento, determinismo y linaje | **Elegida** |
| Workspace mutable compartido | Menos materialización; introduce aliasing y resultados dependientes del orden físico | Rechazada |
| SourceSnapshot sintético por nodo | Reutiliza la firma actual; rompe WorkOrderId y el anclaje final del Candidate | Rechazada |

**Rationale**: la aprobación `architecture-001: material-dependency-propagation` exige que N2 vea el resultado material de N1, pero REQ-repair-shadow-008 y K3 exigen que la autoridad siga siendo el `SourceSnapshot` original.

### Decision: Constructor cerrado para `executeWorkOrder` (ADR-002)

| Opción | Tradeoff | Decisión |
|---|---|---|
| Allowlist explícita y ensamblado campo a campo | Requiere mantener la lista; elimina sobrescrituras por spread | **Elegida** |
| Propagar `executorOptions` con spread | Flexible; permite reemplazar transporte, workspace, budget o pruebas | Rechazada |
| Mantener `executorFn` para tests | Facilita mocks; elude K6a y no prueba aislamiento real | Rechazada |

**Rationale**: K4b debe poseer WorkOrder, workspace, WorkerTransport y capacidades. `executorFn` se ignora y nunca se invoca; una clave no permitida dentro de opciones de ejecución falla antes del despacho.

### Decision: Integración incremental estricta y freeze único (ADR-003)

| Opción | Tradeoff | Decisión |
|---|---|---|
| Integrar por nodo y congelar una vez al final | Permite propagación material y validación local; requiere conservar árbol y modos | **Elegida** |
| Integrar todos los parches al final | Más simple; N2 no puede consumir N1 | Rechazada |
| Congelar Candidate por nodo | Expone CandidateId desde estados intermedios y confunde materialización con promoción | Rechazada |

**Rationale**: cada integración valida hunks y `WorkOrder.allowed_paths`, pero solo K3 emite el Candidate consolidado. El freeze usa el árbol final y el diff canónico acumulado, con `base_tree` del snapshot original.

### Decision: Índice de ejecuciones sobre `filesystem-store` (ADR-004)

| Opción | Tradeoff | Decisión |
|---|---|---|
| Adaptador K4b sobre `filesystem-store` | Reutiliza lock, CAS y escritura atómica; añade un índice de dominio en `state` | **Elegida** |
| Archivo JSON ad hoc | Menos código inicial; duplica persistencia y recuperación | Rechazada |
| Nuevo kernel de registros | Mayor separación; fuera de alcance y complejidad innecesaria | Rechazada |

**Rationale**: el store existente ya resuelve atomicidad y recuperación. Un adaptador Repair mantiene el dominio fuera de K6a y ofrece consulta por `candidate_id`.

## Data Flow

### Secuencia material N1 → N2

```text
Caller        K4b Orchestrator       K6a Workspace/Executor      Integrator       Store
  | graph,S0,policy,host                    |                       |              |
  |-------------------------------> validate graph + bindings      |              |
  |                                  topo sort                      |              |
  |                                  create ws-N1 ---------------->|              |
  |                                  materialize S0 -------------->|              |
  |                                  executeWorkOrder({closed}) --->|              |
  |                                  <-------------- WorkResult R1 |              |
  |                                  integrate(base=S0,R1) ---------------------->|
  |                                  <---------------- base B1,digest(B1)          |
  |                                  dispose ws-N1 ------------->|                 |
  |                                  create ws-N2 ------------->|                 |
  |                                  materialize effective B1 -->|                 |
  |                                  executeWorkOrder({closed}) ->|                 |
  |                                  <-------------- WorkResult R2                 |
  |                                  integrate(base=B1,R2) ----------------------->|
  |                                  <---------------- final tree B2 + modes       |
  |                                  dispose ws-N2 ------------->|                 |
  |                                  freezeCandidate(base_tree=S0.digest, tree=B2) |
  |                                  compare seven dimensions                     |
  |                                  persist record ------------------------------------>|
  |<------------------------------- Candidate + comparison + record id             |
```

Para nodos con varios predecesores, el orquestador parte siempre de los bytes originales y reaplica, en orden topológico estable, los diffs integrados del cierre transitivo de predecesores. Si dos predecesores producen cambios incompatibles sobre el mismo contexto, la integración falla cerrada; no se resuelve por “último escritor”. El digest se calcula con `computeTreeDigest` sobre el mapa final ordenado.

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/lib/repair-shadow/orchestrator.js` | Modify | Elimina `executorFn` y spreads; valida PolicySnapshot/store; ejecuta e integra por nodo; conserva bases derivadas y persiste el registro. |
| `scripts/lib/repair-shadow/patch-integrator.js` | Modify | Valida contexto/eliminaciones, modos y containment por WorkOrder; expone integración incremental y freeze final con modos. |
| `scripts/lib/repair-shadow/shadow-comparator.js` | Modify | Evalúa siempre steps, dependencies, diffs, inventory, obligations, invariants y execution metrics. |
| `scripts/lib/repair-shadow/execution-record-store.js` | Create | Adaptador delgado para validar, persistir y consultar `repair-shadow-execution/v1` mediante `filesystem-store`. |
| `scripts/lib/repair-shadow/index.js` | Modify | Exporta las operaciones de registro y los contratos auxiliares públicos de K4b. |
| `scripts/lib/worker-workspace.js` | Modify | Añade materialización genérica de `effectiveBase` verificada sin cambiar la identidad SourceSnapshot/WorkOrder/workspace. |
| `scripts/lib/repair-shadow/index.test.js` | Modify | Casos unitarios de allowlist, integración estricta, propagación, comparación y store. |
| `scripts/lib/worker-executor.test.js` | Modify | Pina firma objeto y autoridad de opciones usadas por K4b. |
| `scripts/k4b-repair-shadow-e2e.test.js` | Modify | Sustituye mocks por WorkerTransport + WorkerIsolation reales; N1 crea `multiply()` y N2 lo importa/ejecuta. |
| `scripts/k6a-e2e-worker-isolation.test.js` | Modify | Reutiliza/exporta fixtures de prueba real sin introducir semántica Repair en K6a. |
| `scripts/lib/roadmap-boundary.test.js` | Modify | Mantiene la guarda K4b → K6a tras la extensión genérica de materialización. |
| `openspec/specs/repair-shadow-orchestration/spec.md` | Modify at archive | Reconciliación del baseline con la firma objeto y los requisitos remediados. |
| `docs/roadmaps/harness-evolution.md`, `docs/adr/adr-20260825-00{6,7}-*.md` | Modify | Mantiene K4b incompleto hasta archive y corrige metadatos/decisiones publicadas. |

## Interfaces / Contracts

### Allowlist exacta de despacho

`options.executorOptionsByNode[nodeId]` solo puede contener estas cinco claves:

```javascript
const EXECUTE_WORK_ORDER_OPTION_ALLOWLIST = Object.freeze([
  "commands",
  "command",
  "args",
  "signal",
  "declaredTargets",
]);
```

No se admiten `budget`, `environment`, `baselineInventory`, `baselineContents`, `transports`, `workerTransport`, `transport`, `isolationCapability`, `workerIsolation`, `capabilityProof`, `capabilityId`, `workOrder`, `workspace`, `files` ni funciones. Toda clave no allowlisted produce `UNSAFE_EXECUTOR_OPTION` antes de llamar K6a. El budget y environment provienen exclusivamente del WorkOrder compilado.

El objeto final se construye sin spreads posteriores:

```javascript
executeWorkOrder({
  ...pickAllowedNodeExecutionInputs(nodeOptions),
  workOrder,
  workspace,
  transports: { worker: authorizedWorkerTransport },
  isolationCapability: "enforced",
  capabilityId: "WorkerTransport",
  capabilityProof,
  semantic_evidence,
  expectedAdapterId,
  expectedAdapterVersion,
  expectedHostRuntimeVersion,
  expectedProbeDigest,
  workerIsolation,
  strictIsolation: true,
});
```

El spread mostrado es el resultado ya filtrado y no contiene claves de autoridad. Las propiedades autoritativas se asignan después, por lo que tampoco podrían ser sustituidas ante una regresión del filtro; el objeto resultante se congela antes del despacho.

### EffectiveShadowBase

```javascript
{
  kind: "effective-shadow-base/v1",
  source_snapshot_id: sourceSnapshot.source_snapshot_id,
  predecessor_node_ids: ["n1"],
  tree_digest: "sha256:...",
  files: Map<string, string|Buffer>,
  file_modes: { "path": "100644" }
}
```

`materializeSourceSnapshot(..., { effectiveBase })` exige igualdad del `source_snapshot_id`, recomputa `tree_digest` desde `files` y registra esos bytes como baseline del workspace. No calcula ni acepta un SourceSnapshotId derivado.

### Repair shadow execution record

```javascript
{
  kind: "repair-shadow-execution/v1",
  schema_version: 1,
  candidate_id,
  source_snapshot_id,
  execution_graph,
  policy_snapshot,
  work_order_ids,
  work_result_ids,
  graph_telemetry,
  shadow_comparison,
  created_at
}
```

Antes del commit se recomputan CandidateId, GraphId y PolicySnapshotId y se exige igualdad cruzada entre el record, graph y snapshot. `persistRepairShadowExecution(store, record)` hace CAS sobre `state.repair_shadow_executions[candidate_id]`; `loadRepairShadowExecution(store, candidateId)` devuelve una copia defensiva. Conflictos con contenido divergente fallan; reintentos byte-idénticos son idempotentes.

## Requirements Allocation

- **REQ-001/008**: `orchestrator.js` + extensión genérica de `worker-workspace.js`; topo estable, workspace fresco y base derivada.
- **REQ-003**: `patch-integrator.js`; hunks, modos, paths por WorkOrder y freeze único anclado a S0.
- **REQ-006**: `shadow-comparator.js`; siete dimensiones siempre presentes en `evaluated_dimensions`, incluso vacías.
- **REQ-009**: `execution-record-store.js`; validación de bindings, CAS, consulta y ausencia de promoción.
- Los escenarios de fallo de nodo, aislamiento, linaje y no mutación permanecen asignados al orquestador y sus suites existentes.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Allowlist y autoridad | Tabla de cada clave prohibida; espías demuestran `executorFn` no invocado y firma objeto exacta. |
| Unit | Parser/integrador | Contexto o eliminación incorrectos, modos inválidos, path fuera del WorkOrder y conflictos multi-predecesor fallan antes de freeze. |
| Unit | Base derivada | Mismos bytes/predecesores producen mismo digest; distinto workspace por nodo; Candidate conserva S0. |
| Unit | Comparador | Las siete dimensiones se evalúan aun con arrays vacíos; divergencias generan telemetría sin mutación. |
| Integration | Store | Persist/load tras nueva instancia, CAS divergente, bindings incompletos y reintento idempotente. |
| E2E | Propagación real | Adapter, WorkerTransport y WorkerIsolation reales de K6a; N1 escribe/exporta `multiply()`, N2 lo requiere y verifica `multiply(2,3) === 6`. |
| Regression | Suite completa | `node --test` focal por archivos y luego `npm test`; guarda estática de frontera K4b → K6a. |

## Migration / Rollout

No hay migración de datos. Los registros anteriores no se reinterpretan ni migran. La remediación se entrega atómicamente bajo la excepción de tamaño aprobada; K4b permanece no terminado y K6b bloqueado hasta que verify y archive completen. Rollback: revertir código, specs y documentación y descartar únicamente registros no archivados de esta versión; nunca promover candidatos parciales.

## Open Questions

None. La asunción `sdd-spec-001` queda resuelta por la allowlist exacta de cinco claves.
