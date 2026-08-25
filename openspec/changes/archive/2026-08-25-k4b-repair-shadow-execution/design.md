# Design: k4b-repair-shadow-execution

## Technical Approach

El cambio `k4b-repair-shadow-execution` implementa la primera vertical shadow de ejecución para la ruta de Repair en el runtime de OSPEC. Su objetivo es orquestar la ejecución de extremo a extremo consumiendo el `ExecutionGraph` compilado por K4a (`compileExecutionGraph`), despachando `WorkOrder` v2 en orden topológico exclusivamente mediante las primitivas de aislamiento de K6a (`executeWorkOrder`, `createWorkspace`, `materializeSourceSnapshot`, `disposeWorkspace`), recibiendo `WorkResult` con vinculación criptográfica, integrando los parches de forma determinista sobre la base autorizada de `SourceSnapshot`, congelando el `Candidate` v2 mediante K3 (`freezeCandidate`), registrando transiciones y telemetría de nodos, y comparando el resultado frente a la baseline fija de control (`fixed`) sin alterar el estado ni mutar defaults de producción.

La arquitectura se estructura en un paquete modular bajo `scripts/lib/repair-shadow/` con cuatro componentes principales:
1. **`orchestrator.js` (`orchestrateRepairShadow`)**: Valida bindings de entrada contra `SourceSnapshot`, compila WorkOrders v2 en orden topológico, gestiona el ciclo de vida efímero de workspaces por nodo, ejecuta comandos bajo aislamiento verificado (`isolationReported === "enforced"`), gestiona fallos en cascada fail-closed, y verifica la cadena criptográfica completa de 4 identidades.
2. **`patch-integrator.js` (`integrateWorkResultPatches`)**: Aplica parches y unified diffs sobre el árbol de archivos en memoria validando contención en `allowed_paths`, calcula el digest Merkle del árbol candidato y el fingerprint canónico del diff, y congela un `Candidate` v2 mediante K3 `freezeCandidate`.
3. **`shadow-comparator.js` (`compareShadowExecution`)**: Observador pasivo que realiza una comparación multidimensional (steps, diffs, obligaciones, invariantes, inventario, telemetría) entre el resultado shadow y la baseline de control sin modificar el entorno de producción.
4. **`index.js`**: Punto de entrada unificado que expone la API pública del dominio Repair shadow.

