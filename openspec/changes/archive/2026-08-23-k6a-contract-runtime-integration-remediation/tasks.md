# Tasks: k6a-contract-runtime-integration-remediation

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| `REQ-worker-isolation-001` / Provision fresh isolated workspace with registry tracking | MUST | `scripts/lib/worker-workspace.js`, `createWorkspace` con registro privado en memoria (`Map`) y captura de `baselineInventory` | covered-by-design | Descriptor `workspace-descriptor/v1` con status `active` |
| `REQ-worker-isolation-001` / Dispose workspace removes directory and releases resources idempotently | MUST | `scripts/lib/worker-workspace.js`, `disposeWorkspace` resolviendo exclusivamente desde el registro privado | covered-by-design | Previene borrado arbitrario y asegura idempotencia |
| `REQ-worker-isolation-002` / Materialize canonical snapshot decoupled from DAG dependency IDs | MUST | `scripts/lib/worker-workspace.js`, `materializeSourceSnapshot` proyectando `capsule_inputs` desde `SourceSnapshot v1` | covered-by-design | Desacopla dependencias de grafo DAG (`sha256:...`) de inputs |
| `REQ-worker-isolation-002` / Deterministic capsule fingerprint across identical inputs | MUST | `scripts/lib/worker-workspace.js`, cómputo de digest SHA-256 determinista sobre archivos proyectados | covered-by-design | Falla cerrado si faltan inputs requeridos |
| `REQ-worker-isolation-003` / Mutation delta within allowed_paths passes containment validation | MUST | `scripts/lib/allowed-paths-validator.js`, cálculo de delta (`created`, `modified`, `deleted`) vs `baselineInventory` | covered-by-design | Valida mutaciones reales respecto a `allowed_paths` |
| `REQ-worker-isolation-003` / Relative path traversal or symlink escape fails closed | MUST | `scripts/lib/allowed-paths-validator.js`, validación estricta de traversal e inspección de symlinks en jerarquías no instanciadas | covered-by-design | Emite descriptor `containment-violation/v1` |
| `REQ-worker-isolation-004` / Asynchronous execution via WorkerTransport with capability verification | MUST | `scripts/lib/worker-executor.js`, consumo de `WorkerTransport` vía `invokeTransportAsync` y `resolveCapabilityState` | covered-by-design | Ejecución asíncrona real con validación de proofs |
| `REQ-worker-isolation-004` / Host execution error is captured without runtime crash | MUST | `scripts/lib/worker-executor.js`, captura controlada de exit codes, stdout/stderr y telemetría | covered-by-design | Manejo sin excepciones no capturadas |
| `REQ-worker-isolation-005` / Capture canonical WorkResult with applicable unified diff | MUST | `scripts/lib/worker-executor.js`, `captureWorkResult` emitiendo unified diff real sobre mutation delta | covered-by-design | Cumple contrato `work-result/v1` |
| `REQ-worker-isolation-005` / Captured WorkResult validates cryptographic binding | MUST | `scripts/lib/worker-executor.js`, delegación estricta en `computeWorkResultId` y `validateWorkResultBinding` de `execution-identities` | covered-by-design | Cero propiedades de `CandidateId` |
| `REQ-worker-isolation-006` / Timeout or abort triggers interrupted recovery capture | MUST | `scripts/lib/worker-executor.js`, control de `AbortSignal` y presupuesto K5 en `recoverInterruptedExecution` | covered-by-design | Termina subprocesos y transiciona a status `interrupted` |
| `REQ-worker-isolation-006` / Partial logs and modified files preserved in recovery descriptor | MUST | `scripts/lib/worker-executor.js`, preservación de logs y delta modificado en descriptor de recovery | covered-by-design | Trazabilidad completa de ejecuciones interrumpidas |
| `REQ-kernel-contract-schemas-021` / Valid workspace descriptor and capsule definition fixtures pass validation | MUST | `schemas/kernel/workspace-descriptor/` y `schemas/kernel/capsule-definition/`, schemas y fixtures | covered-by-design | Valida contratos `workspace-descriptor/v1` y `capsule-definition/v1` |
| `REQ-kernel-contract-schemas-021` / Workspace descriptor with invalid status or malformed source_snapshot_id fails validation | MUST | `schemas/kernel/workspace-descriptor/v1.schema.json`, validación de regex y enum | covered-by-design | Falla cerrado ante propiedades inválidas |
| `REQ-kernel-contract-schemas-021` / Capsule definition missing allowed_paths or dependencies fails validation | MUST | `schemas/kernel/capsule-definition/v1.schema.json`, schema con `additionalProperties: false` | covered-by-design | Rechaza campos requeridos ausentes |
| `REQ-contract-lint-018` / Non-canonical fixture shape in worker isolation is reported as an offender | MUST | `scripts/lib/contract-checkers/k6a-canonical-contracts.js`, detección de `.files` sintético o no-SHA256 | covered-by-design | Falla el lint agregador |
| `REQ-contract-lint-018` / Conforming canonical worker isolation contracts pass lint | MUST | `scripts/lib/contract-checkers/k6a-canonical-contracts.js` y `scripts/lib/contract-lint.js` | covered-by-design | 0 offenders en repositorio limpio |
| `REQ-lifecycle-model-conformance-012` / Every K6a worker isolation invariant has an executable checker | MUST | `scripts/lib/lifecycle-model.js`, los 6 invariantes `inv-k6a-*` mapeados a funciones de chequeo | covered-by-design | Verificación ejecutable completa |
| `REQ-lifecycle-model-conformance-012` / Model proves containment violation halts execution fail-closed | MUST | `scripts/lib/lifecycle-model.js`, `checkK6aContainmentFailClosed` verificando `containment-violation/v1` | covered-by-design | Garantiza contención en modelo |
| `REQ-lifecycle-model-conformance-012` / Model proves interrupted execution preserves partial telemetry | MUST | `scripts/lib/lifecycle-model.js`, `checkK6aInterruptedRecoveryPreservation` validando recovery | covered-by-design | Preserva telemetría parcial |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~450 - 650 lines |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Single PR (size:exception aceptada explícitamente para remediación de K6a) |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Schemas & Fixtures: `capsule-definition` con `capsule_inputs` y fixtures de `work-result` | PR 1 | Base de contratos y validación de schemas |
| 2 | Contención y symlinks: `allowed-paths-validator.js` sobre mutation deltas | PR 1 | Blindaje de ancestros de symlink y validación de mutaciones |
| 3 | Workspace y materialización: `worker-workspace.js` con registro privado y `SourceSnapshot v1` | PR 1 | Proyección canónica y `baselineInventory` |
| 4 | Ejecución y binding: `worker-executor.js` con `WorkerTransport`, `AbortSignal` y diff real | PR 1 | Delegación en `execution-identities` y budgets K5 |
| 5 | Linter de contratos: `k6a-canonical-contracts.js` en `contract-lint.js` | PR 1 | Guardas estáticas contra pseudo-WorkOrders y `.files` |
| 6 | Invariantes de modelo: 6 invariantes `inv-k6a-*` en `lifecycle-model.js` | PR 1 | Verificación ejecutable de ciclo de vida y contención |
| 7 | Pipeline E2E: Integración K3 -> K4a -> K6a -> K3 y regresión completa | PR 1 | Reconstrucción de árbol con unified diff y verificación total |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Schemas y Fixtures de Contratos Kernel (`schemas/kernel/`)

