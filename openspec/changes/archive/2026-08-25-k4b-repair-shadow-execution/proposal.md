# Proposal: k4b-repair-shadow-execution

## Intent

Orquestar la primera vertical shadow de ejecución para la ruta de Repair en el nuevo runtime de OSPEC:
- Consumir el Execution Graph compilado por K4a (`compileExecutionGraph`).
- Despachar las órdenes de trabajo (`WorkOrder` v2) en orden topológico exclusivamente mediante las primitivas de aislamiento de K6a (`ExecuteWorkOrder`).
- Recibir `WorkResult` y evidencia cruda con vinculación criptográfica.
- Integrar el resultado sobre la base autorizada y congelar el `Candidate` a través de K3 (`freezeCandidate`).
- Registrar las transiciones del grafo y comparar el resultado shadow frente a la baseline fija de control (`fixed`) sin alterar flujos activos ni mutar defaults.

## Scope

### In Scope
- **Orquestador Repair Shadow (`orchestrateRepairShadow`)**: Consumo de Execution Graph (K4a), secuenciación topológica y despacho de WorkOrders v2 a K6a.
- **Despacho Exclusivo vía K6a**: Ejecución de órdenes de trabajo mediante `ExecuteWorkOrder` con aislamiento verificado (`isolationReported = "enforced"`).
- **Integración y Freeze de Candidate (K3)**: Integración determinista de parches/diffs sobre la base autorizada y emisión de `CandidateId` mediante `freezeCandidate`.
- **Validación Criptográfica E2E**: Validación exhaustiva de las 4 identidades (`SourceSnapshotId`, `WorkOrderId`, `WorkResultId`, `CandidateId`) y sus bindings.
- **Registro de Transiciones de Grafo**: Trazabilidad y persistencia de estados de nodos durante la ejecución shadow.
- **Comparación Shadow vs Baseline Fixed**: Ejecución del comparador shadow frente a la baseline fija sin alterar el flujo activo de producción.
- **Frontera Arquitectónica Unidireccional**: Dependencia estricta K4b → K6a (K6a no conoce ni importa K4b).

### Out of Scope
- Modificaciones al compilador K4a o a las primitivas de K6a.
- Gate de promoción A-B o cambio de defaults (K9).
- DeliveryAuthorization (K10-delivery).
- Verificador independiente / Assurance Graph (K6b) o CandidateEvaluationAttestation (K8).

## Capabilities

### New Capabilities
- `repair-shadow-orchestration`: Orquestación del ciclo de ejecución shadow para Repair: despacho de WorkOrders compiladas (K4a) a través de K6a, recepción de WorkResults, integración sobre SourceSnapshot, congelación de CandidateId (K3), seguimiento de transiciones y comparación contra baseline de control sin mutar defaults.

### Modified Capabilities
- None

## Approach

1. **Pipeline de Orquestación (`scripts/lib/repair-shadow/index.js`)**:
   - Validar grafo y bindings de entrada (`validateExecutionGraphBinding`).
   - Compilar WorkOrders v2 (`compileWorkOrdersV2`) y ordenarlas topológicamente.
   - Para cada nodo: provisionar workspace (`createWorkspace`, `materializeSourceSnapshot`), ejecutar vía K6a (`executeWorkOrder`), capturar resultado (`captureWorkResult`) y liberar workspace (`disposeWorkspace`).
   - Aplicar mutaciones/diffs sobre la base autorizada (`SourceSnapshot`) y congelar el `Candidate` con `freezeCandidate` de K3.
2. **Comparador Shadow vs Baseline**:
   - Evaluar resultado shadow frente a la baseline fija de Repair vía `compareShadowExecution`.
   - Emitir telemetría de discrepancias sin afectar la ruta activa.
3. **Verificación y Contratos**:
   - Tests de aislamiento que garanticen desacoplamiento de K6a y distinción `WorkResult ≠ Candidate`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/repair-shadow/index.js` | New | Orquestador principal de Repair shadow e integración de parches |
| `scripts/lib/repair-shadow/index.test.js` | New | Tests unitarios y de integración para la orquestación shadow |
| `scripts/k4b-repair-shadow-e2e.test.js` | New | Suite E2E de la vertical K4b (K4a → K6a → K3 → shadow compare) |
| `scripts/lib/roadmap-boundary.test.js` | Modified | Verificación estática de frontera K4b → K6a unidireccional |
| `openspec/specs/repair-shadow-orchestration/spec.md` | New | Especificación formal y normativa de la capacidad `repair-shadow-orchestration` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Fallos de aplicación de parches en árboles complejos | Med | Validar sintaxis unified diff y verificar estado del árbol previo a `freezeCandidate` |
| Fuga de contexto entre órdenes de trabajo dependientes | Low | Workspaces aislados por nodo gestionados exclusivamente vía K6a |
| Dependencia circular K6a ↔ K4b | Low | Test de arquitectura en `roadmap-boundary.test.js` que verifique que K6a no importa K4b |

## Rollback Plan

Eliminar los módulos creados en `scripts/lib/repair-shadow/`, tests asociados y la spec `openspec/specs/repair-shadow-orchestration/spec.md` mediante `git checkout` / `git clean`.

## Dependencies

- `scripts/lib/execution-graph/index.js` (K4a)
- `scripts/lib/worker-executor.js` y `scripts/lib/worker-workspace.js` (K6a)
- `scripts/lib/execution-identities/index.js` (K3)
- `scripts/lib/host-contract/index.js` (K2a)

## Success Criteria

- [ ] La orquestación shadow ejecuta el grafo completo de Repair compilado por K4a respetando dependencias topológicas.
- [ ] Las órdenes de trabajo se ejecutan exclusivamente a través de K6a (`ExecuteWorkOrder`) bajo aislamiento `enforced`.
- [ ] La recepción de `WorkResult` valida la vinculación criptográfica contra `WorkOrderId` y `SourceSnapshotId`.
- [ ] La integración sobre la base autorizada congela un `Candidate` válido con `CandidateId` determinista vía K3.
- [ ] La comparación shadow frente a fixed se registra sin mutar defaults ni el flujo de producción.
- [ ] La suite de pruebas E2E `k4b-repair-shadow-e2e.test.js` y `npm test` pasan al 100%.
- [ ] La frontera unidireccional K4b → K6a queda formalmente verificada.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
