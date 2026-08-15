# Tasks: K4a — Execution Graph Compiler, Obligation Manifest, and Deterministic Replay

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-execution-graph-compiler-001 / Compiler generates valid semantic DAG with SourceSnapshot binding for Repair route | MUST | `scripts/lib/execution-graph/compiler.js`, `schemas/kernel/execution-graph/v1.schema.json` | covered-by-design | Compila rutas de reparación en nodos semánticos con objetivos, propiedad, evidencia y `source_snapshot_id` |
| REQ-execution-graph-compiler-001 / Missing or malformed source snapshot id fails graph compilation fail-closed | MUST | `scripts/lib/execution-graph/compiler.js`, `compiler.test.js` | covered-by-design | Fallo fail-closed ante snapshot id faltante, vacío o malformado sin normalización |
| REQ-execution-graph-compiler-001 / Microscopic worker action nodes fail schema and compilation validation | MUST | `scripts/lib/execution-graph/compiler.js`, `schemas/kernel/execution-graph/v1.schema.json` | covered-by-design | Rechazo fail-closed de operaciones microscópicas (`read`, `edit`, `test`, `file_edit`, `bash_run`, `grep`) |
| REQ-execution-graph-compiler-001 / Deterministic GraphId binds contract, policy, and source snapshot digests | MUST | `scripts/lib/execution-graph/compiler.js`, `computeGraphId()` | covered-by-design | Derivación criptográfica SHA-256 de contract_digest, policy_bundle_digest, source_snapshot_id y nodos |
| REQ-execution-graph-compiler-002 / All MUST obligations mapped with evidence pass compilation | MUST | `scripts/lib/execution-graph/obligation-manifest.js`, `validateObligationManifest()` | covered-by-design | Verificación de 100% de obligaciones MUST con `implemented_by` y `required_evidence` |
| REQ-execution-graph-compiler-002 / Orphan MUST obligation fails compilation fail-closed | MUST | `scripts/lib/execution-graph/obligation-manifest.js` | covered-by-design | Rechazo fail-closed identificando la obligación MUST desatendida |
| REQ-execution-graph-compiler-002 / Explicit approved deferral satisfies obligation manifest check | MUST | `scripts/lib/execution-graph/obligation-manifest.js` | covered-by-design | Soporte de objeto `deferred` con `reason` y `approved_by` para excepciones explícitas |
| REQ-execution-graph-compiler-003 / PolicySnapshot captures compile configuration and effective rules | MUST | `scripts/lib/execution-graph/policy-snapshot.js`, `schemas/kernel/policy-snapshot/v1.schema.json` | covered-by-design | Captura de versiones de runtime/compilador/clasificador y array `effective_rules` |
| REQ-execution-graph-compiler-003 / Divergent effective rules produce distinct PolicySnapshot and GraphId digests | MUST | `scripts/lib/execution-graph/policy-snapshot.js`, `computePolicySnapshotDigest()` | covered-by-design | Cualquier divergencia en reglas efectivas altera el digest y desacopla el GraphId |
| REQ-execution-graph-compiler-004 / ClarifyEvent invalidates only descendant nodes in the DAG | MUST | `scripts/lib/execution-graph/clarify.js`, `processClarifyEvent()` | covered-by-design | Cálculo de clausura transitiva de nodos descendientes en DAG |
| REQ-execution-graph-compiler-004 / Unaffected ancestor and sibling node states are preserved | MUST | `scripts/lib/execution-graph/clarify.js` | covered-by-design | Preservación de estados y salidas de nodos ancestros y ramas hermanas independientes |
| REQ-execution-graph-compiler-004 / Circular or unknown dependency references in clarify fail closed | MUST | `scripts/lib/execution-graph/clarify.js` | covered-by-design | Detección de ciclos y referencias inexistentes con aborto fail-closed |
| REQ-execution-graph-compiler-005 / Declarative Work Order v2 is compiled with exact Graph-SourceSnapshot binding | MUST | `scripts/lib/execution-graph/work-order-compiler.js`, `compileWorkOrdersV2()` | covered-by-design | Emisión declarativa `work-order/v2` vinculando `source_snapshot_id` exacto byte-a-byte |
| REQ-execution-graph-compiler-005 / Provenance mismatch or bypass attempt fails closed before emission | MUST | `scripts/lib/execution-graph/work-order-compiler.js` | covered-by-design | Verificación estricta contra `sourceSnapshotId` de contexto con aborto previo a emitir |
| REQ-execution-graph-compiler-005 / Missing, malformed, or invalid source snapshot provenance fails closed | MUST | `scripts/lib/execution-graph/work-order-compiler.js` | covered-by-design | Fallo fail-closed ante snapshot inválido sin inferir sustitutos |
| REQ-execution-graph-compiler-005 / Atomic graph validation fails closed on invalid node or graph escalation with zero emitted orders | MUST | `scripts/lib/execution-graph/work-order-compiler.js` | covered-by-design | Validación atómica completa del grafo antes de emitir; cero órdenes parciales ante error |
| REQ-execution-graph-compiler-005 / Frozen v1 legacy fixtures and consumers remain valid without output downgrade | MUST | `scripts/lib/execution-graph/work-order-compiler.js:compileWorkOrdersV1`, `work-order/v1.schema.json` | covered-by-design | Conservación de export legado v1; baseline K1 inmutable y sin retarget de digest pins |
| REQ-execution-graph-compiler-005 / Work Order compilation does not issue execution authority or invoke workers | MUST | `scripts/lib/execution-graph/work-order-compiler.js` | covered-by-design | Estricta ausencia de permisos de ejecución, tokens de autoridad o procesos runtime |
| REQ-execution-graph-compiler-006 / Fixture replay converges deterministically without live worker invocation | MUST | `scripts/lib/execution-graph/replay-engine.js`, `replayExecutionGraph()` | covered-by-design | Replay determinista e idempotente evaluado contra fixtures de resultados |
| REQ-execution-graph-compiler-006 / Replay does not resurrect invalidated nodes or drop obligations | MUST | `scripts/lib/execution-graph/replay-engine.js` | covered-by-design | Mantiene nodos invalidados sin cumplir y preserva trazabilidad de obligaciones |
| REQ-execution-graph-compiler-007 / Shadow comparison runs alongside fixed baseline on identical inputs | MUST | `scripts/lib/execution-graph/shadow-comparator.js`, `compareShadowDecisions()` | covered-by-design | Evaluación side-by-side de decisiones compiladas contra flujo de referencia |
| REQ-execution-graph-compiler-007 / Shadow observer guarantees zero mutation of active workflow state | MUST | `scripts/lib/execution-graph/shadow-comparator.js` | covered-by-design | Observador puro de sólo lectura sin mutación de estado activo ni journal |
| REQ-execution-graph-compiler-007 / Divergence between shadow and fixed decisions emits telemetry without halting fixed route | MUST | `scripts/lib/execution-graph/shadow-comparator.js` | covered-by-design | Emisión de telemetría estructurada de discrepancias sin bloquear la ruta activa |
| REQ-kernel-contract-schemas-001 / Every required family has $id and version | MUST | `schemas/kernel/manifest.json`, `schemas/kernel/contract-claims.json` | covered-by-design | Publicación con `$id` estable y `schema_version` explícito para todas las familias |
| REQ-kernel-contract-schemas-001 / Consumer can pin a schema version | MUST | `schemas/kernel/manifest.json`, `scripts/lib/kernel-schema-fixtures.test.js` | covered-by-design | Resolución determinista por `$id` y versión sin sustitución silenciosa |
| REQ-kernel-contract-schemas-001 / K2.1 families are included in the required set | MUST | `schemas/kernel/manifest.json`, `scripts/lib/kernel-schema-fixtures.test.js` | covered-by-design | Presencia de OperationPermit, OperationReceipt y effect-class |
| REQ-kernel-contract-schemas-001 / K2a families are included in the required set | MUST | `schemas/kernel/manifest.json`, `scripts/lib/kernel-schema-fixtures.test.js` | covered-by-design | Presencia de HostCapabilities, HostAdapter, transports y CapabilityProof |
| REQ-kernel-contract-schemas-001 / k2a-1 transport envelope families are included | MUST | `schemas/kernel/manifest.json`, `scripts/lib/kernel-schema-fixtures.test.js` | covered-by-design | Presencia de transport-request, transport-outcome y transport-failure |
| REQ-kernel-contract-schemas-001 / K3 execution identity families are included in the required set | MUST | `schemas/kernel/manifest.json`, `scripts/lib/kernel-schema-fixtures.test.js` | covered-by-design | Presencia de SourceSnapshot, WorkOrder, WorkResult y Candidate |
| REQ-kernel-contract-schemas-001 / K4a execution graph, policy snapshot, and clarify event families are included in the required set | MUST | `schemas/kernel/manifest.json`, `schemas/kernel/contract-claims.json` | covered-by-design | Registro de familias `$id` y versión explícita en manifest y claims |
| REQ-kernel-contract-schemas-012 / K3 identity families expose stable id and version | MUST | `schemas/kernel/manifest.json`, `schemas/kernel/work-order/v2.schema.json` | covered-by-design | Publicación de `$id` estable y versiones para familias de identidad |
| REQ-kernel-contract-schemas-012 / Identity confusion negative fixtures fail validation | MUST | `schemas/kernel/work-order/fixtures/invalid/`, `k4a-schema-fixtures.test.js` | covered-by-design | Fixtures negativos de confusión de identidad rechazados fail-closed |
| REQ-kernel-contract-schemas-012 / Schema v2 exposes explicit kind discriminator for candidate and work-order | MUST | `schemas/kernel/work-order/v2.schema.json`, `candidate/v2.schema.json` | covered-by-design | Discriminador `kind: "work-order/v2"` explícito y obligatorio |
| REQ-kernel-contract-schemas-012 / WorkOrder v2 requires and preserves a valid source snapshot identifier | MUST | `schemas/kernel/work-order/v2.schema.json`, `k4a-schema-fixtures.test.js` | covered-by-design | Campo `source_snapshot_id` conforme a `^sha256:[a-f0-9]{64}$` preservado exactamente |
| REQ-kernel-contract-schemas-012 / WorkOrder v2 rejects absent or malformed source snapshot identifier | MUST | `schemas/kernel/work-order/v2.schema.json`, `schemas/kernel/work-order/fixtures/invalid/` | covered-by-design | Rechazo fail-closed de identificadores vacíos, malformados o ausentes |
| REQ-kernel-contract-schemas-012 / Candidate v2 rejects retired relation and inconsistent successor fixture | MUST | `schemas/kernel/candidate/v2.schema.json`, `scripts/lib/k3-schema-fixtures.test.js` | covered-by-design | Rechazo de relaciones retiradas y coherencia de linaje |
| REQ-kernel-contract-schemas-012 / Legacy v1 schemas and K1 baseline remain byte-identical and immutable | MUST | `schemas/kernel/work-order/v1.schema.json`, `scripts/lib/k1-scope-guard.test.js` | covered-by-design | Preservación byte-a-byte de `work-order/v1.schema.json` y digest `K1_SCHEMA_BASELINE` |
| REQ-kernel-contract-schemas-012 / Legacy WorkOrder v1 fixtures remain valid alongside v2 | MUST | `schemas/kernel/work-order/fixtures/valid/minimal.json`, `k4a-schema-fixtures.test.js` | covered-by-design | Validación independiente de fixtures v1 bajo v1 y v2 bajo v2 |
| REQ-kernel-contract-schemas-012 / SourceSnapshot v1 and WorkResult v1 allow optional kind property | MUST | `schemas/kernel/source-snapshot/v1.schema.json`, `schemas/kernel/work-result/v1.schema.json` | covered-by-design | Propiedad opcional `kind` permitida sin violar `additionalProperties: false` |
| REQ-kernel-contract-schemas-015 / Valid execution graph with embedded obligations and source snapshot provenance passes validation | MUST | `schemas/kernel/execution-graph/v1.schema.json`, `fixtures/valid/repair-route.json` | covered-by-design | Esquema JSON para grafo semántico con `source_snapshot_id` y obligaciones embebidas |
| REQ-kernel-contract-schemas-015 / Execution graph missing required fields, source snapshot provenance, or embedded obligations fails validation | MUST | `schemas/kernel/execution-graph/fixtures/invalid/*.json` | covered-by-design | Fixtures negativos para campos requeridos ausentes y procedencia omitida |
| REQ-kernel-contract-schemas-015 / Execution graph with malformed source snapshot id fails validation fail-closed | MUST | `schemas/kernel/execution-graph/fixtures/invalid/malformed-source-snapshot.json` | covered-by-design | Fixture negativo rechazando `source_snapshot_id` con formato o longitud errónea |
| REQ-kernel-contract-schemas-016 / Valid PolicySnapshot schema validates successfully | MUST | `schemas/kernel/policy-snapshot/v1.schema.json`, `fixtures/valid/default-snapshot.json` | covered-by-design | Esquema JSON para PolicySnapshot con versiones y `effective_rules` |
| REQ-kernel-contract-schemas-016 / PolicySnapshot missing required versions or rules fails validation | MUST | `schemas/kernel/policy-snapshot/fixtures/invalid/missing-rules.json` | covered-by-design | Fixture negativo para PolicySnapshot sin versiones requeridas o reglas |
| REQ-kernel-contract-schemas-017 / Valid ClarifyEvent fixture validates successfully | MUST | `schemas/kernel/clarify-event/v1.schema.json`, `fixtures/valid/clarify-node.json` | covered-by-design | Esquema JSON para ClarifyEvent tipado con `affected_nodes` |
| REQ-kernel-contract-schemas-017 / ClarifyEvent missing question_id or affected_nodes fails validation | MUST | `schemas/kernel/clarify-event/fixtures/invalid/missing-affected-nodes.json` | covered-by-design | Fixture negativo para evento sin campos requeridos |
| REQ-contract-lint-012 / Microscopic node in graph is rejected as an offender | MUST | `scripts/lib/contract-checkers/k4a-microscopic-nodes.js` | covered-by-design | Checker de contract-lint reportando operaciones microscópicas como offenders |
| REQ-contract-lint-012 / Semantic coarse graph nodes pass without offenders | MUST | `scripts/lib/contract-checkers/k4a-microscopic-nodes.js` | covered-by-design | Validación limpia para nodos con operaciones semánticas gruesas |
| REQ-contract-lint-013 / Unmapped MUST obligation is reported as an offender | MUST | `scripts/lib/contract-checkers/k4a-obligation-completeness.js` | covered-by-design | Checker de contract-lint reportando obligaciones MUST desatendidas |
| REQ-contract-lint-013 / Complete Obligation Manifest passes lint | MUST | `scripts/lib/contract-checkers/k4a-obligation-completeness.js` | covered-by-design | Validación limpia para grafos con 100% de obligaciones MUST satisfechas |
| REQ-lifecycle-model-conformance-003 / Subject change invalidates bound decision abstractly | MUST | `scripts/lib/lifecycle-model.js`, `lifecycle-model.test.js` | covered-by-design | Invocación abstracta sin requerir campos de Candidate o delivery |
| REQ-lifecycle-model-conformance-003 / Opaque AuthorityToken is insufficient for mutation | MUST | `scripts/lib/lifecycle-model.js`, `lifecycle-model.test.js` | covered-by-design | Fallo fail-closed ante AuthorityToken opaco sin permit concreto |
| REQ-lifecycle-model-conformance-003 / CapabilityProof fields are concrete | MUST | `scripts/lib/lifecycle-model.js`, `lifecycle-model.test.js` | covered-by-design | Verificación de estructura concreta para CapabilityProof |
| REQ-lifecycle-model-conformance-003 / PolicySnapshot and Execution Graph compile structures are concrete | MUST | `scripts/lib/lifecycle-model.js`, `scripts/lib/k4a-lifecycle-model.test.js` | covered-by-design | Promoción de puertos opacos a estructuras concretas en el modelo |
| REQ-lifecycle-model-conformance-004 / Deferred invariant cannot satisfy K2.1 gate | MUST | `scripts/lib/lifecycle-model.js`, `lifecycle-model.test.js` | covered-by-design | Invariantes diferidas no satisfacen compuertas previas |
| REQ-lifecycle-model-conformance-004 / CAS and permit invariants are not deferred | MUST | `scripts/lib/lifecycle-model.js`, `lifecycle-model.test.js` | covered-by-design | Verificación de invariantes K2.1 activas en lista no diferida |
| REQ-lifecycle-model-conformance-004 / K2a host invariants are not deferred | MUST | `scripts/lib/lifecycle-model.js`, `lifecycle-model.test.js` | covered-by-design | Verificación de invariantes K2a activas en lista no diferida |
| REQ-lifecycle-model-conformance-004 / K4a Execution Graph and replay invariants are not deferred | MUST | `scripts/lib/lifecycle-model.js`, `scripts/lib/k4a-lifecycle-model.test.js` | covered-by-design | Remoción de invariantes K4a de la lista `DEFERRED_INVARIANTS` |
| REQ-lifecycle-model-conformance-010 / Every K4a invariant has an executable checker | MUST | `scripts/lib/lifecycle-model.js`, `scripts/lib/k4a-lifecycle-model.test.js` | covered-by-design | Verificadores ejecutables para las 7 invariantes K4a en el harness |
| REQ-lifecycle-model-conformance-010 / Graph ID divergence upon policy rule modification | MUST | `scripts/lib/lifecycle-model.js`, `scripts/lib/k4a-lifecycle-model.test.js` | covered-by-design | Checker de invariante 2 verificando alteración de GraphId ante cambios de reglas |
| REQ-lifecycle-model-conformance-010 / Non-interference checker verifies zero active state mutation | MUST | `scripts/lib/lifecycle-model.js`, `scripts/lib/k4a-lifecycle-model.test.js` | covered-by-design | Checker de invariante 6 verificando no-mutación de estado activo en shadow mode |