```
                  ┌─────────────────────────────────────────────────────────┐
                  │                 K4a Compiler / Graph                    │
                  │  (compileExecutionGraph / validateExecutionGraphBinding)│
                  └───────────────────────────┬─────────────────────────────┘
                                              │ ExecutionGraph (DAG)
                                              ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                           K4b Repair Shadow Orchestrator                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. Binding & Topo Sort: validateExecutionGraphBinding, compileWorkOrdersV2, DAG    │  │
│  └──────────────────────────────────────────┬──────────────────────────────────────────┘  │
│                                             │ For each node (topological order)           │
│                                             ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 2. K6a Ephemeral Lifecycle Dispatch (per node):                                     │  │
│  │    • createWorkspace(source_snapshot_id)                                            │  │
│  │    • materializeSourceSnapshot(ws, workOrder, sourceSnapshot)                       │  │
│  │    • executeWorkOrder(workOrder, ws, { isolationCapability: "enforced" })            │  │
│  │    • captureWorkResult(...) & disposeWorkspace(ws)                                  │  │
│  └──────────────────────────────────────────┬──────────────────────────────────────────┘  │
│                                             │ WorkResults (raw evidence)                  │
│                                             ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 3. Patch Integration & K3 Candidate Freeze:                                         │  │
│  │    • integrateWorkResultPatches(sourceSnapshot, workResults)                        │  │
│  │    • freezeCandidate(base_tree, candidate_tree, diffText) -> CandidateId (K3)       │  │
│  └──────────────────────────────────────────┬──────────────────────────────────────────┘  │
│                                             │ Candidate v2 + Telemetry                    │
│                                             ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 4. 4-Identity Lineage Check & Shadow Comparison:                                    │  │
│  │    • SourceSnapshotId -> WorkOrderId -> WorkResultId -> CandidateId                 │  │
│  │    • compareShadowExecution(shadowResult, baselineResult) [Read-Only Observer]      │  │
│  └─────────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture Decisions

### Decision: Despacho topológico y ciclo de vida de workspace efímero por nodo vía K6a (ADR-001)

| Opción | Tradeoff | Decisión |
|---|---|---|
| **A. Workspace efímero por nodo vía K6a** | Mayor sobrecarga de I/O en materialización/limpieza; aislamiento criptográfico perfecto entre órdenes y garantía fail-closed. | **Elegida**: Cada nodo se ejecuta en un workspace aislado creado y destruido exclusivamente vía K6a (`createWorkspace`, `materializeSourceSnapshot`, `disposeWorkspace`). |
| **B. Workspace compartido reutilizado** | Menor I/O; riesgo de fuga de estado, contaminación cruzada entre nodos y violación de reproducibilidad. | Rechazada. |
| **C. Ejecución directa en workspace de producción** | Incompatible con la ejecución shadow; mutaría el espacio de trabajo activo antes de la aprobación K9. | Rechazada. |

**Rationale**: La ejecución shadow debe ser completamente estanca e inmutable respecto a producción. El ciclo de vida efímero gestionado por K6a asegura que cada `WorkOrder` v2 recibe exclusivamente su cápsula de entrada declarada y no retiene artefactos residuales no autorizados.

### Decision: Separación estricta $WorkResult \neq Candidate$ con integración determinista previa a `freezeCandidate` (ADR-002)

| Opción | Tradeoff | Decisión |
|---|---|---|
| **A. Integración determinista y freeze exclusivo vía K3** | Requiere validar y aplicar parches en memoria antes de invocar `freezeCandidate`; mantiene la frontera formal donde K6a solo emite evidencia cruda y K3 emite `CandidateId`. | **Elegida**: `WorkResult` es evidencia cruda del worker. `patch-integrator.js` valida `allowed_paths`, aplica diffs sobre `SourceSnapshot` y llama a `freezeCandidate()` de K3. |
| **B. K6a emite CandidateId directamente** | Acopla K6a con la semántica de Candidate v2; viola la frontera de responsabilidades de K6a como executor genérico. | Rechazada. |
| **C. Fusionar WorkResult y Candidate en un solo artefacto** | Destruye la trazabilidad de auditoría entre la ejecución del worker y la base autorizada consolidada. | Rechazada. |

**Rationale**: `WorkResult` representa el resultado crudo de una orden de trabajo individual. El `Candidate` es el estado consolidado proyectado sobre la base autorizada del `SourceSnapshot`. Mantener esta distinción y delegar la emisión de `CandidateId` exclusivamente a `freezeCandidate` garantiza la integridad criptográfica de la cadena de identidades.

### Decision: Comparador shadow estrictamente pasivo / read-only con telemetría no bloqueante (ADR-003)

| Opción | Tradeoff | Decisión |
|---|---|---|
| **A. Comparador pasivo sin mutación de producción** | Evalúa discrepancias multidimensionales (steps, parches, obligaciones, invariantes, inventario) y emite telemetría sin interferir en la ruta activa de producción ni promover candidatos automáticamente. | **Elegida**: `shadow-comparator.js` opera como observador pasivo. No altera git HEAD, journals ni defaults; respeta el gate de promoción K9. |
| **B. Auto-promoción de candidatos coincidentes** | Acelera adopción pero omite el gate formal K9 y de autorización K10. | Rechazada. |
| **C. Bloqueo de producción ante discrepancias shadow** | Provocaría fallos en rutas activas estables por discrepancias en una vertical experimental shadow. | Rechazada. |

**Rationale**: El objetivo de la fase shadow es la validación y observabilidad del nuevo runtime frente a la baseline fija sin riesgo operativo para los flujos existentes.

### Decision: Frontera unidireccional K4b → K6a (ADR-004)

| Opción | Tradeoff | Decisión |
|---|---|---|
| **A. Dependencia unidireccional estricta K4b → K6a** | K4b importa y consume K6a; K6a desconoce totalmente a K4b, al grafo de Repair y a `freezeCandidate`. Verificado por tests estáticos. | **Elegida**: K6a se mantiene como infraestructura genérica agnóstica de dominio. K4b actúa como consumidor de nivel superior. |
| **B. K6a conoce la semántica de Repair/Shadow** | Acopla la capa de ejecución con la lógica de negocio de orquestación. | Rechazada. |

**Rationale**: Mantiene el desacoplamiento modular del kernel OSPEC y previene ciclos de dependencias o fugas conceptuales entre orquestadores y ejecutores.

---

## Data Flow

### Diagrama de Secuencia

```
┌───────┐         ┌─────────────────────────┐         ┌─────────────────────┐         ┌────────────────────────┐         ┌──────────────┐
│ Caller│         │ orchestrator.js (K4b)   │         │ worker-workspace/   │         │ patch-integrator.js    │         │ K3 Candidate │
│       │         │                         │         │ worker-executor(K6a)│         │                        │         │ (identities) │
└───┬───┘         └────────────┬────────────┘         └──────────┬──────────┘         └───────────┬────────────┘         └──────┬───────┘
    │                          │                                 │                                │                             │
    │ orchestrateRepairShadow  │                                 │                                │                             │
    │ (graph, options)         │                                 │                                │                             │
    ├─────────────────────────►│                                 │                                │                             │
    │                          │ 1. validateExecutionGraphBinding│                                │                             │
    │                          │ 2. compileWorkOrdersV2 (K4a)    │                                │                             │
    │                          │ 3. topologicalSort (DAG)        │                                │                             │
    │                          │                                 │                                │                             │
    │                          │ ─── LOOP: for each node in DAG ─│                                │                             │
    │                          │ createWorkspace()               │                                │                             │
    │                          ├────────────────────────────────►│                                │                             │
    │                          │◄────────────────────────────────┤ workspaceDescriptor            │                             │
    │                          │ materializeSourceSnapshot()     │                                │                             │
    │                          ├────────────────────────────────►│                                │                             │
    │                          │◄────────────────────────────────┤ capsule                        │                             │
    │                          │ executeWorkOrder()              │                                │                             │
    │                          ├────────────────────────────────►│ (isolationReported: "enforced")│                             │
    │                          │◄────────────────────────────────┤ WorkResult + telemetry         │                             │
    │                          │ disposeWorkspace()              │                                │                             │
    │                          ├────────────────────────────────►│                                │                             │
    │                          │◄────────────────────────────────┤ { ok: true }                   │                             │
    │                          │ ─── END LOOP ───────────────────│                                │                             │
    │                          │                                 │                                │                             │
    │                          │ integrateWorkResultPatches()    │                                │                             │
    │                          ├─────────────────────────────────────────────────────────────────►│                             │
    │                          │                                 │                                │ 1. Parse & validate diffs   │
    │                          │                                 │                                │ 2. Apply onto base tree     │
    │                          │                                 │                                │ 3. computeTreeDigest        │
    │                          │                                 │                                │ freezeCandidate()           │
    │                          │                                 │                                ├────────────────────────────►│
    │                          │                                 │                                │◄────────────────────────────┤ Candidate v2
    │                          │◄─────────────────────────────────────────────────────────────────┤ { candidate, combinedDiff } │
    │                          │                                 │                                │                             │
    │                          │ 4. Verify 4-Identity Chain:     │                                │                             │
    │                          │    SourceSnapshot -> WorkOrder  │                                │                             │
    │                          │    -> WorkResult -> Candidate   │                                │                             │
    │                          │                                 │                                │                             │
    │                          │ 5. compareShadowExecution()     │                                │                             │
    │                          │    (shadow vs baselineResult)   │                                │                             │
    │                          │                                 │                                │                             │
    │◄─────────────────────────┤                                 │                                │                             │
    │ { ok: true, candidate,   │                                 │                                │                             │
    │   telemetry, ... }       │                                 │                                │                             │
