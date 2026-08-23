# Tasks: k6a-runtime-boundary-closure

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-worker-isolation-001: Provision fresh isolated workspace with internal UUID | MUST | `scripts/lib/worker-workspace.js` (`createWorkspace`), ADR-004 | covered-by-design | Genera UUID interno `ws-${crypto.randomUUID()}` y registra en `workspaceRegistry` privado |
| REQ-worker-isolation-001: Caller-supplied workspace_id is ignored | MUST | `scripts/lib/worker-workspace.js` (`createWorkspace`), ADR-004 | covered-by-design | `options.workspace_id` se descarta forzando asignación interna de UUID |
| REQ-worker-isolation-001: Dispose workspace removes directory idempotently via registry | MUST | `scripts/lib/worker-workspace.js` (`disposeWorkspace`), ADR-004 | covered-by-design | Resolución exclusiva a través del registro privado de workspace |
| REQ-worker-isolation-001: Dispose unrecorded workspace fails closed | MUST | `scripts/lib/worker-workspace.js` (`disposeWorkspace`), ADR-004 | covered-by-design | No opera en rutas no verificadas si el workspace no está en el registro |
| REQ-worker-isolation-002: Materialize canonical snapshot decoupled from DAG dependency IDs | MUST | `scripts/lib/worker-workspace.js` (`materializeSourceSnapshot`), ADR-001, ADR-004 | covered-by-design | Consume `capsule_inputs` explícitos desacoplados de DAG IDs SHA-256 |
| REQ-worker-isolation-002: Deterministic capsule fingerprint across identical inputs | MUST | `scripts/lib/worker-workspace.js` (`materializeSourceSnapshot`), ADR-004 | covered-by-design | Cálculo determinista de `fingerprint` SHA-256 sobre inputs declarados |
| REQ-worker-isolation-002: Materialization fails closed for unrecorded workspace | MUST | `scripts/lib/worker-workspace.js` (`materializeSourceSnapshot`), ADR-004 | covered-by-design | Lanza excepción inmediata sin fallback a `descriptor.root_path` |
| REQ-worker-isolation-002: Baseline file content preserved for diffing | MUST | `scripts/lib/worker-workspace.js` (`materializeSourceSnapshot`), ADR-001 | covered-by-design | Almacena `baselineContents` (Map<relPath, utf8Content>) en el registro privado |
| REQ-worker-isolation-003: Mutation delta within allowed_paths passes containment validation | MUST | `scripts/lib/allowed-paths-validator.js` (`validateAllowedPaths`), ADR-005 | covered-by-design | Valida delta (`created`, `modified`, `deleted`) contra globs permitidos |
| REQ-worker-isolation-003: Relative path traversal or symlink escape fails closed | MUST | `scripts/lib/allowed-paths-validator.js` (`checkSymlinkEscape`), ADR-005 | covered-by-design | Emite `containment-violation/v1` ante escapes de raíz de workspace |
| REQ-worker-isolation-003: Filesystem realpath exception fails closed as containment violation | MUST | `scripts/lib/allowed-paths-validator.js` (`checkSymlinkEscape`), ADR-005 | covered-by-design | Captura excepciones de `fs.realpathSync` y emite `violation_type: "symlink_escape"` |
| REQ-worker-isolation-004: Asynchronous execution via WorkerTransport with signal and deadline propagation | MUST | `scripts/lib/worker-executor.js` (`executeWorkOrder`), ADR-002, ADR-003 | covered-by-design | Invocación de 2 argumentos `invokeTransportAsync(workerTransport, { signal, deadlineMs, input })` |
| REQ-worker-isolation-004: Telemetry preservation across transport normalization | MUST | `scripts/lib/host-contract/index.js` (`normalizeTransportOutcome`), ADR-003 | covered-by-design | Preserva `stdout`, `stderr` y `exit_code` en el resultado normalizado |
| REQ-worker-isolation-004: Local subprocess execution awaits close event before recovery | MUST | `scripts/lib/worker-executor.js` (`executeWorkOrder`), ADR-003 | covered-by-design | Espera asíncrona del evento `'close'` del child process antes de invocar `recoverInterruptedExecution` |
| REQ-worker-isolation-004: Host execution error is captured without runtime crash | MUST | `scripts/lib/worker-executor.js` (`executeWorkOrder`), ADR-003 | covered-by-design | Captura fallos de ejecución y logs sin excepciones no controladas |
| REQ-worker-isolation-005: Capture canonical WorkResult with applicable unified diff hunks | MUST | `scripts/lib/worker-executor.js` (`generateUnifiedDiff`, `captureWorkResult`), ADR-001, ADR-006 | covered-by-design | Emite hunks estándar `--- a/`, `+++ b/`, `@@ -l,s +l,s @@` comparando contra `baselineContents` |
| REQ-worker-isolation-005: Captured WorkResult validates cryptographic binding | MUST | `scripts/lib/worker-executor.js` (`validateWorkResultBinding`), ADR-006 | covered-by-design | Delegación a `computeWorkResultId` y validación con `validateWorkResultBinding` |
| REQ-worker-isolation-005: File creation and deletion use standard diff headers | MUST | `scripts/lib/worker-executor.js` (`generateUnifiedDiff`), ADR-001 | covered-by-design | Usa `--- /dev/null` / `+++ b/{path}` para creados y `--- a/{path}` / `+++ /dev/null` para borrados |
| REQ-worker-isolation-006: Timeout or abort triggers interrupted recovery capture | MUST | `scripts/lib/worker-executor.js` (`recoverInterruptedExecution`), ADR-003 | covered-by-design | Captura logs parciales y mutation delta tras asentamiento de subproceso |
| REQ-worker-isolation-006: Partial logs and modified files preserved in recovery descriptor | MUST | `scripts/lib/worker-executor.js` (`recoverInterruptedExecution`), ADR-003 | covered-by-design | Estructura descriptores de recuperación con estado `interrupted` y streams parciales |
| REQ-worker-isolation-008: Enforced capability executes with sandbox and verified WorkerTransport | MUST | `scripts/lib/worker-executor.js` (`executeWorkOrder`), ADR-002 | covered-by-design | Reporta `isolationReported = "enforced"` solo con `WorkerTransport` activo verificado |
| REQ-worker-isolation-008: Enforced capability without WorkerTransport fails closed | MUST | `scripts/lib/worker-executor.js` (`executeWorkOrder`), ADR-002 | covered-by-design | Rechaza ejecución fail-closed si se declara/solicita `enforced` sin `WorkerTransport` |
| REQ-worker-isolation-008: Partial or unavailable capability executes local fallback without silent promotion | MUST | `scripts/lib/worker-executor.js` (`executeWorkOrder`), ADR-002 | covered-by-design | Fallback de spawn local reporta `partial` o `unavailable`, nunca `enforced` |
| REQ-contract-lint-018: Non-canonical fixture shape or JS invocation is reported as an offender | MUST | `scripts/lib/contract-checkers/k6a-canonical-contracts.js`, ADR-005 | covered-by-design | Audita fixtures y código JS reportando `.files` sintéticos o dependencias no-SHA256 |
| REQ-contract-lint-018: Conforming canonical worker isolation contracts pass lint | MUST | `scripts/lib/contract-checkers/k6a-canonical-contracts.js`, ADR-005 | covered-by-design | Invocaciones y fixtures canónicas pasan con cero offenders |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 280-360 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | single-pr |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: single-pr
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Cierre de fronteras de ejecución, diff estándar y contención fail-closed en K6a | PR 1 (Single PR) | Entrega integral y atómica abarcando `worker-workspace`, `worker-executor`, `allowed-paths-validator`, `host-contract`, `k6a-canonical-contracts` y suite E2E K3->K4a->K6a->K3 |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Schemas, Identidades y Almacenamiento Baseline en `worker-workspace.js`