- [x] 1.1 [RED] Añadir tests de esquema en `scripts/lib/k6a-schema-fixtures.test.js` que fallen esperando la propiedad opcional `capsule_inputs` en `capsule-definition/v1.schema.json` y fixtures con hashes canónicos. [REQ-kernel-contract-schemas-021]
- [x] 1.2 [GREEN] Modificar `schemas/kernel/capsule-definition/v1.schema.json` para declarar `capsule_inputs: string[]` opcional y actualizar fixtures en `schemas/kernel/capsule-definition/fixtures/valid/` con `capsule_inputs` y dependencias DAG SHA-256. [REQ-kernel-contract-schemas-021, REQ-worker-isolation-002]
- [x] 1.3 [GREEN] Actualizar fixtures de `schemas/kernel/work-result-execution-payload/fixtures/valid/` para incorporar parches unified diff reales y hashes bound calculados con `execution-identities`. [REQ-kernel-contract-schemas-021, REQ-worker-isolation-005]
- [x] 1.4 [REFACTOR] Ejecutar `node --test scripts/lib/k6a-schema-fixtures.test.js` y verificar validación schema estricta con `additionalProperties: false`. [REQ-kernel-contract-schemas-021]

## Phase 2: Módulo de Contención y Validación de Rutas (`allowed-paths-validator.js`)