```

### Cadena Criptográfica de 4 Identidades

La verificación de integridad exige validar que cada eslabón de la cadena de linaje coincide exactamente con su recomputación canónica:

```
┌─────────────────────────┐
│     SourceSnapshot      │ ──► computeSourceSnapshotId(sourceSnapshot) === sourceSnapshot.source_snapshot_id
│ (source_snapshot_id)    │
└────────────┬────────────┘
             │ validateWorkOrderBinding(sourceSnapshot, workOrder)
             ▼
┌─────────────────────────┐
│       WorkOrder         │ ──► computeWorkOrderId(workOrder) === workOrder.work_order_id
│     (work_order_id)     │
└────────────┬────────────┘
             │ validateWorkResultBinding(workOrder, workResult)
             ▼
┌─────────────────────────┐
│       WorkResult        │ ──► computeWorkResultId(workResult) === workResult.work_result_id
│    (work_result_id)     │
└────────────┬────────────┘
             │ candidate.base_tree === sourceSnapshot.base_tree_digest
             ▼
┌─────────────────────────┐
│       Candidate         │ ──► computeCandidateId(candidate) === candidate.candidate_id
│     (candidate_id)      │
└─────────────────────────┘
```

### Máquina de Estados de Nodos del Grafo

Cada nodo del grafo transiciona estrictamente según el autómata:
- `pending`: Estado inicial al registrar el grafo.
- `in_flight`: Transición al iniciar el aprovisionamiento de workspace y despacho de `executeWorkOrder`.
- `completed`: Transición al finalizar exitosamente la ejecución (`exit_code === 0`, contención respetada, `WorkResult` capturado).
- `failed`: Transición si el comando falla, se viola contención o el aislamiento no es `enforced`.
- `blocked`: Transición automática para todos los nodos que dependan directa o transitivamente de un nodo en estado `failed` (calculado mediante `computeDescendantClosure`).

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/repair-shadow/orchestrator.js` | Create | Orquestador principal de Repair Shadow: validación de bindings, ordenación topológica, despacho a K6a con aislamiento enforced, manejo de fallos y validación de linaje criptográfico. |
| `scripts/lib/repair-shadow/patch-integrator.js` | Create | Integrador determinista de parches: validación de contención de diffs en `allowed_paths`, aplicación de modificaciones sobre el árbol base en memoria y llamada a `freezeCandidate` de K3. |
| `scripts/lib/repair-shadow/shadow-comparator.js` | Create | Comparador shadow pasivo / read-only: contraste multidimensional de resultados shadow vs baseline fixed sin mutación de estado de producción. |
| `scripts/lib/repair-shadow/index.js` | Create | Módulo barrel que exporta la API pública del dominio Repair shadow (`orchestrateRepairShadow`, `integrateWorkResultPatches`, `compareShadowExecution`). |
| `scripts/lib/repair-shadow/index.test.js` | Create | Suite de pruebas unitarias e integración para el orquestador, integrador de parches y comparador shadow. |
| `scripts/k4b-repair-shadow-e2e.test.js` | Create | Suite E2E completa que ejecuta el flujo vertical: compilación K4a → orquestación K4b → ejecución K6a → freeze K3 → validación de 4 identidades → comparación shadow. |
| `scripts/lib/roadmap-boundary.test.js` | Modify | Añade aserciones estáticas de frontera arquitectónica unidireccional K4b → K6a (garantiza que K6a no referencia a K4b). |
| `openspec/changes/k4b-repair-shadow-execution/decisions/adr-001.md` | Create | ADR: Despacho topológico y ciclo de vida de workspace efímero por nodo vía K6a. |
| `openspec/changes/k4b-repair-shadow-execution/decisions/adr-002.md` | Create | ADR: Separación estricta WorkResult != Candidate con integración determinista previa a freezeCandidate. |
| `openspec/changes/k4b-repair-shadow-execution/decisions/adr-003.md` | Create | ADR: Comparador shadow estrictamente pasivo con telemetría no bloqueante. |
| `openspec/changes/k4b-repair-shadow-execution/decisions/adr-004.md` | Create | ADR: Frontera arquitectónica unidireccional K4b -> K6a. |