### Reconciliation Verdict

- MUST coverage: complete (61/61 escenarios MUST cubiertos por diseño y asignados a componentes)
- SHOULD/MAY gaps: none
- Ambiguities to track: none

---

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~650–900 lines (esquemas v1/v2, fixtures, compilador atómico, checkers, lifecycle model y tests) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Schemas & Fixtures) → PR 2 (Compiler & Obligation Manifest) → PR 3 (WorkOrder v2 & Clarify) → PR 4 (Replay & Shadow) → PR 5 (Lint, Model & Full Verification) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Schemas de kernel, manifest, claims y fixtures (`execution-graph` con `source_snapshot_id`, `policy-snapshot`, `clarify-event`, `work-order` v1/v2) | PR 1 | Base: `main`. Incluye preservación byte-a-byte de v1/K1 y tests en `k4a-schema-fixtures.test.js` y `k1-scope-guard.test.js`. |
| 2 | Compilador DAG, PolicySnapshot y Obligation Manifest (`compiler.js` con `source_snapshot_id`, `policy-snapshot.js`, `obligation-manifest.js`) | PR 2 | Base: PR 1 branch. Incluye derivación determinista de `GraphId` y tests unitarios. |
| 3 | Validación atómica en WorkOrder Compiler y ClarifyEvent (`work-order-compiler.js` con `compileWorkOrdersV2`, `clarify.js`) | PR 3 | Base: PR 2 branch. Incluye validación fail-closed de grafo y procedencia, export legacy v1, invalidación descendiente y tests. |
| 4 | Replay Engine determinista con fixtures y Shadow Comparator no mutante (`replay-engine.js`, `shadow-comparator.js`, `execution-graph/index.js`) | PR 4 | Base: PR 3 branch. Incluye fixtures helpers, replay sin workers runtime, observador puro shadow y barrel export. |
| 5 | Checkers de contract-lint, promoción de invariantes en `lifecycle-model.js` y suite integral de verificación | PR 5 | Base: PR 4 branch. Integración en `contract-lint.js`, verificación de 7 invariantes K4a y ejecución completa de `npm test`. |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Phase 1: Schemas de Kernel, Manifest, Claims y Fixtures (PR 1)