- [x] 1.1 [RED] Escribir tests unitarios en `scripts/lib/worker-workspace.test.js` que validen la asignación forzada de UUIDs internos (`ws-${crypto.randomUUID()}`) en `createWorkspace` descartando `options.workspace_id`, la encapsulación privada e inmutabilidad del registro, el rechazo fail-closed (lanzando excepción) en `materializeSourceSnapshot` para descriptores no registrados, y la retención íntegra de `baselineContents` (Map<relPath, utf8Content>) durante la materialización [REQ-worker-isolation-001, REQ-worker-isolation-002]
- [x] 1.2 [GREEN] Implementar en `scripts/lib/worker-workspace.js` la generación interna exclusiva de `workspace_id` con UUID, privatizar `workspaceRegistry` eliminando mutaciones externas, almacenar copias de contenido base en `baselineContents` durante `materializeSourceSnapshot`, y eliminar el fallback directo a `descriptor.root_path` para forzar fallo cerrado en workspaces no registrados [REQ-worker-isolation-001, REQ-worker-isolation-002]
- [x] 1.3 [REFACTOR] Limpiar `scripts/lib/worker-workspace.js` eliminando rutas legacy de dependencias basadas en rutas de archivo y consolidando la inmutabilidad de los descriptores de workspace [REQ-worker-isolation-001, REQ-worker-isolation-002]