---

## Interfaces / Contracts

### 1. Orquestador Repair Shadow (`scripts/lib/repair-shadow/orchestrator.js`)

```javascript
/**
 * @typedef {Object} RepairShadowOptions
 * @property {Object} sourceSnapshot - Objeto canónico SourceSnapshot v1
 * @property {string} [sourceSnapshotId] - Digest SHA-256 opcional
 * @property {Object} workerTransport - Instancia activa de WorkerTransport
 * @property {string} [isolationCapability="enforced"] - Estado de aislamiento declarado
 * @property {Object} [capabilityProof] - Prueba criptográfica de capacidad de transporte
 * @property {Object} [workerIsolation] - Bundle de aislamiento verificado con pruebas de contención
 * @property {Record<string, string|Buffer>|Map<string, string|Buffer>|Array<{path: string, content?: string|Buffer}>} [files] - Archivos base
 * @property {string} [repositoryDir] - Directorio base opcional del repositorio
 * @property {string} [baseDir] - Directorio raíz para alojar workspaces temporales
 * @property {Function} [fixedBaselineFn] - Función de baseline fija para comparación shadow
 * @property {Object} [baselineResult] - Resultado precomputado de baseline para comparación shadow
 */

/**
 * @typedef {Object} NodeTelemetryRecord
 * @property {string} node_id - Identificador del nodo
 * @property {string} status - "pending" | "in_flight" | "completed" | "failed" | "blocked"
 * @property {string} [started_at] - Timestamp ISO
 * @property {string} [finished_at] - Timestamp ISO
 * @property {number} [duration_ms] - Duración en ms
 * @property {Array<{command: string, exit_code: number, duration_ms: number}>} [commands] - Telemetría de comandos
 * @property {string[]} [logs] - Logs stdout/stderr capturados
 * @property {string} [work_order_id] - WorkOrderId vinculado
 * @property {string} [work_result_id] - WorkResultId capturado
 * @property {string} [error] - Mensaje de error si falló
 */

/**
 * @typedef {Object} RepairShadowResult
 * @property {boolean} ok - true si todos los nodos y validaciones tuvieron éxito
 * @property {Object} [candidate] - Candidate v2 congelado por K3
 * @property {Array<Object>} workResults - Lista de WorkResults capturados
 * @property {Record<string, NodeTelemetryRecord>} graph_telemetry - Telemetría de nodos
 * @property {{ ok: boolean, lineage: string[], error?: string }} lineage_verification - Validación de 4 identidades
 * @property {Object} [shadow_comparison] - Resultado de la comparación shadow vs baseline
 * @property {string} [error] - Mensaje de error en caso de fallo
 * @property {string} [reason_code] - Código de fallo en caso de error
 */

/**
 * Orquesta la ejecución shadow del grafo de Repair.
 * @param {Object} executionGraph - ExecutionGraph compilado por K4a
 * @param {RepairShadowOptions} options - Opciones de orquestación y transporte
 * @returns {Promise<RepairShadowResult>}
 */
async function orchestrateRepairShadow(executionGraph, options = {}) { ... }
```