- [x] 1.1 Actualizar `schemas/kernel/execution-graph/v1.schema.json` con `$id`, `schema_version: 1`, obligatoriedad de `source_snapshot_id` (`^sha256:[a-f0-9]{64}$`), definición de nodos semánticos con objetivos/propiedad/evidencia y rechazo fail-closed de operaciones microscópicas (`read`, `edit`, `test`, `file_edit`, `bash_run`, `grep`). [REQ-kernel-contract-schemas-015, REQ-kernel-contract-schemas-001, REQ-execution-graph-compiler-001]
- [x] 1.2 Actualizar fixtures válidos e inválidos de execution-graph en `schemas/kernel/execution-graph/fixtures/`: añadir `source_snapshot_id` a `valid/repair-route.json`, y crear/verificar `invalid/missing-source-snapshot.json`, `invalid/malformed-source-snapshot.json`, `invalid/microscopic-node.json` y `invalid/unmapped-must-obligation.json`. [REQ-kernel-contract-schemas-015, REQ-execution-graph-compiler-001, REQ-execution-graph-compiler-002]
- [x] 1.3 Verificar y mantener `schemas/kernel/policy-snapshot/v1.schema.json` y sus fixtures `schemas/kernel/policy-snapshot/fixtures/{valid/default-snapshot.json,invalid/missing-rules.json}` con `snapshot_id`, `policy_bundle_digest`, versiones y `effective_rules`. [REQ-kernel-contract-schemas-016, REQ-kernel-contract-schemas-001, REQ-execution-graph-compiler-003]
- [x] 1.4 Verificar y mantener `schemas/kernel/clarify-event/v1.schema.json` y sus fixtures `schemas/kernel/clarify-event/fixtures/{valid/clarify-node.json,invalid/missing-affected-nodes.json}` con `event_id`, `question_id`, `answer` y `affected_nodes`. [REQ-kernel-contract-schemas-017, REQ-kernel-contract-schemas-001, REQ-execution-graph-compiler-004]
- [x] 1.5 Preservar byte-a-byte `schemas/kernel/work-order/v1.schema.json` y sus fixtures históricos bajo `schemas/kernel/work-order/fixtures/valid/minimal.json` preservando la compatibilidad estricta con el baseline `K1_SCHEMA_BASELINE`. [REQ-kernel-contract-schemas-012, REQ-execution-graph-compiler-005]
- [x] 1.6 Actualizar `schemas/kernel/work-order/v2.schema.json` con `kind: "work-order/v2"`, `schema_version: 2`, `source_snapshot_id` obligatorio (`^sha256:[a-f0-9]{64}$`), propiedades semánticas y presupuesto, junto a sus fixtures válidos e inválidos en `schemas/kernel/work-order/fixtures/`. [REQ-kernel-contract-schemas-012, REQ-execution-graph-compiler-005]
- [x] 1.7 Actualizar `schemas/kernel/manifest.json` y `schemas/kernel/contract-claims.json` registrando las familias `$id` y versiones de `execution-graph`, `policy-snapshot`, `clarify-event`, y las familias diferenciadas `work-order` (v1) y `work-order-v2`. [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-012, REQ-kernel-contract-schemas-015, REQ-kernel-contract-schemas-016, REQ-kernel-contract-schemas-017]
- [x] 1.8 Ejecutar suite de pruebas de esquemas y baselines en `scripts/lib/k4a-schema-fixtures.test.js`, `scripts/lib/kernel-schema-fixtures.test.js` y `scripts/lib/k1-scope-guard.test.js`. [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-012, REQ-kernel-contract-schemas-015, REQ-kernel-contract-schemas-016, REQ-kernel-contract-schemas-017]

