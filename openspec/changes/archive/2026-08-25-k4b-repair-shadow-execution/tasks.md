# Tasks: k4b-repair-shadow-execution

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-repair-shadow-001: Full acyclic graph executes in topological order through K6a lifecycle primitives | MUST | `scripts/lib/repair-shadow/orchestrator.js` (`orchestrateRepairShadow`), `topologicalSort` | covered-by-design | Despacho secuencial ordenado por DAG con createWorkspace/materialize/execute/dispose por nodo |
| REQ-repair-shadow-001: Invalid graph binding halts orchestration before workspace allocation | MUST | `scripts/lib/repair-shadow/orchestrator.js` (`validateExecutionGraphBinding`) | covered-by-design | Falla cerrado de inmediato sin crear workspaces ni despachar comandos |
| REQ-repair-shadow-001: Node failure halts downstream dependent execution and cleans up workspaces | MUST | `scripts/lib/repair-shadow/orchestrator.js` (`computeDescendantClosure`, cleanup `finally`) | covered-by-design | Marca dependientes como blocked y asegura disposeWorkspace fail-closed |
| REQ-repair-shadow-002: Orchestration succeeds with verified enforced transport isolation | MUST | `scripts/lib/repair-shadow/orchestrator.js` (`resolveCapabilityState`, `workerIsolation`) | covered-by-design | Exige `isolationReported === "enforced"` para aceptar WorkResults |
| REQ-repair-shadow-002: Non-enforced isolation capability fails closed immediately | MUST | `scripts/lib/repair-shadow/orchestrator.js` (puerta de aislamiento estricta) | covered-by-design | Rechaza fallback no confinado si el aislamiento es partial o unavailable |
| REQ-repair-shadow-003: Raw WorkResult diffs integrate over SourceSnapshot and freeze via K3 | MUST | `scripts/lib/repair-shadow/patch-integrator.js` (`integrateWorkResultPatches`, `freezeCandidate`) | covered-by-design | Aplica parches en memoria, calcula Merkle digest y emite Candidate v2 con K3 |
| REQ-repair-shadow-003: Patch applying outside allowed paths fails closed before freeze | MUST | `scripts/lib/repair-shadow/patch-integrator.js` (`validateAllowedPaths`) | covered-by-design | Valida contención estricta de rutas antes de proyectar cambios y freeze |
| REQ-repair-shadow-003: Identical source and patches produce identical CandidateId | MUST | `scripts/lib/repair-shadow/patch-integrator.js` (K3 `computeCandidateId`) | covered-by-design | Determinismo estricto de CandidateId verificado |
| REQ-repair-shadow-004: Complete four identity chain validates with zero tampering | MUST | `scripts/lib/repair-shadow/orchestrator.js` (verificación de linaje de 4 identidades) | covered-by-design | Valida `SourceSnapshotId -> WorkOrderId -> WorkResultId -> CandidateId` |
| REQ-repair-shadow-004: Tampered WorkResultId fails lineage verification fail-closed | MUST | `scripts/lib/repair-shadow/orchestrator.js` (`validateWorkResultBinding`, recompute) | covered-by-design | Detecta alteración post-ejecución con error `LINEAGE_VERIFICATION_FAILED` |
| REQ-repair-shadow-004: Snapshot mismatch between WorkOrder and Candidate fails lineage check | MUST | `scripts/lib/repair-shadow/orchestrator.js` (`validateWorkOrderBinding`, base_tree match) | covered-by-design | Detecta discrepancia de snapshot base entre WorkOrder y Candidate |
| REQ-repair-shadow-005: Node progresses through valid state machine transitions | MUST | `scripts/lib/repair-shadow/orchestrator.js` (autómata de estados y telemetría) | covered-by-design | Transición `pending` -> `in_flight` -> `completed` con captura de métricas |
| REQ-repair-shadow-005: Failed node transitions to failed and marks dependent nodes as blocked | MUST | `scripts/lib/repair-shadow/orchestrator.js` (`computeDescendantClosure`) | covered-by-design | Nodo fallido a `failed` y descendientes en DAG a `blocked` |
| REQ-repair-shadow-006: Shadow comparison records multi-dimensional match against fixed baseline | MUST | `scripts/lib/repair-shadow/shadow-comparator.js` (`compareShadowExecution`) | covered-by-design | Evalúa steps, diffs, obligaciones, invariantes, inventario y emite `match: true` |
| REQ-repair-shadow-006: Discrepancy detected in shadow diff emits telemetry without halting production | MUST | `scripts/lib/repair-shadow/shadow-comparator.js` (`telemetryDiff`, clasificación) | covered-by-design | Emite telemetría de discrepancias en modo observador pasivo |
| REQ-repair-shadow-006: Strict non-mutation invariant prevents production state changes | MUST | `scripts/lib/repair-shadow/shadow-comparator.js` (invariante de sólo lectura) | covered-by-design | No muta git HEAD, journals ni defaults de producción |
| REQ-repair-shadow-007: K4b consumes K6a primitives without circular imports | MUST | `scripts/lib/repair-shadow/orchestrator.js` (imports de `worker-executor.js`, `worker-workspace.js`) | covered-by-design | Dependencia directa unidireccional K4b -> K6a |
| REQ-repair-shadow-007: Static boundary guard asserts zero K4b or Repair references in K6a | MUST | `scripts/lib/roadmap-boundary.test.js` (guard estático de arquitectura) | covered-by-design | Análisis estático de K6a asegura cero referencias a Repair o K4b |