## Phase 2: Diff Unificado Real y Aplicable en `worker-executor.js`

- [x] 2.1 [RED] Escribir tests unitarios en `scripts/lib/worker-executor.test.js` para `generateUnifiedDiff` verificando la emisión de hunks unificados estándar (`--- a/{path}`, `+++ b/{path}`, `@@ -l,s +l,s @@`) comparando archivos mutados en disco contra `baselineContents`, cabeceras `--- /dev/null` / `+++ b/{path}` para archivos creados y `--- a/{path}` / `+++ /dev/null` para archivos eliminados, y validación criptográfica de `computeWorkResultId` y `validateWorkResultBinding` sin propiedades `candidate_id` [REQ-worker-isolation-002, REQ-worker-isolation-005]
- [x] 2.2 [GREEN] Modificar `generateUnifiedDiff` y `captureWorkResult` en `scripts/lib/worker-executor.js` para computar diffs línea por línea contra `baselineContents` recuperado del registro privado de workspace, eliminando placeholders sintéticos `-old` / `+new` y ensamblando el payload canónico `work-result/v1` conforme a `execution-identities` [REQ-worker-isolation-002, REQ-worker-isolation-005]
- [x] 2.3 [REFACTOR] Modularizar las rutinas de generación de diff y extracción de líneas en `scripts/lib/worker-executor.js`, asegurando eficiencia de memoria y acotamiento de diffs al mutation delta (`created`, `modified`, `deleted`) [REQ-worker-isolation-005]

## Phase 3: Host Contract y `WorkerTransport` Enforcement

- [x] 3.1 [RED] Escribir tests unitarios en `scripts/lib/host-contract/index.test.js` y `scripts/lib/worker-executor.test.js` para validar la firma de 2 argumentos `invokeTransportAsync(workerTransport, { signal, deadlineMs, input })`, la preservación de telemetría (`stdout`, `stderr`, `exit_code`) en `normalizeTransportOutcome`, y el fallo cerrado cuando `isolationCapability: "enforced"` no cuenta con un `WorkerTransport` activo verificado [REQ-worker-isolation-004, REQ-worker-isolation-008]
- [x] 3.2 [GREEN] Actualizar `normalizeTransportOutcome` en `scripts/lib/host-contract/index.js` para retener `stdout`, `stderr` y `exit_code`, y modificar `executeWorkOrder` en `scripts/lib/worker-executor.js` para invocar `invokeTransportAsync(workerTransport, { signal, deadlineMs, input })` y forzar fallo cerrado si `isolationCapability: "enforced"` carece de `WorkerTransport` activo (reportando `partial`/`unavailable` en spawn local) [REQ-worker-isolation-004, REQ-worker-isolation-008]
- [x] 3.3 [REFACTOR] Refactorizar la gestión de capacidades y degradación de aislamiento en `scripts/lib/worker-executor.js`, garantizando que ninguna ejecución local por subproceso promueva indebidamente el estado a `enforced` [REQ-worker-isolation-008]

## Phase 4: Contención Fail-Closed y Sincronización de Procesos

- [x] 4.1 [RED] Escribir tests unitarios en `scripts/lib/allowed-paths-validator.test.js` y `scripts/lib/worker-executor.test.js` que simulen excepciones en `fs.realpathSync` en `checkSymlinkEscape` para verificar la emisión de `containment-violation/v1` con `violation_type: "symlink_escape"`, y verificar la sincronización con el evento `'close'` del child process antes de invocar `recoverInterruptedExecution` ante abortos o timeouts [REQ-worker-isolation-003, REQ-worker-isolation-004, REQ-worker-isolation-006]
- [x] 4.2 [GREEN] Modificar `checkSymlinkEscape` en `scripts/lib/allowed-paths-validator.js` para capturar cualquier excepción de filesystem retornando `isEscape: true` (fail-closed), e implementar en `scripts/lib/worker-executor.js` la barrera de sincronización `await new Promise(resolve => child.on('close', resolve))` antes de finalizar el estado de recuperación interrumpida [REQ-worker-isolation-003, REQ-worker-isolation-004, REQ-worker-isolation-006]
- [x] 4.3 [REFACTOR] Estandarizar la terminación de procesos hijos (SIGTERM/SIGKILL) y saneamiento de descriptores de stream en `scripts/lib/worker-executor.js` para prevenir procesos zombis y condiciones de carrera en I/O [REQ-worker-isolation-004, REQ-worker-isolation-006]