---

## Phase 2: Compilador DAG, PolicySnapshot y Obligation Manifest (PR 2)

- [x] 2.1 Actualizar `scripts/lib/execution-graph/policy-snapshot.js` implementando `createPolicySnapshot` y `computePolicySnapshotDigest` para capturar versiones de compilador/clasificador/runtime y calcular `effective_rules` de forma determinista. [REQ-execution-graph-compiler-003]
- [x] 2.2 Actualizar tests unitarios en `scripts/lib/execution-graph/policy-snapshot.test.js` verificando formato de digest SHA-256 y divergencia de digests ante modificaciones de reglas. [REQ-execution-graph-compiler-003]
- [x] 2.3 Actualizar `scripts/lib/execution-graph/obligation-manifest.js` implementando `validateObligationManifest` para validar cobertura 100% de obligaciones MUST, mapeo a `implemented_by`, `required_evidence` y soporte de `deferred` explícito. [REQ-execution-graph-compiler-002]
- [x] 2.4 Actualizar tests unitarios en `scripts/lib/execution-graph/obligation-manifest.test.js` verificando validación de manifiesto, detección fail-closed de obligaciones huérfanas y manejo de aplazamientos aprobados. [REQ-execution-graph-compiler-002]
- [x] 2.5 Actualizar `scripts/lib/execution-graph/compiler.js` implementando `compileExecutionGraph` para rutas de Reparación con validación de `source_snapshot_id` (`^sha256:[a-f0-9]{64}$`), derivación determinista de `computeGraphId` (`contract_digest` + `policy_bundle_digest` + `source_snapshot_id` + `nodes`), y rechazo fail-closed de nodos microscópicos. [REQ-execution-graph-compiler-001, REQ-execution-graph-compiler-002, REQ-execution-graph-compiler-003]
- [x] 2.6 Actualizar tests unitarios en `scripts/lib/execution-graph/compiler.test.js` validando generación de DAG semántico, derivación determinista de `GraphId`, fallo ante snapshot faltante/malformado y rechazo de operaciones microscópicas. [REQ-execution-graph-compiler-001, REQ-execution-graph-compiler-003]

