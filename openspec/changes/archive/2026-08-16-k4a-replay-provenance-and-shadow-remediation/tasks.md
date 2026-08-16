# Tasks: K4a Replay Provenance, Obligation Authority, Shadow Classification, and Graph Schema Hardening

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

## Implementation Tasks

- [x] 1. Endurecer esquemas canónicos de ExecutionGraph y GraphNode
  - [x] 1.1 Actualizar `schemas/kernel/execution-graph/v1.schema.json` añadiendo `"minLength": 1` a strings requeridos y elementos de arreglos (`node_id`, `kind`, `operation`, `objective`, `budget_ref`, `ownership.owner`, `obligation.id`, `deferred.reason`, `deferred.approved_by`).
  - [x] 1.2 Mantener compatibilidad congelada de K1 y asegurar que el esquema canónico consumido (`execution-graph/v1.schema.json`) sea el authoritative node contract.
- [x] 2. Endurecer compilador de ExecutionGraph (`compiler.js`)
  - [x] 2.1 En `compileExecutionGraph()`, validar que `node_id`, `kind`, `operation`, `objective` y `budget_ref` sean cadenas no vacías (`minLength >= 1`).
  - [x] 2.2 En `compileExecutionGraph()`, verificar que todas las obligaciones externas reconcilien al 100% con `contract.obligations`, arrojando `unknown-obligation-id` si se detecta un ID no contractual.
- [x] 3. Endurecer motor de Replay (`replay-engine.js`)
  - [x] 3.1 Eliminar el `catch -> new Map()` en la compilación de WorkOrders, asegurando compilación *fail-closed*.
  - [x] 3.2 En modo canónico, exigir obligatoriamente `recorded.graph_id === graph.graph_id` y `recorded.work_order_id === expectedWo.work_order_id`, arrojando `stale-fixture-rejected` ante cualquier omisión o discrepancia.
  - [x] 3.3 Exponer `replayLegacyFixtureGraph()` y soportar `options.allowLegacyFixtures: true` para compatibilidad explícita no-default.
- [x] 4. Corregir semántica de Shadow Comparator (`shadow-comparator.js`)
  - [x] 4.1 En `compareShadowExecution()`, calcular `match = hasNoDivergences && fullyComparable` (donde `fullyComparable = skipped_dimensions.length === 0 && evaluated_dimensions.length > 0`).
  - [x] 4.2 Cuando `skipped_dimensions.length > 0` y `divergences.length === 0`, retornar `match: false`, `discrepancy_classification: "partial-match"` y `telemetryDiff` no nulo.
- [x] 5. Actualizar generadores de fixtures de prueba y suites de tests
  - [x] 5.1 Actualizar `scripts/lib/test-support/execution-graph-fixtures.js` para que `createSampleFixtureResults(graph)` genere fixtures con `graph_id` y `work_order_id` válidos y obligaciones contractuales por defecto.
  - [x] 5.2 Actualizar y añadir tests unitarios en `replay-engine.test.js`, `compiler.test.js`, `shadow-comparator.test.js` y `k3-k4a-integration.test.js` para los 4 vectores adversariales.
- [x] 6. Verificación integral y generación de reportes
  - [x] 6.1 Ejecutar suite completa de pruebas `npm test` verificando 100% verde en todos los componentes y targets generados.
  - [x] 6.2 Generar `verify-report.md` con la versión real `2.45.4`, commit SHA, resumen de pruebas y digest.
