# Proposal: K4a Replay Provenance, Obligation Authority, Shadow Classification, and Graph Schema Hardening

## Intent

Cerrar los 4 puntos pendientes identificados en la auditoría de `v2.45.3` para completar K4a y desbloquear la transición hacia K5:
1. **BLOCKER 1 (Replay Fixture Provenance Obligatorio)**: Exigir `graph_id` y `work_order_id` en los fixtures de `replayExecutionGraph()` canónico, eliminando el fail-open en la compilación de WorkOrders (`catch -> Map()`) y garantizando que ningún fixture obsoleto o pre-clarificación pueda resucitar nodos invalidados. Proveer `replayLegacyFixtureGraph()` o `allowLegacyFixtures: true` como vía explícita no-default.
2. **CRITICAL 2 (Autoridad Absoluta de Obligaciones Contractuales)**: Rechazar *fail-closed* con código `unknown-obligation-id` cualquier obligación externa cuyo `id` no figure en `contract.obligations`, garantizando que las entradas externas no puedan ampliar la autoridad contractual.
3. **CRITICAL 3 (Consistencia Semántica en Shadow Execution)**: Asegurar que `match: true` represente exclusivamente un *full-match* (0 divergencias y 0 dimensiones omitidas). Cuando existan dimensiones omitidas, emitir `match: false`, clasificación `partial-match` y un `telemetryDiff` estructurado no nulo.
4. **CRITICAL 4 (Endurecimiento de Esquemas e Identificadores no Vacíos)**: Incorporar `"minLength": 1` en los esquemas canónicos de `ExecutionGraph` y `GraphNode` (`node_id`, `kind`, `operation`, `objective`, `budget_ref`, etc.) y validación atómica en `compileExecutionGraph()` para asegurar que todo grafo generado sea 100% composable y aceptado por `compileWorkOrdersV2()`.
5. **Traceability & Evidence Trail**: Actualizar `verify-report.md` reflejando de forma fidedigna la versión (`2.45.4`), commit SHA real, digest del conjunto de pruebas y conteo de tests ejecutados.

## Scope

### In Scope
- `schemas/kernel/execution-graph/v1.schema.json`
- `schemas/kernel/graph-node/v1.schema.json`
- `scripts/lib/execution-graph/replay-engine.js`
- `scripts/lib/execution-graph/compiler.js`
- `scripts/lib/execution-graph/shadow-comparator.js`
- `scripts/lib/execution-graph/index.js`
- `scripts/lib/test-support/execution-graph-fixtures.js`
- Tests unitarios y de integración:
  - `scripts/lib/execution-graph/replay-engine.test.js`
  - `scripts/lib/execution-graph/compiler.test.js`
  - `scripts/lib/execution-graph/shadow-comparator.test.js`
  - `scripts/lib/k3-k4a-integration.test.js`

### Out of Scope
- Modificación de contratos K3 (`execution-identities`).
- Nuevos tipos de nodos fuera de la familia Repair.

## Capabilities & Approach

- **Strict Fail-Closed Provenance**: Replay no asume fixtures sin identidad criptográfica; valida `recorded.graph_id === graph.graph_id` y `recorded.work_order_id === expectedWo.work_order_id`.
- **Authoritative Contract Obligations**: Validación de reconciliación al 100% de IDs contra `contract.obligations`.
- **Boolean & Classification Consistency**: `match: true` <=> `discrepancy_classification === "full-match"`. `partial-match` <=> `match: false` + `telemetryDiff != null`.
- **Compositional Invariant**: `ExecutionGraph` schema rechaza strings vacíos (`node_id: ""`), preservando la invariante `compileExecutionGraph() -> validateExecutionGraphBinding() -> compileWorkOrdersV2()`.

## Risks & Rollback Plan

- **Riesgo**: Tests existentes que suministren fixtures simplificados sin `graph_id`/`work_order_id`.
  - **Mitigación**: Actualizar el generador central de fixtures de prueba `createSampleFixtureResults` para derivar automáticamente la identidad y provenance criptográfica completa.
- **Rollback**: Restaurar el estado anterior vía git revert; los cambios son aditivos y de endurecimiento de invariantes.