---

## Phase 3: Validación Atómica en WorkOrder Compiler y ClarifyEvent (PR 3)

- [x] 3.1 Actualizar `scripts/lib/execution-graph/work-order-compiler.js` implementando validación atómica fail-closed en `compileWorkOrdersV2`: validación de esquema de grafo, validación de `source_snapshot_id`, verificación byte-a-byte con `sourceSnapshotId` de contexto, validación de nodos semánticos (sin operaciones microscópicas, con dependencias acíclicas y evidencia requerida), satisfacción completa del Obligation Manifest, y emisión de cero órdenes ante cualquier fallo. [REQ-execution-graph-compiler-005, REQ-kernel-contract-schemas-012]
- [x] 3.2 Mantener en `scripts/lib/execution-graph/work-order-compiler.js` la función de exportación legada `compileWorkOrdersV1` emitiendo formas `work-order/v1` byte-compatibles, y configurar el export público `compileWorkOrders` como alias estricto de `compileWorkOrdersV2`. [REQ-execution-graph-compiler-005, REQ-kernel-contract-schemas-012]
- [x] 3.3 Actualizar tests unitarios en `scripts/lib/execution-graph/work-order-compiler.test.js` comprobando validación atómica con cero emisión ante fallo, verificación byte-a-byte de procedencia, ausencia estricta de tokens de ejecución o autoridad, y aislamiento entre v1 y v2. [REQ-execution-graph-compiler-005, REQ-kernel-contract-schemas-012]
- [x] 3.4 Actualizar `scripts/lib/execution-graph/clarify.js` implementando `processClarifyEvent` / `applyClarifyEvent`, cálculo de clausura transitiva de nodos descendientes en el DAG, preservación de estados y salidas de ancestros y ramas hermanas, y fallo fail-closed ante referencias circulares o desconocidas. [REQ-execution-graph-compiler-004]
- [x] 3.5 Actualizar tests unitarios en `scripts/lib/execution-graph/clarify.test.js` validando invalidación acotada a descendientes, preservación de nodos independientes y detección de dependencias circulares. [REQ-execution-graph-compiler-004]

