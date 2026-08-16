# Proposal: K4a Execution Graph Integrity and Cryptographic Bindings Remediation

## Intent

Remediar 4 BLOCKERs, 3 CRITICALs y 1 WARNING en las fronteras de confianza del grafo de ejecución K4a en v2.45.1: resolver la incompatibilidad de esquema en eventos Clarify, prevenir la manipulación de grafos e IDs mediante validación criptográfica de enlaces (`validateExecutionGraphBinding` y `validatePolicySnapshotBinding`), consolidar la autoridad de obligaciones del contrato e incluirlas en el preimage de `GraphId`, corregir fallbacks silenciosos en `sourceSnapshotId`, exigir validación de esquemas en compilación, validar evidencia requerida a nivel de nodo en replay y unificar la detección de ciclos.

## Scope

### In Scope
- **Schema clarification support**: Añadir `clarification_context` opcional en `$defs/node` de `execution-graph/v1.schema.json`.
- **ExecutionGraph binding validation**: Implementar `validateExecutionGraphBinding(graph)` y aplicarlo en compilador, clarify, replay, shadow comparator y work orders.
- **Authoritative obligations & GraphId preimage**: Proteger `contract.obligations` contra downgrades a `may/should` e incluir obligaciones en `computeGraphId()`.
- **PolicySnapshot cryptographic verification**: Implementar `validatePolicySnapshotBinding(snapshot)` y verificar `snapshot.snapshot_id === computePolicySnapshotDigest(snapshot)`.
- **Strict sourceSnapshotId validation**: Rechazar strings vacíos o malformados sin fallback silencioso.
- **Node-level evidence verification**: Exigir `node.required_evidence ⊆ recorded.evidence` en `replayExecutionGraph`.
- **Compiler output validation**: Ejecutar `validateExecutionGraphBinding` antes de retornar el grafo compilado.
- **DAG cycle detection unification**: Unificar `hasCycle` en un módulo compartido y robustecer `shadow-comparator`.

### Out of Scope
- Modificaciones al esquema base de `work-order/v2` o `source-snapshot/v1`.
- Cambios en el motor de ejecución en vivo o transporte de agentes fuera de K4a.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `execution-graph-compiler`: Endurecer validaciones criptográficas de enlace (`validateExecutionGraphBinding`, `validatePolicySnapshotBinding`), incorporar obligaciones al hash de `GraphId`, blindar la autoridad de obligaciones, verificar evidencia a nivel de nodo en replay y validar outputs fail-closed.
- `kernel-contract-schemas`: Actualizar `execution-graph/v1.schema.json` permitiendo `clarification_context` opcional en nodos.

## Approach

1. Actualizar `execution-graph/v1.schema.json` con la definición de `clarification_context`.
2. Crear `validateExecutionGraphBinding(graph)` y `validatePolicySnapshotBinding(snapshot)` con validación de esquema y recomputación determinista de digests.
3. Actualizar `computeGraphId()` para incluir `obligations` en el preimage e integrar reconciliación inmutable de `contract.obligations`.
4. Endurecer `compileExecutionGraph`, `applyClarifyEvent`, `compileWorkOrdersV2`, `replayExecutionGraph` y `compareShadowExecution` invocando validadores canónicos.
5. Unificar `hasCycle` y aplicar chequeo de evidencia en nodos durante el replay.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `schemas/kernel/execution-graph/v1.schema.json` | Modified | Añade `clarification_context` opcional a `$defs/node`. |
| `scripts/lib/execution-graph/compiler.js` | Modified | Incluye `obligations` en `computeGraphId`, valida inputs/outputs con `validateExecutionGraphBinding`, protege obligaciones y rechaza fallbacks vacíos. |
| `scripts/lib/execution-graph/policy-snapshot.js` | Modified | Implementa y exporta `validatePolicySnapshotBinding`. |
| `scripts/lib/execution-graph/clarify.js` | Modified | Usa módulo unificado `hasCycle` y valida enlaces de snapshots/grafos. |
| `scripts/lib/execution-graph/work-order-compiler.js` | Modified | Aplica `validateExecutionGraphBinding` en pre-validación. |
| `scripts/lib/execution-graph/replay-engine.js` | Modified | Valida `node.required_evidence` antes de completar nodos y valida enlaces. |
| `scripts/lib/execution-graph/shadow-comparator.js` | Modified | Endurece validación de grafos y snapshots contra manipulaciones. |
| `scripts/lib/execution-graph/index.js` | Modified | Exporta nuevos validadores de enlace y utilidades unificadas. |
| `scripts/lib/execution-graph/*.test.js` | Modified | Tests unitarios y de integración para bindings, tampering, clarify y replay. |
| `scripts/lib/k3-k4a-integration.test.js` | Modified | Validar flujo completo con bindings criptográficos y clarify. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Incompatibilidad en `GraphId` por inclusión de obligaciones | Low | Actualizar fixtures y tests con el nuevo preimage canónico determinista. |
| Rechazo estricto de snapshots en tests existentes | Med | Asegurar que los generadores de fixtures usen snapshots canónicos válidos. |

## Rollback Plan

Revertir los cambios en `schemas/kernel/execution-graph/` y `scripts/lib/execution-graph/` mediante Git a la versión anterior de v2.45.1.

## Dependencies

- `scripts/lib/canonical-json.js`
- `scripts/lib/kernel-schema-validator.js`
- `schemas/kernel/execution-graph/v1.schema.json`

## Success Criteria

- [ ] `applyClarifyEvent` produce grafos que validan exitosamente contra `execution-graph/v1.schema.json` y compilan a `WorkOrder` v2.
- [ ] `validateExecutionGraphBinding` detecta y rechaza cualquier manipulación en nodos, obligaciones o IDs de snapshot.
- [ ] `contract.obligations` previene downgrades de criticidad `MUST` -> `MAY`/`SHOULD`.
- [ ] `policy_snapshot_id` falsificado es rechazado criptográficamente por `validatePolicySnapshotBinding`.
- [ ] `sourceSnapshotId: ""` falla closed inmediatamente sin fallback silencioso.
- [ ] `replayExecutionGraph` rechaza nodos completados que carezcan de su `node.required_evidence`.
- [ ] `hasCycle` está unificado en una única implementación compartida.
- [ ] La suite completa de tests (`scripts/lib/execution-graph/*.test.js`, `k3-k4a-integration.test.js`, `lifecycle-model.test.js`) pasa al 100%.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