## Phase 5: Reconciliación Normativa REQ-contract-lint-018 y Limpieza de Código Legacy

- [x] 5.1 [RED] Escribir tests en `scripts/lib/contract-checkers/k6a-canonical-contracts.test.js` que verifiquen que `k6a-canonical-contracts` detecta y reporta offenders en fixtures y archivos JS que asuman propiedades `.files` en `SourceSnapshot v1` o dependencias no-SHA256 en `WorkOrder v2` [REQ-contract-lint-018]
- [x] 5.2 [GREEN] Extender `scripts/lib/contract-checkers/k6a-canonical-contracts.js` para auditar fixtures y código JS contra uso no canónico de contratos, y purgar en `scripts/lib/worker-workspace.js` y `scripts/lib/worker-executor.js` todas las ramas residuales que consulten `.files` [REQ-contract-lint-018]
- [x] 5.3 [REFACTOR] Limpiar y actualizar todas las fixtures y tests existentes en `scripts/lib/` para asegurar cumplimiento estricto con los esquemas canónicos K3 y K4a, garantizando cero offenders en `k6a-canonical-contracts` [REQ-contract-lint-018]

## Phase 6: Invariantes y Suite E2E de Composición Canónica K3 -> K4a -> K6a -> K3

- [x] 6.1 [RED] Actualizar y ampliar `scripts/k6a-e2e-worker-isolation.test.js` con el pipeline E2E completo: generación de `SourceSnapshotId` (K3), compilación de `WorkOrder v2` con dependencias DAG SHA-256 (K4a), validación de `work-order-binding` (K3), aprovisionamiento de workspace con UUID interno, materialización con almacenamiento baseline, ejecución con `WorkerTransport` y contención fail-closed, generación de diff unificado real, ensamblaje de `WorkResult v1`, y validación criptográfica de `work-result-binding` (K3) [REQ-worker-isolation-001, REQ-worker-isolation-002, REQ-worker-isolation-003, REQ-worker-isolation-004, REQ-worker-isolation-005, REQ-worker-isolation-006, REQ-worker-isolation-008]
- [x] 6.2 [GREEN] Implementar y ajustar los harnesses de integración en `scripts/k6a-e2e-worker-isolation.test.js` para que todos los escenarios de composición canónica (ejecución exitosa con diff estándar, cancelación por señal con sincronización de proceso, y rechazo fail-closed de violaciones de symlink) pasen al 100% [REQ-worker-isolation-001, REQ-worker-isolation-002, REQ-worker-isolation-003, REQ-worker-isolation-004, REQ-worker-isolation-005, REQ-worker-isolation-006, REQ-worker-isolation-008]
- [x] 6.3 [REFACTOR] Modularizar los helpers de creación de fixtures temporales, assertions criptográficas y limpieza idempotente de directorios en `scripts/k6a-e2e-worker-isolation.test.js` [REQ-worker-isolation-001, REQ-worker-isolation-005]

## Phase 7: Verificación Integral y Regresión del Kernel

- [x] 7.1 [x] Ejecutar la suite unitaria de aislamiento (`scripts/lib/worker-workspace.test.js`, `scripts/lib/worker-executor.test.js`, `scripts/lib/allowed-paths-validator.test.js`, `scripts/lib/host-contract/index.test.js`) y verificar 100% de tests pasando [REQ-worker-isolation-001, REQ-worker-isolation-002, REQ-worker-isolation-003, REQ-worker-isolation-004, REQ-worker-isolation-005, REQ-worker-isolation-006, REQ-worker-isolation-008]
- [x] 7.2 [x] Ejecutar los checkers canónicos y suite de contract-lint (`scripts/lib/contract-checkers/k6a-canonical-contracts.test.js`, `scripts/lib/contract-checkers/k6a-checkers.test.js`) confirmando cero offenders [REQ-contract-lint-018]
- [x] 7.3 [x] Ejecutar la suite E2E completa (`scripts/k6a-e2e-worker-isolation.test.js`) validando la composición canónica K3 -> K4a -> K6a -> K3 [REQ-worker-isolation-001, REQ-worker-isolation-002, REQ-worker-isolation-005]
- [x] 7.4 [x] Ejecutar la suite de regresión completa del kernel (`npm test`) garantizando cero errores en todos los módulos [REQ-worker-isolation-001, REQ-worker-isolation-002, REQ-worker-isolation-003, REQ-worker-isolation-004, REQ-worker-isolation-005, REQ-worker-isolation-006, REQ-worker-isolation-008, REQ-contract-lint-018]