---

## Phase 4: Replay Engine Determinista, Shadow Comparator y Barrel Export (PR 4)

- [x] 4.1 Actualizar `scripts/lib/test-support/execution-graph-fixtures.js` con generadores de grafos de prueba con `source_snapshot_id` válido, snapshots de política y resultados pregrabados de fixtures. [REQ-execution-graph-compiler-006, REQ-execution-graph-compiler-007]
- [x] 4.2 Actualizar `scripts/lib/execution-graph/replay-engine.js` implementando `replayExecutionGraph` con evaluación topológica determinista, idempotencia, preservación de obligaciones y generación de trazas de contraejemplo sin invocar autoridad ni workers runtime. [REQ-execution-graph-compiler-006]
- [x] 4.3 Actualizar tests unitarios en `scripts/lib/execution-graph/replay-engine.test.js` validando convergencia determinista, idempotencia, preservación de estados invalidados y ausencia de invocación de workers runtime. [REQ-execution-graph-compiler-006]
- [x] 4.4 Actualizar `scripts/lib/execution-graph/shadow-comparator.js` implementando `compareShadowDecisions` / `compareShadowExecution` como observador puro sin mutación de estado, journal ni autoridad, generando telemetría estructurada de diferencias. [REQ-execution-graph-compiler-007]
- [x] 4.5 Actualizar tests unitarios en `scripts/lib/execution-graph/shadow-comparator.test.js` comprobando evaluación side-by-side sobre entradas idénticas, emisión de telemetría de divergencia e inmutabilidad estricta del estado activo. [REQ-execution-graph-compiler-007]
- [x] 4.6 Actualizar `scripts/lib/execution-graph/index.js` exponiendo la API modular completa (`compileExecutionGraph`, `computeGraphId`, `validateObligationManifest`, `createPolicySnapshot`, `computePolicySnapshotDigest`, `processClarifyEvent`, `compileWorkOrders`, `compileWorkOrdersV2`, `compileWorkOrdersV1`, `replayExecutionGraph`, `compareShadowDecisions`). [REQ-execution-graph-compiler-001, REQ-execution-graph-compiler-002, REQ-execution-graph-compiler-003, REQ-execution-graph-compiler-004, REQ-execution-graph-compiler-005, REQ-execution-graph-compiler-006, REQ-execution-graph-compiler-007]
- [x] 4.7 Actualizar tests de exportación en `scripts/lib/execution-graph/index.test.js` validando las firmas y comportamiento de la API pública. [REQ-execution-graph-compiler-001, REQ-execution-graph-compiler-005]