### Reconciliation Verdict

- MUST coverage: complete (7/7 REQs, 18/18 escenarios cubiertos por diseño).
- SHOULD/MAY gaps: none.
- Ambiguities to track: none.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~750–1100 líneas |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR (`size-exception`); orden lógico: setup/stubs → patch-integrator → orchestrator → shadow-comparator → index/boundary → E2E suite |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Setup y stubs de arquitectura base (`scripts/lib/repair-shadow/`) | PR 1 (single) | Estructura modular y tipado base |
| 2 | Integrador de parches y freeze de Candidate K3 (`patch-integrator.js`) | PR 1 (single) | Contención `allowed_paths`, aplicación en memoria y K3 `freezeCandidate` |
| 3 | Orquestador de pipeline shadow y despacho K6a (`orchestrator.js`) | PR 1 (single) | DAG topo sort, workspaces efímeros K6a, puerta aislamiento enforced, 4 identidades |
| 4 | Comparador shadow pasivo vs baseline fixed (`shadow-comparator.js`) | PR 1 (single) | Observador pasivo multidimensional y telemetría de discrepancias |
| 5 | Barrel API pública (`index.js`) y test de frontera K4b → K6a | PR 1 (single) | Exportación unificada y guard estático en `roadmap-boundary.test.js` |
| 6 | Suite E2E de integración vertical (`k4b-repair-shadow-e2e.test.js`) | PR 1 (single) | Flujo completo vertical K4a → K4b → K6a → K3 → Shadow Compare |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Setup y Arquitectura Base de Módulos

- [x] 1.1 Preparar estructura de directorios `scripts/lib/repair-shadow/` y mapear dependencias hacia K4a (`execution-graph`), K6a (`worker-executor`, `worker-workspace`) y K3 (`execution-identities`).
- [x] 1.2 RED: Crear tests unitarios en `scripts/lib/repair-shadow/index.test.js` verificando que los módulos del paquete existen y exportan sus funciones canónicas (`orchestrateRepairShadow`, `integrateWorkResultPatches`, `compareShadowExecution`).
- [x] 1.3 GREEN: Implementar stubs y tipos base en `scripts/lib/repair-shadow/orchestrator.js`, `scripts/lib/repair-shadow/patch-integrator.js`, `scripts/lib/repair-shadow/shadow-comparator.js` y `scripts/lib/repair-shadow/index.js`.

## Phase 2: Integrador de Parches y Freeze de Candidate K3 (`patch-integrator.js`)