- [x] 2.1 [RED] Extender `scripts/lib/allowed-paths-validator.test.js` con tests que fallen al validar symlinks en jerarquías intermedias no instanciadas y validación sobre deltas de mutación. [REQ-worker-isolation-003]
- [x] 2.2 [GREEN] Modificar `scripts/lib/allowed-paths-validator.js` implementando la inspección recursiva de directorios ancestros para symlinks y la función `isPathContained`. [REQ-worker-isolation-003]
- [x] 2.3 [GREEN] Adaptar `validateAllowedPaths` en `scripts/lib/allowed-paths-validator.js` para procesar listas de deltas de mutación y emitir descriptores `containment-violation/v1` tipados en fallo cerrado. [REQ-worker-isolation-003]
- [x] 2.4 [REFACTOR] Ejecutar `node --test scripts/lib/allowed-paths-validator.test.js` y refactorizar normalizaciones de ruta POSIX y manejo de errores sin fugas de excepción. [REQ-worker-isolation-003]

## Phase 3: Módulo de Workspace y Materialización Canónica (`worker-workspace.js`)

- [x] 3.1 [RED] Crear tests en `scripts/lib/worker-workspace.test.js` que fallen esperando el registro privado en memoria (`Map`), captura de `baselineInventory` en `createWorkspace`, y materialización canónica desde `SourceSnapshot v1` con `capsule_inputs` (sin `.files`). [REQ-worker-isolation-001, REQ-worker-isolation-002]
- [x] 3.2 [GREEN] Implementar registro privado en memoria (`workspace_id -> descriptor`) y captura de `baselineInventory` en `createWorkspace`, junto con resolución exclusiva de workspaces en `disposeWorkspace` en `scripts/lib/worker-workspace.js`. [REQ-worker-isolation-001]
- [x] 3.3 [GREEN] Reescribir `materializeSourceSnapshot` en `scripts/lib/worker-workspace.js` para proyectar exclusivamente `capsule_inputs` desde `SourceSnapshot v1`, desacoplar dependencias DAG SHA-256 y calcular `fingerprint` determinista. [REQ-worker-isolation-002]
- [x] 3.4 [REFACTOR] Ejecutar `node --test scripts/lib/worker-workspace.test.js`, asegurar idempotencia en `disposeWorkspace` y limpieza estricta de temporales. [REQ-worker-isolation-001, REQ-worker-isolation-002]

## Phase 4: Módulo de Ejecución y Captura de Resultados (`worker-executor.js`)

- [x] 4.1 [RED] Actualizar tests en `scripts/lib/worker-executor.test.js` para probar ejecución asíncrona vía `WorkerTransport` (`invokeTransportAsync`), evaluación de `resolveCapabilityState`, control de `AbortSignal`/timeouts K5, delegación en `computeWorkResultId` y generación de unified diff real sobre mutation delta. [REQ-worker-isolation-004, REQ-worker-isolation-005, REQ-worker-isolation-006]
- [x] 4.2 [GREEN] Integrar `WorkerTransport` e `invokeTransportAsync` en `executeWorkOrder` de `scripts/lib/worker-executor.js`, con verificación de capability vía `resolveCapabilityState` y fallback seguro a `partial`/`unavailable`. [REQ-worker-isolation-004]
- [x] 4.3 [GREEN] Implementar terminación limpia de subprocesos y captura de telemetría parcial en `recoverInterruptedExecution` ante `AbortSignal` o exceder `budget.wall_time_minutes`. [REQ-worker-isolation-006]
- [x] 4.4 [GREEN] Implementar en `scripts/lib/worker-executor.js` el cálculo de mutation delta contra `baselineInventory`, generación de parche unified diff real aplicable y delegación de `computeWorkResultId` y `validateWorkResultBinding` en `execution-identities`. [REQ-worker-isolation-005]
- [x] 4.5 [REFACTOR] Ejecutar `node --test scripts/lib/worker-executor.test.js` asegurando cero emisiones de `CandidateId` y binding criptográfico 100% verificado. [REQ-worker-isolation-004, REQ-worker-isolation-005, REQ-worker-isolation-006]