---

## Phase 5: Contract-Lint Checkers, Lifecycle Model Conformance y Verificación Integral (PR 5)

- [x] 5.1 Actualizar checker `scripts/lib/contract-checkers/k4a-microscopic-nodes.js` para detectar y reportar como offender cualquier nodo de grafo con operaciones microscópicas (`read`, `edit`, `test`, `file_edit`, `bash_run`, `grep`). [REQ-contract-lint-012]
- [x] 5.2 Actualizar checker `scripts/lib/contract-checkers/k4a-obligation-completeness.js` para validar completitud del Obligation Manifest y reportar obligaciones MUST no mapeadas o sin evidencia requerida. [REQ-contract-lint-013]
- [x] 5.3 Registrar los checkers en `scripts/lib/contract-lint.js` dentro del pipeline de linters del kernel. [REQ-contract-lint-012, REQ-contract-lint-013]
- [x] 5.4 Actualizar tests unitarios en `scripts/lib/contract-checkers/k4a-checkers.test.js` validando la detección de offenders y el paso limpio de grafos semánticos completos. [REQ-contract-lint-012, REQ-contract-lint-013]
- [x] 5.5 Actualizar `scripts/lib/lifecycle-model.js` promoviendo `PolicySnapshot`, `SourceSnapshot` binding y las 7 invariantes ejecutables K4a (Graph ID determinista, divergencia de políticas, cobertura de obligaciones, invalidación de clarify, convergencia de replay, no-interferencia en shadow, y ausencia de autoridad en runtime) de `DEFERRED_INVARIANTS` a verificadores ejecutables. [REQ-lifecycle-model-conformance-003, REQ-lifecycle-model-conformance-004, REQ-lifecycle-model-conformance-010]
- [x] 5.6 Actualizar suite de pruebas de modelo en `scripts/lib/k4a-lifecycle-model.test.js` y `scripts/lib/lifecycle-model.test.js` ejecutando la verificación de las 7 invariantes K4a. [REQ-lifecycle-model-conformance-003, REQ-lifecycle-model-conformance-004, REQ-lifecycle-model-conformance-010]
- [x] 5.7 Ejecutar la suite integral de verificación del kernel y regresión completa (`node --test scripts/lib/execution-graph/*.test.js scripts/lib/contract-checkers/k4a-checkers.test.js scripts/lib/k4a-*.test.js scripts/lib/kernel-schema-fixtures.test.js scripts/lib/k1-scope-guard.test.js` y `npm test`). [REQ-execution-graph-compiler-001, REQ-execution-graph-compiler-002, REQ-execution-graph-compiler-003, REQ-execution-graph-compiler-004, REQ-execution-graph-compiler-005, REQ-execution-graph-compiler-006, REQ-execution-graph-compiler-007, REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-012, REQ-kernel-contract-schemas-015, REQ-kernel-contract-schemas-016, REQ-kernel-contract-schemas-017, REQ-contract-lint-012, REQ-contract-lint-013, REQ-lifecycle-model-conformance-003, REQ-lifecycle-model-conformance-004, REQ-lifecycle-model-conformance-010]