- [x] 2.1 RED: Test en `scripts/lib/repair-shadow/index.test.js` para `integrateWorkResultPatches` validando que parches fuera de `allowed_paths` fallan con error de contención fail-closed sin invocar `freezeCandidate`. [REQ-repair-shadow-003]
- [x] 2.2 GREEN: Implementar en `patch-integrator.js` el parseo de unified diffs y la validación estricta de contención de rutas contra `allowed_paths`. [REQ-repair-shadow-003]
- [x] 2.3 RED: Test en `scripts/lib/repair-shadow/index.test.js` para la aplicación determinista de diff hunks sobre los archivos base en memoria (`SourceSnapshot` base tree) produciendo el árbol `candidateFiles`. [REQ-repair-shadow-003]
- [x] 2.4 GREEN: Implementar la aplicación de diffs en memoria y cómputo del digest Merkle del árbol candidato (`computeTreeDigest`) en `patch-integrator.js`. [REQ-repair-shadow-003]
- [x] 2.5 RED: Test en `scripts/lib/repair-shadow/index.test.js` para la invocación de K3 `freezeCandidate()`, generación de `diffText` canónico acumulado, `diff_hash` y verificación de `CandidateId` determinista e idéntico para inputs idénticos. [REQ-repair-shadow-003]
- [x] 2.6 GREEN: Conectar `patch-integrator.js` con `freezeCandidate` de `scripts/lib/execution-identities/index.js`, garantizando la separación estricta $WorkResult \neq Candidate$ donde solo K3 emite `CandidateId`. [REQ-repair-shadow-003]
- [x] 2.7 REFACTOR: Triangular casos de integración de parches con creación de archivos nuevos, modificaciones de líneas con y sin saltos de línea finales, y eliminación de archivos. [REQ-repair-shadow-003]

## Phase 3: Orquestador de Pipeline Shadow y Despacho K6a (`orchestrator.js`)

- [x] 3.1 RED: Test en `scripts/lib/repair-shadow/index.test.js` para validación de bindings de entrada (`validateExecutionGraphBinding`) y detección de ciclos en el DAG antes de asignar workspaces. [REQ-repair-shadow-001]
- [x] 3.2 GREEN: Implementar en `orchestrator.js` la validación del `ExecutionGraph` contra `SourceSnapshot` y la ordenación topológica determinista de nodos mediante `topologicalSort`. [REQ-repair-shadow-001]
- [x] 3.3 RED: Test en `scripts/lib/repair-shadow/index.test.js` para la compilación de `WorkOrder` v2 (`compileWorkOrdersV2`) y comprobación de la puerta de aislamiento (`isolationCapability === "enforced"`), fallando de inmediato si es `partial` o `unavailable`. [REQ-repair-shadow-002]
- [x] 3.4 GREEN: Implementar en `orchestrator.js` la verificación de aislamiento `enforced` respaldado por `WorkerTransport` y bundle de `WorkerIsolation`. [REQ-repair-shadow-002]
- [x] 3.5 RED: Test en `scripts/lib/repair-shadow/index.test.js` para el ciclo de vida efímero de workspace por nodo: `createWorkspace`, `materializeSourceSnapshot`, `executeWorkOrder`, `captureWorkResult`, y `disposeWorkspace` en bloque `finally`. [REQ-repair-shadow-001]
- [x] 3.6 GREEN: Implementar en `orchestrator.js` el bucle de ejecución topológico por nodo con aprovisionamiento efímero vía K6a, despacho de órdenes y limpieza de recursos garantizada. [REQ-repair-shadow-001]
- [x] 3.7 RED: Test en `scripts/lib/repair-shadow/index.test.js` para el autómata de estados de nodos (`pending` → `in_flight` → `completed` | `failed` | `blocked`), cálculo de clausura de dependientes bloqueados ante fallo y registro de telemetría de ejecución. [REQ-repair-shadow-005]
- [x] 3.8 GREEN: Implementar en `orchestrator.js` el seguimiento de transiciones de estados, marcado en cascada de nodos descendientes como `blocked` (`computeDescendantClosure`) y captura de telemetría detallada (`duration_ms`, comandos, logs, exit code). [REQ-repair-shadow-005]
- [x] 3.9 RED: Test en `scripts/lib/repair-shadow/index.test.js` para la verificación de la cadena criptográfica completa de 4 identidades (`SourceSnapshotId` → `WorkOrderId` → `WorkResultId` → `CandidateId`) detectando manipulaciones o discrepancias en cualquier eslabón. [REQ-repair-shadow-004]
- [x] 3.10 GREEN: Implementar en `orchestrator.js` la verificación de linaje de 4 identidades validando `validateWorkOrderBinding`, `validateWorkResultBinding`, matching de `base_tree` con `base_tree_digest` y recomputación de identificadores. [REQ-repair-shadow-004]

## Phase 4: Comparador Shadow Pasivo vs Baseline Fixed (`shadow-comparator.js`)