## Phase 5: Checkers de Contract-Lint (`scripts/lib/contract-checkers/`)

- [x] 5.1 [RED] Crear tests unitarios en `scripts/lib/contract-checkers/k6a-canonical-contracts.test.js` para detectar fallos de linting en schemas con `dependencies` como rutas o `CandidateId` en WorkResult. [REQ-contract-lint-001]
- [x] 5.2 [GREEN] Implementar el checker `scripts/lib/contract-checkers/k6a-canonical-contracts.js` validando la consistencia estricta de contratos canónicos (`capsule_inputs` desacoplado de dependencias DAG, prohibición de `CandidateId` en `work-result/*`). [REQ-contract-lint-001]
- [x] 5.3 [GREEN] Registrar `k6a-canonical-contracts` en `scripts/lib/contract-lint.js` dentro del pipeline de verificación de linters del kernel. [REQ-contract-lint-001]
- [x] 5.4 [REFACTOR] Ejecutar `node --test scripts/lib/contract-checkers/k6a-canonical-contracts.test.js` y verificar la suite general de contract-lint. [REQ-contract-lint-001]

## Phase 6: Invariantes del Modelo de Ciclo de Vida (`scripts/lib/lifecycle-model.js`)

- [x] 6.1 [RED] Crear/actualizar tests en `scripts/lib/lifecycle-model.test.js` que fallen esperando validaciones asíncronas de transporte, schemas canónicos y ausencia estricta de `CandidateId` en las 6 invariantes `inv-k6a-*`. [REQ-lifecycle-001, REQ-lifecycle-002, REQ-lifecycle-003, REQ-lifecycle-004, REQ-lifecycle-005, REQ-lifecycle-006]
- [x] 6.2 [GREEN] Adaptar las funciones de invariantes `inv-k6a-001` a `inv-k6a-006` en `scripts/lib/lifecycle-model.js` para consumir los contratos canónicos K6a y validar ejecución asíncrona de `WorkerTransport`. [REQ-lifecycle-001, REQ-lifecycle-002, REQ-lifecycle-003, REQ-lifecycle-004, REQ-lifecycle-005, REQ-lifecycle-006]
- [x] 6.3 [REFACTOR] Ejecutar `node --test scripts/lib/lifecycle-model.test.js` y verificar paso completo sin regresiones en invariantes previas. [REQ-lifecycle-001, REQ-lifecycle-002, REQ-lifecycle-003, REQ-lifecycle-004, REQ-lifecycle-005, REQ-lifecycle-006]

## Phase 7: E2E de Composición Canónica y Verificación Integral

- [x] 7.1 [RED] Extender `scripts/k6a-e2e-worker-isolation.test.js` con tests de pipeline completo K3 (`SourceSnapshot v1`) -> K4a (`compileWorkOrdersV2`) -> K6a (`executeWorkOrder`) -> K3 (`validateWorkResultBinding`) con reconstrucción y aplicación de diff unified. [REQ-worker-isolation-001, REQ-worker-isolation-002, REQ-worker-isolation-004, REQ-worker-isolation-005]
- [x] 7.2 [GREEN] Actualizar `scripts/k6a-e2e-worker-isolation.test.js` adaptando los escenarios happy-path y negativos a la materialización por `capsule_inputs`, ejecución con `WorkerTransport`, validación de delta sobre `baselineInventory` y verificación criptográfica con `execution-identities`. [REQ-worker-isolation-001, REQ-worker-isolation-002, REQ-worker-isolation-003, REQ-worker-isolation-004, REQ-worker-isolation-005, REQ-worker-isolation-006]
- [x] 7.3 [REFACTOR] Ejecutar suite de pruebas completa del kernel (`npm test` o `node --test scripts/**/*.test.js`) asegurando 100% de tests pasando y cero regresiones. [REQ-worker-isolation-001, REQ-worker-isolation-002, REQ-worker-isolation-003, REQ-worker-isolation-004, REQ-worker-isolation-005, REQ-worker-isolation-006, REQ-kernel-contract-schemas-021, REQ-contract-lint-018, REQ-lifecycle-model-conformance-012]
