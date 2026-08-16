# Technical Design: K4a Replay Provenance, Obligation Authority, Shadow Classification, and Graph Schema Hardening

## Architecture Overview

Este diseño aborda de forma integral y definitiva los cuatro puntos críticos y de bloqueo identificados en `v2.45.3`, asegurando una frontera fail-closed impenetrable para K4a:

```
Contract (Authoritative IDs) ──→ compileExecutionGraph() ──→ validateExecutionGraphBinding()
                                      │ (Fail-closed on external IDs)
                                      ▼
                             ExecutionGraph (Strict minLength Schemas)
                                      │
                   ┌──────────────────┴──────────────────┐
                   ▼                                     ▼
       compileWorkOrdersV2()                  compareShadowExecution()
                   │                                     │
                   ▼                                     ▼
        WorkOrder v2 Identidades              match: false on partial
                   │                          telemetryDiff != null
                   ▼
        replayExecutionGraph()
   (Strict graph_id + work_order_id)
                   │
                   ▼
     stale-fixture-rejected on
    missing/mismatched provenance
```

## Architectural Decisions

### ADR-001: Strict Cryptographic Provenance Enforcement in Canonical Replay
- **Context**: Replay verificaba `recorded.graph_id` y `recorded.work_order_id` solo de forma optativa cuando el fixture los declaraba. Fixtures sin estos campos podían ser utilizados para resucitar nodos modificados por Clarify. Además, `compileWorkOrdersV2` se ejecutaba dentro de un `catch` que silenciaba fallos devolviendo un `Map()` vacío.
- **Decision**:
  1. En `replayExecutionGraph()`, la compilación de WorkOrders se realiza de forma obligatoria y *fail-closed*. Si no es posible compilar los WorkOrders del grafo, se arroja el error correspondiente sin fallback silencioso.
  2. En modo canónico (default), para todo fixture presente se exige:
     - `recorded.graph_id` presente y coincidente con `graph.graph_id`.
     - `recorded.work_order_id` presente y coincidente con `expectedWo.work_order_id`.
     - La omisión o discrepancia arroja error con `code: "stale-fixture-rejected"`.
  3. Para casos de prueba o consumidores legados que requieran compatibilidad sin provenance estricta, se expone `replayLegacyFixtureGraph()` y la opción explícita `allowLegacyFixtures: true`.

### ADR-002: Absolute Contract Authority on Obligation IDs
- **Context**: `compileExecutionGraph()` permitía a través del parámetro `obligations` que un llamador inyectara nuevas obligaciones cuyos identificadores no existían en `contract.obligations`.
- **Decision**:
  1. `contract.obligations` es la única autoridad admitida para los identificadores de obligaciones.
  2. Si el llamador proporciona un arreglo `obligations`, cada elemento debe reconciliar al 100% contra un `id` existente en `contract.obligations`.
  3. Si se detecta un `id` no reconocido, se arroja inmediatamente un error con código `unknown-obligation-id` y propiedad `obligation_id`.

### ADR-003: Boolean `match` Semantic Consistency in Shadow Execution
- **Context**: `compareShadowExecution()` calculaba `match = divergences.length === 0`. Si una línea base omitía dimensiones (ej. `ownership` o `invariants`), la comparación se clasificaba como `partial-match`, pero mantenía `match: true` y `telemetryDiff: null`.
- **Decision**:
  1. `match` es `true` si y solo si no hay divergencias Y no hay dimensiones omitidas (`divergences.length === 0 && skipped_dimensions.length === 0 && evaluated_dimensions.length > 0`).
  2. Si no hay divergencias pero hay dimensiones omitidas (`skipped_dimensions.length > 0`), el resultado es `match: false`, `discrepancy_classification: "partial-match"` y `telemetryDiff` estructurado no nulo que describe detalladamente las dimensiones no evaluadas.

### ADR-004: ExecutionGraph and GraphNode Schema Hardening with `minLength: 1`
- **Context**: `node_id: ""` y otros campos de texto no tenían restricción de longitud mínima en los esquemas `execution-graph/v1` y `graph-node/v1`, permitiendo que grafos con identificadores vacíos superaran la validación de esquema inicial pero fallaran posteriormente en `compileWorkOrdersV2()`.
- **Decision**:
  1. Se actualizan `schemas/kernel/execution-graph/v1.schema.json` y `schemas/kernel/graph-node/v1.schema.json` añadiendo `"minLength": 1` en todos los campos string obligatorios y en los elementos de arreglos (`node_id`, `kind`, `operation`, `objective`, `budget_ref`, `ownership.owner`, `obligation.id`, etc.).
  2. `compileExecutionGraph()` valida explícitamente en tiempo de compilación que `node_id`, `kind`, `operation`, `objective` y `budget_ref` no sean cadenas vacías, garantizando la propiedad de composabilidad total del pipeline.