- [x] 4.1 RED: Test en `scripts/lib/repair-shadow/index.test.js` para `compareShadowExecution` evaluando comparación multidimensional (steps, diffs, obligaciones, invariantes, inventario) y reportando `match: true` cuando ambas ejecuciones coinciden. [REQ-repair-shadow-006]
- [x] 4.2 GREEN: Implementar en `shadow-comparator.js` la evaluación dimensional y cómputo de `dimension_match_rates`. [REQ-repair-shadow-006]
- [x] 4.3 RED: Test en `scripts/lib/repair-shadow/index.test.js` para la detección y clasificación de discrepancias (`telemetryDiff`, `discrepancy_classification: "diverged" | "partial-match"`), asegurando que no se lanzan excepciones bloqueantes en la ruta activa. [REQ-repair-shadow-006]
- [x] 4.4 GREEN: Implementar la generación de telemetría de discrepancias estructurada en `shadow-comparator.js`. [REQ-repair-shadow-006]
- [x] 4.5 RED: Test que verifique el invariante de no-mutación: el repositorio HEAD, branches, journals y estado global permanecen byte-idénticos antes y después de ejecutar la comparación shadow. [REQ-repair-shadow-006]
- [x] 4.6 GREEN: Garantizar que `shadow-comparator.js` opera como observador estrictamente de sólo lectura sin efectos secundarios sobre producción. [REQ-repair-shadow-006]

## Phase 5: Exportación de API Pública y Tests de Frontera Arquitectónica

- [x] 5.1 RED: Tests unitarios para el barrel `scripts/lib/repair-shadow/index.js` comprobando la exportación de `orchestrateRepairShadow`, `integrateWorkResultPatches` y `compareShadowExecution`. [REQ-repair-shadow-001, REQ-repair-shadow-003, REQ-repair-shadow-006]
- [x] 5.2 GREEN: Exportar la API pública unificada en `scripts/lib/repair-shadow/index.js`.
- [x] 5.3 RED: Extender `scripts/lib/roadmap-boundary.test.js` con aserciones estáticas que analizan el código de K6a (`worker-executor.js`, `worker-workspace.js`, `worker-sandbox.js`) verificando que K6a no contiene imports ni referencias a `repair-shadow`, `orchestrateRepairShadow` o `freezeCandidate`. [REQ-repair-shadow-007]
- [x] 5.4 GREEN: Verificar que las aserciones estáticas de frontera unidireccional K4b → K6a en `roadmap-boundary.test.js` pasan limpiamente. [REQ-repair-shadow-007]

## Phase 6: Suite de Integración y E2E Completa (`k4b-repair-shadow-e2e.test.js`)

- [x] 6.1 RED: Crear `scripts/k4b-repair-shadow-e2e.test.js` con caso E2E de pipeline vertical completo: Compilación K4a (`compileExecutionGraph`) → Orquestación K4b con nodos secuenciados en DAG → Ejecución K6a en workspaces aislados bajo transporte `enforced` → Integración de diffs y freeze K3 (`freezeCandidate`) → Verificación de 4 identidades → Comparación shadow vs fixed baseline. [REQ-repair-shadow-001, REQ-repair-shadow-002, REQ-repair-shadow-003, REQ-repair-shadow-004, REQ-repair-shadow-005, REQ-repair-shadow-006]
- [x] 6.2 GREEN: Implementar y verificar el paso al 100% de la suite E2E `k4b-repair-shadow-e2e.test.js` con workspaces temporales reales y fixtures de prueba completos. [REQ-repair-shadow-001, REQ-repair-shadow-002, REQ-repair-shadow-003, REQ-repair-shadow-004, REQ-repair-shadow-005, REQ-repair-shadow-006]
- [x] 6.3 RED: Caso E2E de inyección de fallos: fallo simulado en nodo intermedio durante `executeWorkOrder`, verificando que los nodos descendientes se marcan como `blocked`, todos los workspaces se liberan mediante `disposeWorkspace` y el resultado reporta fallo controlado fail-closed. [REQ-repair-shadow-001, REQ-repair-shadow-005]
- [x] 6.4 GREEN: Asegurar el manejo fail-closed robusto en la suite E2E ante fallos de nodo y violaciones de aislamiento. [REQ-repair-shadow-001, REQ-repair-shadow-005]
- [x] 6.5 Ejecutar la suite completa de pruebas (`scripts/lib/repair-shadow/index.test.js`, `scripts/k4b-repair-shadow-e2e.test.js`, `scripts/lib/roadmap-boundary.test.js`) y registrar el inventario de ejecución en `apply-progress.md`.