### 2. Integrador de Parches y Freeze K3 (`scripts/lib/repair-shadow/patch-integrator.js`)

```javascript
/**
 * @typedef {Object} PatchIntegrationOptions
 * @property {Record<string, string|Buffer>|Map<string, string|Buffer>|Array<{path: string, content?: string|Buffer}>} files - Archivos base del SourceSnapshot
 * @property {string[]} [allowed_paths] - Rutas permitidas globales
 * @property {string} [repository_id] - Identificador del repositorio
 * @property {Object} [predecessorCandidate] - Candidato predecesor opcional
 */

/**
 * @typedef {Object} PatchIntegrationResult
 * @property {boolean} ok - true si los parches se aplicaron y el candidato se congeló
 * @property {Object} [candidate] - Candidate v2 congelado mediante freezeCandidate
 * @property {Map<string, string|Buffer>} candidateFiles - Árbol de archivos resultante
 * @property {string} combinedDiffText - Diff unificado canónico acumulado
 * @property {string[]} modifiedPaths - Lista de rutas creadas, modificadas o eliminadas
 * @property {string} [error] - Error si falló la aplicación o contención
 * @property {string} [reason_code] - Código de error
 */

/**
 * Aplica los diffs unificados de los WorkResults sobre la base autorizada y congela el Candidate vía K3.
 * @param {Object} sourceSnapshot - SourceSnapshot v1 autorizado
 * @param {Array<Object>} workResults - Lista de WorkResults producidos por los workers
 * @param {PatchIntegrationOptions} options - Opciones de integración y archivos
 * @returns {Promise<PatchIntegrationResult>}
 */
async function integrateWorkResultPatches(sourceSnapshot, workResults, options = {}) { ... }
```

### 3. Comparador Shadow Pasivo (`scripts/lib/repair-shadow/shadow-comparator.js`)

```javascript
/**
 * @typedef {Object} ShadowComparisonResult
 * @property {boolean} match - true si todas las dimensiones evaluadas coinciden exactamente
 * @property {"full-match"|"partial-match"|"diverged"} discrepancy_classification - Clasificación
 * @property {string[]} evaluated_dimensions - Dimensiones evaluadas
 * @property {string[]} skipped_dimensions - Dimensiones omitidas
 * @property {Record<string, number>} dimension_match_rates - Ratios de coincidencia por dimensión
 * @property {Object|null} telemetryDiff - Detalle de discrepancias detectadas (null si match)
 * @property {Object} shadowSummary - Resumen de la ejecución shadow
 * @property {Object} baselineSummary - Resumen de la baseline de control
 */

/**
 * Compara pasivamente el resultado shadow contra la baseline de referencia sin mutar producción.
 * @param {Object} shadowResult - Resultado de la ejecución shadow (candidate, telemetry, etc.)
 * @param {Object} baselineResult - Resultado de la baseline de control
 * @returns {ShadowComparisonResult}
 */
function compareShadowExecution(shadowResult, baselineResult) { ... }
```

---

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| **Unit** (`scripts/lib/repair-shadow/index.test.js`) | Validación de binding y ciclo DAG en `orchestrateRepairShadow` | Casos de test con grafos cíclicos o IDs de binding inconsistentes verificando que fallan de inmediato sin despachar workers. |
| **Unit** (`scripts/lib/repair-shadow/index.test.js`) | Cascada de fallos de nodos y marcado `blocked` | Simulación de fallo en nodo intermedio; verificar que dependientes pasan a `blocked` y workspaces se liberan (`disposeWorkspace`). |
| **Unit** (`scripts/lib/repair-shadow/index.test.js`) | Puerta de aislamiento `enforced` | Invocación con aislamiento `partial` o `unavailable`; verificar rechazo fail-closed inmediato. |
| **Unit** (`scripts/lib/repair-shadow/index.test.js`) | Integración de parches y contención de rutas en `integrateWorkResultPatches` | Parches que modifican fuera de `allowed_paths` fallan con violación de contención; parches válidos integran y emiten `CandidateId` determinista vía K3. |
| **Unit** (`scripts/lib/repair-shadow/index.test.js`) | Verificación de la cadena criptográfica de 4 identidades | Alteración intencionada de `work_result_id`, `work_order_id` o `candidate.base_tree` para verificar que `validate4IdentityLineage` detecta la manipulación. |
| **Unit** (`scripts/lib/repair-shadow/index.test.js`) | Comparación pasiva y telemetría en `compareShadowExecution` | Verificación de que discrepancias en parches, obligaciones e invariantes se clasifican adecuadamente sin lanzar errores ni mutar estado. |
| **Integration / E2E** (`scripts/k4b-repair-shadow-e2e.test.js`) | Pipeline vertical completo K4a → K4b → K6a → K3 → Shadow Compare | Ejecución end-to-end con compilación real del grafo de Repair, workspaces en disco, ejecución de comandos bajo transporte simulado `enforced`, integración sobre snapshot, freeze de candidato y comparación shadow. |
| **Architectural Boundary** (`scripts/lib/roadmap-boundary.test.js`) | Frontera unidireccional K4b → K6a | Análisis estático de código fuente (`worker-executor.js`, `worker-workspace.js`, `worker-sandbox.js`) asegurando cero referencias o imports a `repair-shadow`, `orchestrateRepairShadow` o `freezeCandidate`. |

---

## Migration / Rollout

No se requiere migración de datos ni cambios en la configuración activa de producción. La vertical de ejecución shadow opera como un subsistema aislado de observabilidad y validación:
- No altera repositorios git, ramas ni journals de producción activos.
- No muta defaults de configuración del sistema.
- La promoción de candidatos queda estrictamente reservada a fases posteriores (K9 promotion gate y K10 delivery authorization).

---

## Open Questions

Ninguna. Todas las decisiones arquitectónicas y contratos requeridos han sido formalmente definidos a través de la especificación normativa `openspec/changes/k4b-repair-shadow-execution/specs/repair-shadow-orchestration/spec.md`.
