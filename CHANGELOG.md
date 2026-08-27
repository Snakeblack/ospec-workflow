# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.49.0] - 2026-08-27

### Added
- **Briefing funcional de intención (`orchestrator-intent-briefing`)**:
  - `/sdd-new`, `/sdd-ff` y `/sdd-lite` (y equivalentes en lenguaje natural) presentan un resumen funcional de 2–4 líneas antes de clasificar, tanto si la petición es vaga como si es concreta.
  - Hasta 2 correcciones; después solo se puede confirmar la última síntesis o abortar. Mientras espera no crea `openspec/changes/{name}/`.
  - Al aceptar, persiste `gate: intent-briefing` (`synthesis`, `scope`) en `state.yaml` y después clasifica. Al abortar, cero artefactos y no hay clasificación.
  - `/sdd-continue`, fases posteriores con briefing ya aceptado y el trabajo cosmético del Ambient Gate no reabren el gate.
  - Corpus de evals 7→9 (`specific-request-no-artifact`, `continue-no-rebrief`) y goldens de configure regenerados.
  - K10 sigue pendiente para generalizar `clarify-intent` como receta de grafo. Follow-up 4R: landmarks de aborto independiente y de síntesis fresca.
  - Ciclo SDD completo (ruta standard, size:exception, 4R approved). Verify: 41/41, `npm test` 2677 pass. Archivado en `openspec/changes/archive/2026-08-27-orchestrator-intent-briefing/`.

## [2.48.3] - 2026-08-26

### Fixed
- **Cierre de invariantes K4b (`k4b-mode-only-and-baseline-projection`)**:
  - **Mode-only fail-closed**: un diff solo-modo sobre un path ausente aborta con `MALFORMED_UNIFIED_DIFF`; si el `old mode` no coincide con el de la base autorizada (default `100644`) aborta con `INVALID_FILE_MODE`. No se congela Candidate ni se materializan archivos fantasma.
  - **Baseline graph-bound**: el orchestrator ya no rellena `baseline.executionGraph` con el Graph shadow. Una baseline no canónica y sin artefactos propios produce `INVALID_COMPARISON_PROJECTION` en telemetría; la orquestación sigue `ok: true` (REQ-006). El E2E usa una proyección canónica de siete dimensiones.
  - Ciclo SDD completo (ruta bugfix, 4R approved, 0 hallazgos). Verify: 49/49 focales y `npm test` en verde. Archivado en `openspec/changes/archive/2026-08-26-k4b-mode-only-and-baseline-projection/`.

## [2.48.2] - 2026-08-26

### Fixed
- **Invariantes de integración K4b (`k4b-integration-invariants-remediation`)**:
  - **Patches malformados fail-closed**: un `WorkResult.patch` no vacío que no parsea, create/delete solo-cabecera o `@@` inválido aborta con `MALFORMED_UNIFIED_DIFF` y no congela Candidate; los diffs solo-modo siguen siendo válidos.
  - **Cápsula mínima Option A**: `WorkOrder` v2 exige `capsule_inputs` concretos; K4a los emite (inventario opcional ligado a `source_snapshot_id`); K6a materializa `EffectiveShadowBase ∩ capsule_inputs`, no el árbol derivado completo.
  - **Conflictos DAG**: `detectPredecessorContextConflicts` solo rechaza predecesores incomparables; el refinamiento secuencial sobre el mismo contexto lo valida el apply estricto.
  - **Store 1:N**: `repair-shadow-execution/v1` se indexa por fingerprint interno; un Candidate admite varias ejecuciones; `CandidateId` queda como índice secundario, no como quinta identidad.
  - **Comparador canónico**: la proyección del ExecutionGraph entrega las siete dimensiones con `steps = node_id` topológico.
  - Ciclo SDD completo (ruta standard, high-risk, 4R approved). Verify: 2667 pass, 0 fail. Archivado en `openspec/changes/archive/2026-08-26-k4b-integration-invariants-remediation/`.

## [2.48.1] - 2026-08-26

### Fixed
- **Remediación de corrección K4b (`k4b-correctness-remediation`)**:
  - **Despacho exclusivo vía K6a**: `orchestrateRepairShadow` llama `executeWorkOrder({ workOrder, workspace, ... })` con firma de objeto; `executorFn` queda fuera de la API productiva; `executorOptionsByNode` solo admite `commands`, `command`, `args`, `signal` y `declaredTargets`.
  - **Propagación material de dependencias**: N2 consume el árbol integrado de N1 mediante `EffectiveShadowBase` derivada y workspace fresco por nodo; el freeze de Candidate sigue anclado al `SourceSnapshot` original.
  - **Integrador fail-closed**: hunks validan contexto, borrado, counts y solapes; containment usa `WorkOrder.allowed_paths` del productor; los cambios de mode entran en Candidate v2.
  - **Comparador de siete dimensiones**: steps, dependencies, diffs, inventory, obligations, invariants y execution metrics se evalúan siempre; vacíos no se omiten; métricas estables frente al reloj.
  - **Registro auditable `repair-shadow-execution/v1`**: persistencia obligatoria sobre `filesystem-store` con bindings Candidate ↔ Graph ↔ PolicySnapshot; sin store no hay promoción.
  - **E2E real K4a → K4b → K6a → K3**: N1 añade `multiply()` y N2 lo importa y ejecuta (`multiply_ok=6`) con WorkerTransport y WorkerIsolation controlados.
  - **Cierre de iniciativa**: K4b pasa a `done`; K6b queda `next-eligible`. Archivado en `openspec/changes/archive/2026-08-25-k4b-correctness-remediation/`.

## [2.48.0] - 2026-08-25

### Added
- **Orquestación de Repair Shadow K4b (`k4b-repair-shadow-execution`)**:
  - **Orquestador Repair Shadow (`scripts/lib/repair-shadow/orchestrator.js`)**: Consumo del `ExecutionGraph` compilado por K4a (`compileExecutionGraph`), validación de vinculación con `SourceSnapshot` y despacho determinista de `WorkOrder` v2 en orden topológico.
  - **Despacho Exclusivo y Workspaces Efímeros vía K6a**: Ejecución aislada nodo a nodo mediante `createWorkspace`, `materializeSourceSnapshot`, `executeWorkOrder`, `captureWorkResult` y `disposeWorkspace`, exigiendo `isolationReported: "enforced"` sin fallbacks locales no confinados.
  - **Integración Determinista de Parches y Freeze de Candidate v2 (`patch-integrator.js`)**: Aplicación de unified diffs sobre la base autorizada con contención estricta de `allowed_paths`, cálculo del árbol candidato y congelación exclusiva de `CandidateId` mediante `freezeCandidate` de K3.
  - **Cadena Criptográfica de 4 Identidades E2E**: Verificación estricta de proveniencia `SourceSnapshotId` → `WorkOrderId` → `WorkResultId` → `CandidateId` con validación y recomputación fail-closed.
  - **Comparador Shadow Pasivo vs Baseline Fixed (`shadow-comparator.js`)**: Evaluación dimensional (steps, diffs, obligaciones, invariantes, inventario) y telemetría estructurada sin mutar el flujo activo, branches ni defaults de producción.
  - **Frontera Arquitectónica Unidireccional K4b → K6a**: Consumo de primitivas K6a con verificación estática de cero referencias o acoplamiento inverso hacia Repair en K6a.
  - **Especificación y ADRs Normativos**: Publicada capacidad `repair-shadow-orchestration` en `openspec/specs/` y promovidos ADRs 20260825-006 a 20260825-009 en `docs/adr/`.

## [2.47.2] - 2026-08-25

### Fixed
- **Endurecimiento de la frontera de aislamiento K6a (`k6a-isolation-frontier-hardening`)**:
  - Política de sandbox inmutable: el preload congela `{workspaceRoot, allowedPaths}` y `confineChildEnv` reconstruye `OSPEC_SANDBOX_*` y `NODE_OPTIONS` desde ese snapshot, no desde `process.env` vivo.
  - Wrap exhaustivo de APIs mutantes de filesystem en Node 22 (`mkdtemp*`, `chmod*`/`chown*`/`utimes*`/`lutimes*`, fd y `FileHandle`) con fail-closed fuera de `allowed_paths`.
  - WorkerIsolation ligada a la identidad viva del `WorkerTransport` que ejecuta (`port_id` + fingerprint SHA-256); el probe de contención son tres escrituras reales (PASS / BLOCKED / BLOCKED) y `{blocked:true}` vacuo no autoriza `enforced`.
  - Comandos fail-closed salvo `isolationReported=enforced` (REQ-008 alineado al runtime); K4b y jail de OS siguen fuera de alcance.
  - Interceptación de `worker_threads.Worker` en el preload: `execArgv: []` no puede soltar `--require`; `SHARE_ENV` falla cerrado.
  - Escrituras permitidas bajo alias de `tmpdir` (p. ej. `/var` → `/private/var` en macOS) se juzgan por `realpath`, no por `path.relative` de la forma no canónica.
  - Ciclo SDD completo (ruta standard, high-risk, 4R approved, finding `F-a93a0811da865770` resuelto). Verificación: PASS (35/35 MUST). Tras la corrección 4R, `node --test scripts/lib/worker-sandbox.test.js` 20/20.

## [2.47.1] - 2026-08-25

### Fixed
- **Cierre de escapes de proceso en el sandbox K6a**:
  - La confianza en Node se liga al `realpath(process.execPath)` autorizado; ejecutables arbitrarios llamados `node` o `node.exe` se rechazan fail-closed.
  - `spawn`, `spawnSync`, `execFile`, `execFileSync` y `fork` reconstruyen el entorno de cada Node hijo y fuerzan el preload y las variables de contención, aunque el caller pase `env: {}` o intente vaciarlas.
  - Tests adversariales verifican ambos bypasses, variantes sync/async de entorno y `fork`, además de conservar el alias legítimo del runtime.

## [2.47.0] - 2026-08-25

### Added
- **Contrato verificable de `sdd-document` (P1–P7, `harden-sdd-document-contract`)**:
  - **Canonicidad y cobertura en el plan**: Step 5b exige mapa `canonical for` y propuestas de cobertura en update mode antes de editar páginas existentes.
  - **Re-descubrimiento y hechos volátiles**: Update Mode re-escanea el repo actual y re-verifica contadores, umbrales y versiones en cada run; el no-op solo refresca `updatedAt`/`gitHead` en `.last-update.json`.
  - **Checklist medible (Step 6.4) y pase factual (Step 6.5)**: umbrales de densidad, grafo de enlaces, heurística Mermaid y contraste de cifras/identificadores citados; el generador no auto-certifica calidad de contenido.
  - **Metadatos completos (Step 6.6)**: `sections` lista todas las páginas; `filesSkipped` pasa a `{file, reason}[]`.
  - **QA J6 orchestrator-owned**: `route-document.md` §7 registra `gates.content-qa` y detiene el cierre ante hallazgos confirmados (re-dispatch por defecto). Tests L1 de contrato y oráculos L2 in-test; eval golden conductual de J6 queda como deuda documentada.

## [2.46.9] - 2026-08-24

### Fixed
- **Blindaje de Frontera Genérica de Proceso, Restricción de Subprocesos y Contención de Symlinks (K6a / REQ-008)**:
  - **Rechazo Fail-Closed de Binarios No-Node sin Sandbox**: `executeSandboxedCommand` rechaza de forma determinista cualquier comando no-Node (`/bin/sh`, `cmd.exe`, `python`, etc.) cuando no cuenta con sandbox nativo verificado, evitando la ejecución de subprocesos no confinados en el host.
  - **Restricción de `child_process` en Procesos Node Sandboxed**: `worker-sandbox-preload.js` intercepta llamadas de creación de subprocesos (`spawn`, `spawnSync`, `exec`, `execSync`, `execFile`, `execFileSync`), bloqueando intentos de invocar shells o binarios arbitrarios con `EACCES: permission denied by worker sandbox`.
  - **Blindaje Estricto de `assertWriteAllowed` y Symlinks**: Validación con `isOutsideNorm || isOutsideReal`, resolución ascendente de ancestros mediante `realpath` para detectar enlaces simbólicos externos antes de cualquier escritura e intercepción de `fs.symlink` / `promises.symlink` impidiendo la creación de enlaces con destino fuera de la raíz del workspace.
  - **Tests Adversariales E2E Completos**: Verificación física de los 3 vectores de contención (ejecución no-Node fail-closed, bloqueo de escape vía `child_process` a shell y bloqueo de escrituras a través de enlaces simbólicos externos).

## [2.46.8] - 2026-08-24

### Fixed
- **Aislamiento Físico y Acoplamiento Real de WorkerTransport al Sandbox de WorkerIsolation (K6a / REQ-008)**:
  - **Sandbox Interceptor en Tiempo de Ejecución**: Implementado `scripts/lib/worker-sandbox-preload.js` y `scripts/lib/worker-sandbox.js` para interceptar llamadas mutantes de filesystem (`writeFileSync`, `mkdirSync`, `openSync`, `promises.*`, etc.) e impedir físicamente cualquier escritura fuera de `allowed_paths` o de la raíz del workspace, lanzando `EACCES: permission denied by worker sandbox` antes de que el archivo toque el disco del host.
  - **Resolución Canónica con Realpath y Compatibilidad con macOS**: Soportada la resolución canónica de rutas mediante `fs.realpathSync` tanto en el workspace root como en los paths objetivo para compatibilidad total con enlaces simbólicos (`/var` -> `/private/var`) en macOS, Linux y Windows.
  - **Acoplamiento Físico de Transports y Primitivas en el Adapter**: `WorkerTransport` y `WorkerIsolation` en `scripts/lib/host-adapters/claude.js` quedan unificados y gobernados por la misma frontera física de ejecución sandbox (`makeSandboxedWorkerPrimitive`).
  - **Inyección de `sandbox_context` en Invocación de Transporte**: `executeWorkOrder` propaga `workspace_root`, `allowed_paths` y `sandbox_context` en la llamada a `WorkerTransport`.
  - **Separación Canónica de Capabilities y Probe Observado**: `WorkerTransport` y `WorkerIsolation` se evalúan independientemente en capability-proof/v1 sin mutar schemas, exigiendo prueba de contención observada por el host (`allowed_write: "PASS"`, `undeclared_workspace_write: "BLOCKED"`, `external_root_write: "BLOCKED"`).
  - **Tests Adversariales E2E Obligatorios**: Verificación física de que intentos de escritura fuera del workspace (`/tmp/...`) o en rutas no declaradas son prevenidos y los archivos nunca llegan a existir en el filesystem del host.

## [2.46.7] - 2026-08-24

### Fixed
- **Aislamiento Físico Riguroso, Enforzamiento Fail-Closed de Subprocesos y Probes de Contención K6a**:
  - **Eliminación Total de Subprocesos Arbitrarios sin Aislamiento**: `executeWorkOrder` rechaza de forma fail-closed (`reason: "subprocess-requires-enforced-isolation"`) cualquier intento de ejecutar comandos o subprocesos externos si el aislamiento no está demostrado y verificado como `enforced`, incluso en órdenes de trabajo etiquetadas como solo lectura (`verify`, `probe`, `read_only`), cerrando cualquier ruta de escape fuera del workspace en entornos no confinados. Las operaciones internas puras del runtime se evalúan en memoria sin subprocesos y reportan honestamente su estado `unavailable`.
  - **Probe Real de Contención en CapabilityProof**: La promoción a `isolationCapability: "enforced"` requiere la demostración empírica de contención física en el probe (`allowed_write: "PASS"`, `undeclared_workspace_write: "BLOCKED"`, `external_root_write: "BLOCKED"`), rechazando con `reason: "containment-probe-unfulfilled"` cualquier transporte o prueba que carezca de estas garantías de sandbox.
  - **Validación Estricta y Verificación Upfront de CLI en Tests**: Corregido el chequeo de disponibilidad de herramientas externas (`git --version`) antes de la ejecución de pruebas de parches y diffs, garantizando que fallos en la aplicación de diffs (`git apply --check` y `git apply`) lancen aserciones fallidas en lugar de ser silenciados o enmascarados como skips.
  - **Reconciliación Histórica de Versiones de Roadmap y Arquitectura**: Reconciliadas las versiones canónicas de entrega en `docs/architecture/harness-evolution.md` alineándolas con el roadmap operativo (K3 en v2.42.3, K4a en v2.45.7, K5 en v2.45.13 y K6a en v2.46.7).

## [2.46.6] - 2026-08-24

### Fixed
- **Cierre Terminal de Aislamiento de Workers, Contención Estructural de Mutaciones y Formato Git Apply K6a**:
  - **Contención Estricta de Mutaciones por Clasificación Estructural**: Sustituida la comprobación superficial de strings (`operation === "apply"`) por clasificación estructural completa basada en `ownership.mode === "exclusive"`, `effect_class === "workspace_mutation"|"irreversible"`, o verbos mutantes (`apply|mutate|build|generate|install|compile`), protegiendo órdenes canónicas como `apply_implementation` de K4a y forzando rechazo fail-closed (`mutation-requires-enforced-isolation`) en fallbacks sin transporte con aislamiento `enforced` verificado. Eliminado `allowUnsafeFallbackMutation`.
  - **Pre-validación Rigurosa de WorkOrder v2 con Schema y Hash Canónico**: `executeWorkOrder` valida de forma estricta las órdenes contra el esquema JSON Schema Draft 2020-12 `work-order/v2`, verifica la coincidencia exacta entre el `work_order_id` declarado y el recomputado mediante `computeWorkOrderId`, y rechaza sin excepción listas de `allowed_paths` vacías (`missing-allowed-paths`).
  - **Formato de Diff Git Real y Aplicable (`git apply` compliant)**: `generateUnifiedDiff` emite cabeceras Git conformes (`diff --git a/{p} b/{p}\nold mode ...\nnew mode ...`), omitiendo hunks vacíos en cambios de solo modo y produciendo diffs válidos verificados directamente mediante `git apply --check` y `git apply`.
  - **Encapsulación y Transiciones de Estado en Registro Privado**: Reemplazado el setter genérico público `updateWorkspaceStatus` por la primitiva restringida `markWorkspaceInterrupted(workspaceId, reason)`, validando la máquina de estados (`active` -> `interrupted`) y blindando el registro privado frente a mutaciones externas arbitrarias.
  - **Triangulación Zero-Trust y Manejo Conforme de Symlinks en Tests**: Corregido el test zero-trust en `worker-workspace.test.js` calculando hashes SHA-256 por archivo con triangulación positiva y negativa; los tests de symlink reportan `t.skip` en entornos sin privilegios de creación de enlaces.
  - **Suite E2E Adversarial y Verificación Canónica K3 -> K4a -> K6a -> K3**: Pipeline E2E en `scripts/k6a-e2e-worker-isolation.test.js` ejecutando órdenes de trabajo mutantes sobre `WorkerTransport` con `CapabilityProof` válido, verificando la aplicación real de patches con `git apply --check` y `git apply` en repositorio temporal, y validando contención ante intentos de escape fuera de `allowed_paths` y ejecuciones mutantes no aisladas.

## [2.46.5] - 2026-08-24

### Fixed
- **Hardening Integral de Aislamiento de Workers, Zero-Trust Criptográfico y Preservación de Telemetría K6a**:
  - **Zero-Trust Criptográfico en Merkle Tree**: `computeTreeDigest` exige contenido de bytes real para cada archivo en colecciones tipo Array, eliminando la aceptación ciega de hashes declarados sin bytes; `materializeSourceSnapshot` hidrata y valida siempre los bytes candidatos (`candidateFiles`) contra `base_tree_digest` y comprueba que los hashes declarados en `filesSource` coincidan byte a byte.
  - **Transición Autoritativa en el Registro Privado**: Añadida y exportada la primitiva `updateWorkspaceStatus` en `worker-workspace.js`, sincronizando el estado real del registro privado `workspaceRegistry` en recuperaciones e interrupciones (`recoverInterruptedExecution` y handlers de cuota/abort/timeout en `executeWorkOrder` marcan `descriptor.status = "interrupted"`).
  - **Preservación Íntegra de Telemetría en WorkerTransport**: `classifyTransportFailure` en `host-contract/index.js` y `executeWorkOrder` capturan y preservan `exit_code`, `stderr`, `stdout`, `error`, `message` y `reason` ante fallos (`ok: false`) del transporte.
  - **Contención de Subprocesos y Aislamiento en Mutaciones**: Restringida la ejecución de órdenes de trabajo mutantes (`operation: "apply"`) en fallback exclusivamente a transportes con aislamiento verificado `enforced`, garantizando frontera fail-closed ante escrituras no contenidas.
  - **Inspección de Workspace Fail-Closed y Blindaje de Symlinks**: `inspectWorkspace` utiliza `lstatSync` y `checkSymlinkEscape` antes de seguir symlinks, fallando cerrado ante symlinks con escape fuera de la raíz de trabajo, enlaces rotos o archivos ilegibles.
  - **Reconciliación Documental**: Actualizado `docs/architecture/harness-evolution.md` reflejando la entrega y conformidad estricta de las primitivas de aislamiento K6a.

## [2.46.4] - 2026-08-24

### Fixed
- **Remediación de Fronteras Criptográficas, Contratos y Runtime K6a (`k6a-runtime-boundary-remediation`)**:
  - **Vinculación Tripartita Estricta (3-Way Binding)**: `materializeSourceSnapshot` y `executeWorkOrder` exigen igualdad criptográfica entre `workspace.source_snapshot_id`, `workOrder.source_snapshot_id` y `sourceSnapshot.source_snapshot_id`, abortando fail-closed antes de la creación física de archivos o ejecución de comandos si hay discrepancias de procedencia.
  - **Merkle Tree Digest Byte-Exact y Zero-Trust**: `computeTreeDigest` calcula hashes SHA-256 directamente sobre los buffers binarios crudos sin normalización CRLF/LF ni decodificaciones intermedias, asegurando digests Merkle distintos para saltos de línea diferentes y recalculando siempre los bytes reales ante hashes declarados.
  - **Barrera de Asentamiento Asíncrona (Settlement Barrier)**: `invokeTransportAsync` aguarda asíncronamente la finalización de cancelación/terminación del worker (`port.cancel()`, `port.terminate()`, `port.abort()`) antes de retornar o rechazar ante timeout/abort, eliminando condiciones de carrera y escrituras huérfanas.
  - **Cabeceras Git Mode en Diff Unificado**: `generateUnifiedDiff` emite cabeceras de permisos estándar tipo git (`old mode 100644\nnew mode 100755`) tanto para modificaciones de chmod puro como para cambios combinados de permisos y contenido.
  - **Conformidad Estricta de Esquema WorkOrder v2**: Eliminado el campo no estándar `strict_isolation` del payload `work-order/v2` (preservando `additionalProperties: false`), gestionando el aislamiento estricto vía opciones de ejecución (`options.strictIsolation`).
  - **Autoridad Exclusiva del Registry en Inspección y Recuperación**: `inspectWorkspace` y `recoverInterruptedExecution` resuelven la ruta de trabajo exclusivamente desde el `workspaceRegistry` privado, ignorando descriptores no registrados o con rutas suplantadas.
  - **Pipeline Canónico E2E K3 -> K4a -> K6a -> K3**: Reescrita la suite de integración en `scripts/k6a-e2e-worker-isolation.test.js` utilizando compiladores reales de K4a (`compileExecutionGraph`, `compileWorkOrdersV2`) y validadores de ligadura (`validateWorkOrderBinding`).
  - **Especificación OpenSpec**: Añadidos requisitos `REQ-worker-isolation-009` (3-Way Cryptographic Binding and Byte-Exact Merkle Tree Digest) y `REQ-worker-isolation-010` (Transport Capability Binding, Async Settlement Barrier, and Git Mode Diffing) en `openspec/specs/worker-isolation/spec.md`.

## [2.46.3] - 2026-08-24

### Fixed
- **Cierre Integral de Fronteras y Autoridad de Runtime K6a (`k6a-runtime-boundary-closure`)**:
  - **Autoridad Física Estricta de Workspace**: `executeWorkOrder` resuelve `root_path`, `baselineInventory` y metadata exclusivamente desde `workspaceRegistry.get(workspace_id)` (`record.rootPath`), rechazando de forma fail-closed (`reason: "workspace-not-registered"`) cualquier descriptor externo no registrado o con ruta suplantada.
  - **Ligadura Criptográfica de Bytes Materializados**: `materializeSourceSnapshot` valida criptográficamente los bytes en memoria contra `base_tree_digest` mediante Merkle tree SHA-256 (`computeTreeDigest`) antes de escribir en disco, evitando discrepancias de procedencia entre `SourceSnapshot` y contenido físico.
  - **Vinculación Estricta `CapabilityProof` ↔ `WorkerTransport`**: `isolationReported = "enforced"` exige obligatoriamente que `workerTransport` provisto coincida de forma exacta con `adapter_id` y `probe_digest` verificados en el `CapabilityProof`.
  - **Cancelación Activa e In-flight Termination**: `invokeTransportAsync` pasa `{ input, signal, deadlineMs }` y ejecuta cancelación activa (`port.cancel()` / `port.terminate()`) ante timeout/abort para detener físicamente los procesos worker en ejecución.
  - **Contención Fail-Closed en Fallback**: Comandos con efectos que requieran aislamiento estricto (`strict_isolation: true`) sin `WorkerTransport` verificado fallan cerrado (`reason: "strict-isolation-unfulfilled"`).
  - **Detección de Cambios de Modo (`mode`) en `computeMutationDelta`**: Detección de alteraciones de permisos en archivos (`baseline.mode !== post.mode`) incluyéndolos en `modified` aun cuando el hash SHA-256 permanezca idéntico.
  - **Diffing Exacto con Preservación de EOF y Reversibilidad de Árbol**: `generateUnifiedDiff` implementa `analyzeLines` con emisión de marcadores estándar `\ No newline at end of file` y garantiza la reconstrucción del árbol idéntica byte a byte.
  - **Auditoría Estática Recursiva REQ-contract-lint-018**: `k6a-canonical-contracts` escanea recursivamente todos los archivos JS y tests bajo `scripts/` detectando accesos no canónicos a `.files` o dependencias no SHA-256.
  - **Suite E2E de Composición Canónica Real K3 -> K4a -> K6a -> K3**: Pipeline integral en `scripts/k6a-e2e-worker-isolation.test.js` importando y ejecutando `computeSourceSnapshotId`, `compileExecutionGraph`, `compileWorkOrdersV2`, `validateWorkOrderBinding`, `materializeSourceSnapshot`, `executeWorkOrder`, `apply patch` y `validateWorkResultBinding`.
  - **Promoción de ADRs**: Formalizados y promovidos `adr-20260823-018` a `023` en `docs/adr/`.

## [2.46.2] - 2026-08-23

### Fixed
- **Cierre de Fronteras y Contención de Runtime K6a (`k6a-runtime-boundary-closure`)**:
  - **Generación de Diff Unificado Real y Aplicable**: `generateUnifiedDiff` implementa comparación línea por línea contra `baselineContents` (almacenado durante `materializeSourceSnapshot`), emitiendo hunks estándar `--- a/` / `+++ b/` y `@@ -l,s +l,s @@` con contexto real y eliminando placeholders sintéticos `-old` / `-deleted`.
  - **Enforcement Estricto de WorkerTransport**: `isolationReported = "enforced"` requiere obligatoriamente que `effective_state === "enforced"` y que exista un `WorkerTransport` verificado activo provisto. Si falta transporte acoplado, la ejecución falla cerrada (`ok: false`) o se degrada explícitamente a `unavailable`/`partial` en spawn local, impidiendo reportes falsos de aislamiento.
  - **Firma Canónica y Telemetría de HostTransport**: Corregida la invocación `invokeTransportAsync(workerTransport, { signal, deadlineMs, input })` con paso adecuado de timeout y cancelación. `normalizeTransportOutcome` preserva y expone `stdout`, `stderr` y `exit_code`.
  - **Encapsulación Autorizada de Workspaces**: `createWorkspace` autogenera exclusivamente `workspace_id` mediante UUIDs internos (`ws-${crypto.randomUUID()}`), descartando identificadores del invocador que permitan directory traversal. `getWorkspaceRecord` retorna copias defensivas inmutables y `materializeSourceSnapshot` falla cerrado ante workspaces no registrados (sin fallback a `descriptor.root_path`).
  - **Sincronización de Procesos y Eliminación de Races**: En cancelaciones o timeouts en spawn local, el runtime espera la resolución obligatoria del evento `'close'` del proceso hijo antes de invocar `recoverInterruptedExecution`, garantizando que no existan escrituras concurrentes residuales.
  - **Validación de Symlinks Fail-Closed**: `checkSymlinkEscape` retorna `isEscape: true` ante cualquier excepción o fallo en `fs.realpathSync` / `fs.lstatSync`, cerrando ramas fail-open en la contención de filesystem.
  - **Reconciliación REQ-contract-lint-018**: Eliminados fallbacks legacy `.files` en el runtime y ampliado el checker `k6a-canonical-contracts` para auditar fixtures e invocaciones JS que asuman contratos no canónicos.
  - **Suite E2E de Composición Canónica K3 -> K4a -> K6a -> K3**: Verificado el ciclo completo con derivación criptográfica de `computeSourceSnapshotId`, compilación vía `compileExecutionGraph`/`compileWorkOrdersV2`, validación de `validateWorkOrderBinding` y vinculación estricta de `validateWorkResultBinding`.
  - **Promoción de ADRs**: Formalizados y promovidos `adr-20260823-012` a `017` en `docs/adr/`.

## [2.46.1] - 2026-08-23

### Fixed
- **Integración Canónica de Contratos y Runtime K6a (`k6a-contract-runtime-integration-remediation`)**:
  - **Contratos Canónicos K3/K4a y Snapshot**: Desacopladas las dependencias DAG SHA-256 (`WorkOrderId`) de los inputs de filesystem de la cápsula (`capsule_inputs: string[]`). `materializeSourceSnapshot` consume `SourceSnapshot v1` canónico (sin propiedad sintética `.files`) y falla cerrado ante dependencias faltantes.
  - **Identidad Criptográfica de WorkResult**: `captureWorkResult` emite estrictamente `work-result/v1` canónico delegando el cálculo de `work_result_id` en `computeWorkResultId` de `execution-identities`, enlazando `execution_usage` como metadatos/evidencia externa.
  - **Integración Real con WorkerTransport (K2a)**: `executeWorkOrder` opera de forma asíncrona mediante `invokeTransportAsync`, comprueba `CapabilityProof` con `resolveCapabilityState` (con degradación segura a `partial`/`unavailable`), y respeta `AbortSignal` y presupuestos de tiempo de K5 (`wall_time_minutes`, `commands`).
  - **Contención de Filesystem y Symlinks**: Validación preventiva de symlinks en jerarquías intermedias no instanciadas y evaluación estricta de `allowed_paths` sobre el mutation delta (`created`, `modified`, `deleted`) respecto al `baselineInventory`.
  - **Registro Privado de Workspaces**: Ciclo de vida gestionado internamente (`workspace_id -> internal descriptor`), impidiendo ejecuciones destructivas sobre rutas suministradas por el llamador en `disposeWorkspace`.
  - **Generación de Parche Unified Diff Real**: Generación de un diff aplicable con contenido antes y después, con verificación de reconstrucción de árbol de filesystem.
  - **Promoción de ADRs**: Formalizados y promovidos `adr-20260823-007` a `011` en `docs/adr/`.

## [2.46.0] - 2026-08-23

### Added
- **Worker Isolation y Work-Order Capsule K6a (`k6a-worker-isolation`)**:
  - **Primitivas de Ejecución en Aislamiento**: Implementadas las funciones `createWorkspace`, `materializeSourceSnapshot`, `executeWorkOrder`, `captureWorkResult`, `validateAllowedPaths`, `recoverInterruptedExecution` y `disposeWorkspace` en `scripts/lib/`.
  - **Contención Estricta de Filesystem (`allowed_paths`)**: Validador dual-phase (pre-flight y post-flight) fail-closed contra traversals (`../`), caracteres nulos y escapes por symlinks (`allowed-paths-validator.js`).
  - **Cápsula Determinista y Snapshot**: Proyección exacta de dependencias declaradas con huella SHA-256 determinista libre de artefactos ajenos (`worker-workspace.js`).
  - **Frontera de Identidad K3**: El worker opera sobre `SourceSnapshot`, recibe `WorkOrder` y emite `WorkResult` con enlace criptográfico sin generar ni asumir `CandidateId`. APIs públicas desacopladas de Repair y compilación de grafos.
  - **Esquemas JSON de Kernel y Fixtures**: Registradas 4 nuevas familias en `schemas/kernel/` (`workspace-descriptor`, `capsule-definition`, `work-result-execution-payload` y `containment-violation`) con fixtures positivos y negativos de no-aliasing con Candidate.
  - **Checkers de Contract-Lint**: Implementados `k6a-candidate-prohibition.js` y `k6a-capsule-path-containment.js` registrados en `contract-lint.js`.
  - **Invariantes de Modelo de Ciclo de Vida**: Agregados 6 invariantes ejecutables para K6a en `lifecycle-model.js`.
  - **Integración con WorkerTransport de K2a y Fallback**: Ejecución segura vía transporte de host con degradación explícita ante capacidades de aislamiento `partial` o `unavailable`.
  - **Promoción de ADRs**: Formalizados y promovidos `adr-20260823-003` a `006` en `docs/adr/`.

## [2.45.16] - 2026-08-23

### Fixed
- **Fallback configurable de tiers (`internal/modelconfig/models_test.go`)**: Alineada la expectativa de la prueba Go para agentes no declarados con `_default: premium` de `models.yaml`, manteniendo la validación cerrada ante rutas o configuraciones inválidas. Este hotfix sucede a `v2.45.15`, cuyo workflow `Build ospec-hooks` falló en macOS, Ubuntu y Windows por la expectativa obsoleta; validación: `go test ./...`, `npm test` y sincronización de manifiestos.

## [2.45.15] - 2026-08-23

### Fixed
- **Integridad de contabilidad de uso K5 (`k5-usage-accounting-integrity`)**: Corregida la aplicación exactamente una vez de `ExecutionUsage` en éxitos, fallos y reintentos CAS. El runtime conserva el carry-over entre recreaciones sin volver a debitar efectos fallidos ya reconciliados, trata los resultados `undefined`/`null` del executor de forma cerrada y mantiene el estado `completed` del journal como absorbente durante merges concurrentes.
- **Semántica de zero-delta y reconciliación durable**: Las reparaciones sin progreso efectivo conservan la penalización dual de zero-delta; la reconciliación distingue consumo físico nuevo de resultados históricos para evitar duplicación o pérdida presupuestaria.

### Changed
- **Trazabilidad SDD y remediación 4R**: Archivados proposal, specs, diseño, tareas, evidencia de apply/verify, decisiones arquitectónicas y linajes inmutables. El gate 4R completo cerró sus tres hallazgos críticos mediante slices acotados y validación dirigida; los advisories aceptados permanecen registrados como deuda no bloqueante.

- **Evidencia Strict TDD**: 37/37 escenarios contractuales y 167/167 pruebas focales superadas. La suite completa finalizó con 2408/2410 pruebas superadas y 2 omisiones esperadas por entorno, sin fallos.

## [2.45.14] - 2026-08-22

### Fixed
- **Política de modelos configurable (`models.yaml`)**: Eliminadas de `scripts/lib/model-resolver.js` las restricciones duplicadas que fijaban los reviewers y `_default` al tier `default`, además de los modelos y `model_reasoning_effort` de Codex. Las asignaciones, modelos, esfuerzo y verbosidad se leen ahora exclusivamente desde `models.yaml`; se conservan las guardas estructurales del roster SDD, tiers conocidos y agentes válidos. Las pruebas contractuales, de generación y telemetría derivan sus expectativas de la configuración viva. Verificación: `npm run setup:codex` con 0 errores y 0 warnings; suite completa `npm test` superada.

## [2.45.13] - 2026-08-22

### Fixed
- **Blindaje y Hardening de Concurrencia K5 (`k5-concurrency-hardening`)**:
  - **Ownership Autoritativo de ExecutionUsage**: El consumo de presupuestos se extrae exclusivamente de `result.usage` / `result.execution_usage` emitido por el `effectExecutor`, purgando definitivamente `input.consumed` como autoridad del caller (`REQ-execution-budgets-003`).
  - **Particionado de Carry-Over por Sujeto y Nodo**: Acumulador `pendingCarryOver` indexado por `${subjectId}:${nodeId}` aislando cuotas y evitando contaminación presupuestaria entre nodos/workers concurrentes (`REQ-operation-permits-005`).
  - **Journaling Merge-Safe y Preservación de Peer Tickets**: `commitJournal` opera con `upsertJournalEntries` merge-safe por `effect_id` en todos los stores (`AuthorityStore`, `MemoryStore`, `FileSystemStore`), y el commit CAS elimina exclusivamente el ticket ganador (`entry.midOpTickets.delete(winner)`), preservando intactos los tickets de los peers concurrentes (`REQ-authority-store-003`, `REQ-authority-store-011`).
  - **Garantía de Cero Duplicación de Efectos**: Reconciliación contra el journal que retorna `action: "skip"` ante efectos ya completados, verificando exactamente 0 llamadas adicionales al executor en reintentos post-CAS.
  - **Alineación Contractual de Zero-Delta**: Deducción condicionada a `effect-bearing mutation AND effectProgress === false`, eximiendo transiciones de ciclo de vida como `repair` con avance (`REQ-execution-budgets-004`).
  - **Integración Causal en Host Boundary**: Integrado `resolvePrimaryFailure` en `host-boundary.js` normalizando fallos de transporte como `environment_tooling` (`REQ-failure-recovery-002`, `REQ-failure-recovery-003`).
  - **Gobernanza Formal de ADRs**: Promovidos y formalizados `adr-20260822-007` a `012` a `Status: accepted` en `docs/adr/`.

### Added
- **Gate 4R Completo K5**: Pipeline de revisión 4R selectiva (`risk`, `reliability`, `resilience`) completado con 0 hallazgos y verificación de suite al 100% (2401 tests).

## [2.45.12] - 2026-08-22

### Fixed
- **Remediación Técnica Integral del Núcleo K5 (`k5-core-remediation`)**:
  - **Concurrencia CAS Post-Efecto Multi-Writer**: Suite E2E en `scripts/k5-e2e-budgets-recovery.test.js` con carrera real de dos writers ejecutando efectos antes de resolver el CAS, demostrando deterministamente que el writer perdedor retiene su carry-over real y el reintento no duplica efectos ciegamente.
  - **Carry-Over Multidimensional Exhaustivo**: Acumulador en `createKernelRuntime` que preserva el consumo real de todas las dimensiones (`turns`, `commands`, `patches`, `changed_lines`, `wall_time_minutes`, `effect_attempts`) calculadas a partir del delta ejecutado real ante `cas-conflict`.
  - **Semántica Contractual de Zero-Delta**: Deducción restringida exclusivamente a mutaciones effect-bearing de código sin avance semántico (`reduced.outcome === "unchanged"` y 0 archivos/líneas modificadas), eximiendo transiciones de ciclo de vida.
  - **Unificación Determinista de `resolvePrimaryFailure()`**: Resolución idéntica por prioridad causal conectada de forma homogénea en el selector de transiciones, controlled permit issuer y host boundary.
  - **Aislamiento Multi-Writer en Store y Journal**: `midOpTickets` gestionados con `Map` indexado por escritor/revisión en `AuthorityStore` y validación estricta de continuidad del journal para prevenir sobreescrituras destructivas.
  - **Controlled Issuer Estrictamente Autoritativo**: Eliminado el fallback a `input.state`, exigiendo snapshot autoritativo de `AuthorityStore` (fail-closed ante ausencia de store).
  - **Taxonomía Causal Fail-Closed**: Tags no reconocidos en `mapLegacyRoutingTag` resuelven a `validation_gap` (`UNKNOWN_ROUTING_TAG`), prohibiendo transiciones `repair`.
  - **Promoción de ADRs**: Formalizados y promovidos `adr-20260822-001` a `006` en `docs/adr/`.

### Added
- **Gate 4R Exhaustivo K5**: Pipeline de revisión 4R completo (screening generalista → especialistas en `risk`, `reliability` y `resilience`) completado con 0 hallazgos y aprobación limpia.

## [2.45.11] - 2026-08-22

### Fixed
- **Reconciliación del Cierre K5 (`k5-reconciliation`)**:
  - **Mapeo de Tags Legacy Guionados**: `mapLegacyRoutingTag` mapea `code-bug`, `tasks-gap`, `design-gap` y `spec-gap` a los códigos canónicos existentes de la taxonomía causal, eliminando la caída silenciosa al default `UNKNOWN_FAILURE_CODE`; el default se conserva fail-closed para tags desconocidos y está fijado por tests negativos.
  - **E2E CAS Real**: el test de no-inflación presupuestaria en `k5-e2e-budgets-recovery.test.js` ejercita una carrera stale-permit real contra el Authority Store con aserción `deepEqual` de presupuestos; el matcher laxo de `lifecycle-kernel/index.test.js` se estrecha a `stale-permit` tras evidencia empírica de determinismo (200/200 ejecuciones).
- **Docs**:
  - Reconciliados metadatos del change archivado `2026-08-20-k5-authoritative-enforcement-and-cas-remediation` (`archive-planned` → `archived`, conteo de tareas corregido a 31 con nota correctiva).
  - Fila K5 del roadmap general alineada al formato K1–K4a citando las remediaciones v2.45.7→v2.45.10.

### Added
- **Primer Gate 4R Formal de la Familia K5**: `k5-reconciliation` ejecuta el pipeline completo de revisión selectiva (generalista read-only → clasificador determinista targeted `[reliability]` → linaje congelado con candidate ID y budget de corrección → lente única → findings congelados) registrando linaje terminal `approved` en `state.yaml`. Follow-up no bloqueante: e2e de conflicto CAS post-efectos (F-7bb9293b802b7ec1).

## [2.45.10] - 2026-08-21

### Fixed
- **Remediación Integral de Boundary Autoritativo, CAS Terminal y Monotonicidad Concurrente K5 (`k5-authority-boundary-and-cas-concurrency-remediation`)**:
  - **Controlled Issuer Autoritativo**: `issuePermitForSelectedTransition` consulta el `AuthorityStore` (`snapshot`/`state`), valida la vigencia de revisión (`expected_revision`), evalúa el agotamiento presupuestario de nodo y autoridad (`isBudgetExhausted`), y valida fail-closed la matriz causal de transiciones antes de emitir cualquier `OperationPermit` (`REQ-operation-permits-005`).
  - **Consolidación y Commit CAS de Transiciones Terminales**: `runKernelOperation` permite que las operaciones terminales de control (`escalate`, `stop`) superen el preflight de agotamiento presupuestario y consoliden su estado terminal en el `AuthorityStore` vía `compareAndSwap` (`REQ-lifecycle-kernel-runtime-025`, `REQ-lifecycle-kernel-runtime-026`, `REQ-failure-recovery-002`).
  - **Enforcement Causal en Boundary Autoritativo**: `validateOperationTransition` invoca `validateRecoveryTransition` ante operaciones de recuperación sobre nodos en fallo (`failed`/`interrupted`), impidiendo que llamadas directas eludan la matriz causal (`REQ-failure-recovery-002`, `REQ-failure-recovery-003`).
  - **Carry-Over de Presupuestos y Monotonicidad CAS Runtime-Owned**: `createKernelRuntime` retiene las cuotas consumidas por efectos tras un conflicto CAS multi-writer (`pendingCarryOver`) y las deduce automáticamente en el reintento sobre el nuevo head sin requerir inyección manual de `args.consumed`; verificado con carrera concurrente real de 2 writers en `inv-k5-budget-monotonicity` (`REQ-execution-budgets-003`, `REQ-lifecycle-model-conformance-011`).
  - **Semántica Refinada de Zero-Delta**: Acotada la deducción zero-delta exclusivamente a mutaciones effect-bearing reales que no producen avance semántico en el ciclo de vida (`reduced.outcome === "unchanged"`), eximiendo transiciones válidas de control y progreso (`REQ-execution-budgets-004`, `REQ-lifecycle-kernel-runtime-027`).
  - **Promoción Formal de ADRs**: Promovidos `adr-20260820-007` a `011` a `Status: accepted`.

## [2.45.9] - 2026-08-20

### Fixed
- **Remediación Autoritativa de K5 y Consolidación CAS (`k5-authoritative-enforcement-and-cas-remediation`)**:
  - Transiciones Canónicas: `code_defect` emite explícitamente `{ kind: "execute", operation: "repair" }` sin degradar a `recover`; `ambiguous_effect` emite `{ kind: "escalate", operation: "escalate" }` consolidándose como commit terminal en el Authority Store vía CAS.
  - Preflight Exhaustivo de Presupuestos: `isBudgetExhausted()` integrado en preflight de `issueOperationPermit()` y `runKernelOperation()`, denegando permisos y garantizando exactamente 0 llamadas a `effectExecutor` ante cuotas agotadas en 6 dimensiones de nodo y 4 de autoridad.
  - Repair Scope Fail-Closed Obligatorio: `validateRepairScope()` requiere estructura explícita con `node_ids`, `allowed_paths` y `finding_ids` no vacíos; preflight en `runKernelOperation()` rechaza llamadas a `repair` sin `args.scope` con 0 llamadas a efectos y eliminando fallbacks de histórico.
  - Contabilidad Zero-Delta Dual y Evento Durable: Mutaciones de efecto que producen zero-delta decrementan simultáneamente `node.turns` y `authority_budget.effect_attempts`, persistiendo el registro durable `zero-delta-attempt` en el journal antes del commit CAS.
  - Preservación de Presupuesto ante CAS Conflict y Test Concurrente de 2 Writers: Los turnos e intentos consumidos por efectos ejecutados se conservan ante conflictos CAS sin restablecer cuotas al resincronizar contra el nuevo head; verificado en el checker `inv-k5-budget-monotonicity` de `lifecycle-model.js`.

## [2.45.8] - 2026-08-20


### Fixed
- **Endurecimiento de Verificación de Presupuestos Fail-Closed y Monótonos (`k5-runtime-enforcement-and-wiring-remediation`)**:
  - Implementado `isBudgetExhausted(budget, consumed, options)` evaluando exhaustivamente las 6 dimensiones de nodo (`turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines`, `allowed_paths`) y 4 de autoridad (`effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`).
  - Endurecido `validateRepairScope()` para fail-closed estricto ante scopes vacíos, nulos o no coincidentes con `node_ids`, `allowed_paths` y `finding_ids`.
  - Integrado pipeline de validación en `runKernelOperation()`: pre-effect scope validation, captura de métricas post-effect, deducción de cuotas monótona ante zero-delta mutations, validación de honestidad en recuperación con `blockingFingerprint`, y verificación de agotamiento presupuestario pre-CAS.
  - Reimplementados los 7 invariant checkers de K5 en `scripts/lib/lifecycle-model.js` con composición real de runtime, `AuthorityStore` y CAS.
  - Aceptados los ADRs `adr-20260817-001`, `adr-20260817-002` y `adr-20260817-003`.

## [2.45.7] - 2026-08-20

### Fixed
- **Reconciliación Canónica de `ReplayFixtureResult` (REQ-006) (`k4a-replay-completion-contract-reconciliation`)**:
  - `openspec/specs/execution-graph-compiler/spec.md` formaliza el contrato canónico mínimo de `ReplayFixtureResult` en 6 dimensiones deterministas: Provenance estricto (`graph_id` y `work_order_id`), Estado Terminal (`completed` sin cancelaciones ni fallos), Consistencia de Exit Code (`exit_code === 0`), Objeto de Evidencia plano no nulo y no array, Cobertura de Evidencia Requerida por Nodo (`node.required_evidence ⊆ keys(evidence)`), y Satisfacción de Obligaciones a Nivel de Grafo con generación de contraejemplos reproducibles.
  - Eliminada la referencia ambigua a "missing output fields", consolidando el diccionario de `evidence` como el único contenedor canónico de outputs y pruebas en K4a sin introducir schemas de output artificiales.
  - Preservación estricta de las fronteras de kernel: estructuras de ejecución de workers vivos (`WorkResult`), permisos y cápsulas permanecen en K6a/K4b, y causalidad de recuperación permanece en K5.

### Added
- **Suite Exhaustiva de Pruebas Contractuales y Adversariales en Replay Engine**:
  - `scripts/lib/execution-graph/replay-engine.test.js` ampliado con tests unitarios y adversariales para todas las 6 dimensiones de completitud de `ReplayFixtureResult`.
  - Cobertura para combinaciones contradictorias de terminal status (`status: "completed"` con `outcome: "failed"`, `ok: false`, non-zero `exit_code`).
  - Cobertura para tipos de evidencia inválidos (`null`, `[]`, strings, números, booleanos).
  - Cobertura para rechazo de nodos con evidencia requerida incompleta y bloqueo downstream.
  - Cobertura para obligaciones `MUST` diferidas vs no satisfechas y generación determinista de contraejemplos.

## [2.45.6] - 2026-08-16

### Fixed
- **Binding Canónico Estricto en `PolicySnapshot` (`k4a-policy-snapshot-canonicalization-and-replay-hardening`)**:
  - `schemas/kernel/policy-snapshot/v1.schema.json` impone validación estricta con `pattern: "^sha256:[a-f0-9]{64}$"` para `snapshot_id` y `policy_bundle_digest`, y `minLength: 1` para `compiler_version`, `classifier_version` y `runtime_version`.
  - `scripts/lib/kernel-schema-validator.js` implementa soporte nativo de evaluación para `minLength` y `pattern`.
  - `computePolicySnapshotDigest` se convierte en una función pura que procesa exclusivamente el payload canónico ya resuelto sin inyectar defaults ocultos (`|| "1.0.0"`), fallando de forma cerrada ante valores vacíos `""`, sólo espacios o digests malformados.
  - `createPolicySnapshot` normaliza y aplica defaults antes de la validación de esquema.
- **Endurecimiento del Contrato de Fixtures en Replay Engine**:
  - `replayExecutionGraph` exige que todo fixture que reclame `status: "completed"` proporcione un objeto `evidence` válido, definido y no nulo que cubra los `node.required_evidence` del nodo. Fixtures incompletos fallan de forma cerrada y generan un contraejemplo reproducible.
  - Verificación de contradicción: rechazo *fail-closed* si un fixture declara `status: "completed"` pero contiene `exit_code !== 0`.
- **Reconciliación de Autoridad Documental y Roadmap**:
  - `docs/roadmaps/harness-evolution.md`: K4a reconciliado a `done`, K5 a `next-eligible`, y Done Criteria de WorkOrder a `v2` con compilación determinista.
  - `docs/architecture/harness-evolution.md`: Estado verificado actualizado con K4a `done` y K5 `next-eligible`.
  - Sincronizados REQ-003 y REQ-006 en `openspec/specs/execution-graph-compiler/spec.md`.

### Added
- **Suites de Pruebas Adversariales**:
  - Tests adversariales para `PolicySnapshot` contra strings vacíos, whitespace, digests malformados y rechazos de esquema.
  - Tests adversariales para `ReplayEngine` contra fixtures con objeto de evidencia ausente y códigos de salida no nulos con estado `completed`.

## [2.45.5] - 2026-08-16

### Fixed
- **Determinismo Canónico en Compilación de WorkOrders (`k4a-work-order-replay-determinism-and-spec-sync`)**:
  - `compileWorkOrdersV2` se establece como una función pura estrictamente determinista de `ExecutionGraph` y su `SourceSnapshot` validado, fijando `role: "repair-worker"` y `DEFAULT_WORK_ORDER_BUDGET`.
  - Rechazo *fail-closed* ante intentos de suministrar `role` variable (distinto de `"repair-worker"`), `budgets` o `defaultBudget` desacoplados con error `unsupported-compilation-context`, garantizando que todo WorkOrder compilado sea 100% reproducible en `replayExecutionGraph`.
- **Segregación Estricta de Replay Legacy**:
  - Eliminado el soporte de `allowLegacyFixtures` en la API canónica `replayExecutionGraph()`, reservando la evaluación de fixtures no vinculados exclusivamente a `replayLegacyFixtureGraph()`.
- **Sincronización del Spec Canónico Activo (`openspec/specs/execution-graph-compiler/spec.md`)**:
  - Incorporadas todas las garantías contractuales de `v2.45.4` y `v2.45.5` en el spec canónico (provenance estricta `graph_id` + `work_order_id`, autoridad de obligaciones `unknown-obligation-id`, semántica estricta de Shadow `match: false` en dimensiones omitidas, y determinismo de compilación).
- **Claridad de Autoridad de Esquemas**:
  - Documentado formalmente que `schemas/kernel/execution-graph/v1.schema.json` ($defs.node) es el único contrato semántico autoritativo para K4a con `minLength: 1`, manteniendo `schemas/kernel/graph-node/v1.schema.json` congelado para compatibilidad K1.

### Added
- **Pruebas de Composición WorkOrder Compiler → Replay**:
  - Añadidas suites de pruebas verificando la reproducibilidad total de WorkOrders canónicos en Replay y el rechazo estricto de opciones no ligadas.

## [2.45.4] - 2026-08-16

### Fixed
- **Replay Fixture Strict Provenance y Compilación Fail-Closed (`k4a-replay-provenance-and-shadow-remediation`)**:
  - `replayExecutionGraph` exige de forma obligatoria que todo fixture declare `graph_id` y `work_order_id` coincidentes con el grafo canónico y el WorkOrder compilado, rechazando fixtures no vinculados o stale con `stale-fixture-rejected`.
  - Eliminado el `catch` silencioso en la compilación de WorkOrders durante el replay, asegurando fallo cerrado (`work-order-compilation-failed`).
  - Segregada la compatibilidad de fixtures legacy mediante `replayLegacyFixtureGraph()` y el flag explícito `options.allowLegacyFixtures: true`.
- **Autoridad Absoluta de Obligaciones Contractuales**:
  - `compileExecutionGraph` valida que toda obligación externa reconcilie estrictamente con `contract.obligations`, rechazando identificadores desconocidos con `unknown-obligation-id`.
- **Consistencia Semántica en Shadow Comparator**:
  - `compareShadowExecution` restringe `match: true` exclusivamente a coincidencias completas (`full-match`) con cero dimensiones omitidas (`skipped_dimensions.length === 0`).
  - Ante dimensiones no evaluadas en el baseline (por ejemplo, omisión de `ownership`), retorna `match: false`, `discrepancy_classification: "partial-match"` y emite la discrepancia estructurada en `telemetryDiff`.
- **Endurecimiento de Esquemas y Nodos Canónicos**:
  - `schemas/kernel/execution-graph/v1.schema.json` y el compilador imponen `minLength: 1` en todos los identificadores y descriptores de nodo (`node_id`, `kind`, `operation`, `objective`, `budget_ref`, `ownership.owner`, `obligation.id`, `deferred.reason`, `deferred.approved_by`), impidiendo la emisión de grafos con strings vacíos.

### Added
- **Suite de Pruebas Adversariales**:
  - Tests exhaustivos en `replay-engine.test.js`, `compiler.test.js`, `shadow-comparator.test.js` y `k3-k4a-integration.test.js` para los 4 vectores adversariales: `oldUnboundFixture + clarifiedGraph`, `unknownExternalObligation`, `baselineMissingOwnership` y `compileExecutionGraph(node_id: "")`.

## [2.45.3] - 2026-08-16

### Fixed
- **Propagación de Clarify en Identidad de WorkOrders (`k4a-integrity-and-bindings-remediation`)**:
  - Actualizado `schemas/kernel/work-order/v2.schema.json` y `scripts/lib/execution-identities/index.js` (`computeWorkOrderId`) para digerir `clarification_context` canónicamente en la preimagen criptográfica de WorkOrders.
  - `compileWorkOrdersV2` propaga `node.clarification_context` a los WorkOrders v2, produciendo digests `work_order_id` diferenciados para nodos afectados y sus descendientes dependientes.
- **Validación de Provenance de Fixtures en Replay**:
  - `replayExecutionGraph` verifica la vinculación de fixtures contra `graph_id` y `work_order_id`, rechazando fixtures obsoletos pre-clarificación con código `stale-fixture-rejected`.
  - Discriminación cerrada ante contradicciones lógicas en fixtures (`status` vs `outcome`, `ok: false` con status completed, `cancelled` con outcome completed).
- **Merge Seguro de Obligaciones y Sanitización de Deferrals**:
  - `compileExecutionGraph` implementa merge con lista blanca sobre `contract.obligations` inmutables, impidiendo la inyección arbitraria de `deferred` sobre obligaciones `MUST`.
- **Unicidad de `node_id` Fail-Closed**:
  - Validación de unicidad de `node_id` en `dag.js`, `binding.js`, `compiler.js` y `work-order-compiler.js` rechazando duplicados con código `duplicate-node-id` / `DUPLICATE_NODE_ID`.
- **Validación Canónica de ClarifyEvent**:
  - `applyClarifyEvent` valida atómicamente contra el esquema canónico `ospec://schemas/kernel/clarify-event/v1`.
- **Verificación Criptográfica de SourceSnapshot y PolicySnapshot**:
  - Validación y recomputación de `sourceSnapshot` en `compileExecutionGraph` contra su preimagen y rechazo de `policySnapshot: { snapshot_id: "" }`.
- **Clasificación y Comparación Profunda en Shadow**:
  - `compareShadowExecution` restringe `full-match` a comparaciones con 0 dimensiones omitidas y realiza comparación profunda de gobernanza en obligaciones.

## [2.45.2] - 2026-08-16

### Fixed
- **Primitivas Canónicas de Binding Criptográfico (`k4a-integrity-and-bindings-remediation`)**:
  - Implementación de [`validateExecutionGraphBinding()`](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/execution-graph/binding.js) verificando atómicamente conformidad con el esquema JSON y consistencia criptográfica estricta entre `graph_id` y su preimagen de contenido (`nodes`, `obligations`, `source_snapshot_id`, `policy_snapshot_id`, `policy_bundle_digest`, `contract_digest`), protegiendo de raíz contra manipulación post-compilación (*tampering*).
  - Implementación de [`validatePolicySnapshotBinding()`](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/execution-graph/policy-snapshot.js) con recálculo determinista de `snapshot_id` mediante `computePolicySnapshotDigest()`, rechazando snapshots falsificados.
- **Conformidad de Esquema en Clarify y Composabilidad Extremo a Extremo**:
  - Actualizado `schemas/kernel/execution-graph/v1.schema.json` para soportar `clarification_context` opcional en `$defs/node`.
  - Garantizada la composabilidad del pipeline: `applyClarifyEvent` → `validateExecutionGraphBinding` → `compileWorkOrdersV2` → `validateWorkOrderBinding`.
- **Autoridad Absoluta de Obligaciones y Acoplamiento en Preimagen de GraphId**:
  - Blindaje de `contract.obligations` como la única autoridad inmutable sobre criticidad (`MUST` no puede ser degradado a `MAY`/`SHOULD` por entradas externas).
  - Incorporación obligatoria de `obligations` en el cálculo de `computeGraphId()`.
- **Validación Estricta de Provenance y Evidencia en Replay**:
  - Rechazo inmediato *fail-closed* ante `sourceSnapshotId: ""` o valores malformados sin fallback silencioso al contrato.
  - Verificación estricta de `node.required_evidence ⊆ recorded.evidence` a nivel de nodo en `replayExecutionGraph()`.
- **Consolidación de Utilidades DAG y Comparador Shadow Multidimensional**:
  - Módulo unificado `scripts/lib/execution-graph/dag.js` (`hasCycle`, `topologicalSort`, `computeDescendantClosure`).
  - Discriminación multidimensional en `compareShadowExecution()` entre `full-match`, `partial-match` y `diverged`.

### Added
- **Suite Integral de Tests Adversariales Cross-Layer**:
  - Casos de prueba exhaustivos en `scripts/lib/k3-k4a-integration.test.js` cubriendo detección de tampering en grafos, rechazo de degradación de obligaciones, pipeline completo de Clarify con compilación de WorkOrders, snapshots de políticas falsificados, `sourceSnapshotId` vacío y fixtures sin evidencia por nodo.
- **ADRs Promovidos**:
  - Incorporación de ADR-001 a ADR-008 en `docs/adr/` (ADR-20260816-001 a ADR-20260816-008).

## [2.45.1] - 2026-08-15

### Fixed
- **Resolución Topológica y Compatibilidad Criptográfica de WorkOrders v2 (`k4a-remediation-v2-45-1`)**:
  - `compileWorkOrdersV2` (`scripts/lib/execution-graph/work-order-compiler.js`) compila los nodos en orden topológico determinista y materializa sus dependencias como digests SHA-256 (`sha256:...`) de los `WorkOrderId` canónicos upstream mediante `computeWorkOrderId()`.
  - Actualizado `schemas/kernel/work-order/v2.schema.json` restringiendo estrictamente los elementos de `dependencies` al patrón `^sha256:[a-f0-9]{64}$`.
  - Asegurada interoperabilidad estricta y transparente con la autoridad de identidades K3 [`validateWorkOrderBinding()`](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/execution-identities/index.js).
- **Validación Atómica Canónica de Esquemas**:
  - `compileWorkOrdersV2()` valida atómicamente el grafo completo contra `schemas/kernel/execution-graph/v1.schema.json` y cada orden emitida contra `schemas/kernel/work-order/v2.schema.json` mediante `validateInstance()`, emitiendo cero órdenes parciales ante cualquier error.
- **Autoridad Absoluta de Obligaciones del Contrato**:
  - `compileExecutionGraph()` (`scripts/lib/execution-graph/compiler.js`) toma `contract.obligations` como la autoridad canónica inmutable, impidiendo la omisión silenciosa de obligaciones `MUST` mediante arreglos vacíos o sobreescrituras externas.
- **Propagación de Invalidación en Clarify y Replay Fail-Closed**:
  - `applyClarifyEvent()` (`scripts/lib/execution-graph/clarify.js`) muta y actualiza los nodos afectados/invalidados en el grafo y recalcula el `graph_id` determinista.
  - `replayExecutionGraph()` (`scripts/lib/execution-graph/replay-engine.js`) incorpora discriminación cerrada de completitud y rechazo *fail-closed* ante fixtures de nodos invalidados (`stale-fixture-rejected`).
- **Vinculación Criptográfica de `policy_snapshot_id`**:
  - Incorporado `policy_snapshot_id` obligatorio en `schemas/kernel/execution-graph/v1.schema.json` y acoplado a la preimagen de cálculo de `computeGraphId()`.
- **Detección de Ciclos e Inmutabilidad en Compilación de Grafos**:
  - `compileExecutionGraph()` ejecuta `hasCycle()` antes de emitir la estructura y aplica clonación defensiva profunda (`structuredClone()`) sobre nodos y obligaciones.
- **Endurecimiento del Comparador Shadow**:
  - `compareShadowExecution()` (`scripts/lib/execution-graph/shadow-comparator.js`) evalúa multidimensionalmente invariantes, obligaciones, dependencias, ownership, steps y rutas permitidas en modo de solo lectura.

### Added
- **Suite de Integración Transversal K3 ↔ K4a**:
  - Nuevo test end-to-end `scripts/lib/k3-k4a-integration.test.js` validando la cadena criptográfica completa: `SourceSnapshot` → `compileExecutionGraph` → `compileWorkOrdersV2` → `validateWorkOrderBinding` → `validateWorkResultBinding` → `replayExecutionGraph`.
- **ADRs Promovidos**:
  - Incorporación de ADR-007 a ADR-012 en `docs/adr/` documentando las decisiones de remediación de dependencias, validación canónica, autoridad de obligaciones, invalidación en clarify, enlace de policy snapshot y comparación shadow.

## [2.45.0] - 2026-08-15

### Added
- **Compilador de ExecutionGraph y Vínculo Formal con SourceSnapshot (`k4a-execution-graph-compiler-replay`)**:
  - Requisito obligatorio de `source_snapshot_id` (`^sha256:[a-f0-9]{64}$`) en `schemas/kernel/execution-graph/v1.schema.json` y `schemas/kernel/work-order/v2.schema.json`.
  - Derivación determinista de `GraphId` acoplando resúmenes criptográficos de contrato, política, snapshot y estructura de nodos en `scripts/lib/execution-graph/compiler.js`.
  - Validación atómica *fail-closed* en `compileWorkOrdersV2()` (`scripts/lib/execution-graph/work-order-compiler.js`): rechaza desajustes de procedencia, nodos microscópicos o dependencias cíclicas emitiendo cero órdenes parciales ante cualquier error.
  - Preservación estricta, byte a byte, del contrato legacy `work-order/v1.schema.json` y el baseline histórico K1 (`K1_SCHEMA_BASELINE`).
- **Motor de Replay Determinista y Comparador Shadow de Solo Lectura**:
  - Implementación de `replayExecutionGraph()` en `scripts/lib/execution-graph/replay-engine.js` con ordenación topológica robusta y generación de trazas de contraejemplo.
  - Implementación de `compareShadowExecution()` en `scripts/lib/execution-graph/shadow-comparator.js` con clonación profunda defensiva (`structuredClone`) y no-interferencia con el estado activo.
  - Gestión de eventos de aclaración (`applyClarifyEvent`) en `scripts/lib/execution-graph/clarify.js` con cálculo de clausura transitiva e invalidación descendente de nodos dependientes.
  - Verificación de completitud de obligaciones en `validateObligationManifest()` (`scripts/lib/execution-graph/obligation-manifest.js`).
- **Linters de Contratos y Conformidad del Modelo de Ciclo de Vida K4a**:
  - Checkers `k4a-microscopic-nodes.js` y `k4a-obligation-completeness.js` integrados en `scripts/lib/contract-lint.js`.
  - Promoción y validación de 7 invariantes ejecutables K4a en `scripts/lib/lifecycle-model.js` (`inv-k4a-no-microscopic-nodes`, `inv-k4a-obligation-completeness`, `inv-k4a-derived-graph-identity`, `inv-k4a-atomic-work-order-compilation`, `inv-k4a-replay-determinism`, `inv-k4a-shadow-non-interference`, `inv-k4a-no-live-authority`).
- **ADRs Promovidos**:
  - Incorporación de ADR-001 a ADR-006 en `docs/adr/` documentando las decisiones de arquitectura del compilador, modelo de replay, WorkOrder v2 y validación de procedencia.

## [2.44.3] - 2026-08-15

### Added
- **Eliminación Directa de Comas Finales en el Autómata de Estados**:
  - `stripJsoncComments()` en `scripts/configure/install-engine.js` gestiona la omisión de comas finales directamente durante el escaneo carácter a carácter fuera de cadenas, evitando expresiones regulares sobre el texto resultante.
- **Validación Roundtrip y Preflight en VS Code**:
  - `updateSettingsJsoncPreservingComments()` en `scripts/configure/install-vscode.js` revalida el documento resultante antes de retornar, y `main()` ejecuta un preflight completo sobre todos los archivos de configuración antes de escribir cambios a disco.

### Fixed
- **Limpieza de Alcance en Especificación**:
  - Eliminada la referencia residual a `install:copilot` en la sección Scope de `openspec/specs/install/spec.md`.

## [2.44.2] - 2026-08-15

### Added
- **Convergencia y Poda de Skills en Codex**:
  - Seguimiento de manifiesto `.ospec-workflow-install.json` en `~/.agents/skills/` y cálculo de `gatherCodexSkillsFiles()` en `scripts/configure/install-codex.js`.
  - Poda automática de skills obsoletas entre versiones preservando de forma estricta las skills personalizadas del usuario.
- **Parser JSONC con Autómata de Estados**:
  - Implementación de `stripJsoncComments()` en `scripts/configure/install-engine.js` mediante escáner carácter por carácter, garantizando que cadenas literales con `//` o `/* ... */` no se corrompan y eliminando comas finales.
- **Soporte Escalar y Creación de Configuración en VS Code**:
  - Conversión limpia de `"chat.pluginLocations": "ruta"` a listas sin duplicación de propiedades.
  - Creación automática de `settings.json` cuando el directorio de configuración del usuario existe.
  - Salida con código de error no cero (`exit 1`) en `scripts/configure/install-vscode.js` cuando no se encuentra ningún directorio de configuración de VS Code en el host.
- **Código de Salida en Compilación de Hooks**:
  - Actualización del script `build:hooks` en `package.json` para fallar con código `1` si el aprovisionamiento del binario no tiene éxito.

### Fixed
- **Alineación de la Especificación OpenSpec**:
  - Corrección de la ruta global de Copilot (`~/.copilot/`) y comandos de scripts (`install:global:copilot`, `setup:copilot`) en `openspec/specs/install/spec.md`.

## [2.44.1] - 2026-08-15

### Added
- **Aprovisionamiento Automático de Binario en Clones Limpios (`REQ-install-015`)**:
  - Función `ensureRuntimeBinary()` en `scripts/configure/install-target.js` que compila automáticamente `ospec-hooks` con el compilador `go` local cuando está disponible en PATH.
  - Scripts `build:hooks` y `ensure:hooks` en `package.json`.
- **Tests de Integración de Convergencia Multiversión**:
  - Nueva suite `tests/integration/installation-convergence.test.js` que valida ciclos de actualización entre versiones (v1 -> v2), poda de archivos obsoletos y preservación de archivos y hooks de usuario en OpenCode, Copilot, VS Code y Antigravity.

### Fixed
- **Corrección de Prefijo en Ownership de OpenCode y Copilot (`destRel`)**:
  - Paso de `remap.destRel` como `relPrefix` a `syncTargetTree()` en `install-global-opencode.js` e `install-global-copilot.js` para registrar rutas relativas correctas (`agents/...`, `skills/...`) en `.ospec-workflow-install.json`.
- **Poda Segura Fail-Closed en `pruneStaleFiles`**:
  - Re-lanzamiento estricto de cualquier error del sistema de archivos, permisos o violación de seguridad en `install-engine.js` (ignorando únicamente `ENOENT`).
- **Integración de Ownership y Convergencia en Codex**:
  - Soporte de manifiesto de propiedad `.ospec-workflow-install.json`, cálculo de `gatherCodexOwnedFiles()` y poda automática `pruneStaleFiles()` en `install-codex.js`.
- **Preservación de Comentarios JSONC y Fail-Closed en VS Code**:
  - `updateSettingsJsoncPreservingComments()` en `install-vscode.js` para actualizar `chat.pluginLocations` preservando comentarios y formato, retornando código de salida no cero ante configuraciones corruptas.
- **Sanitización de Variables MCP en Cursor**:
  - Resolución o eliminación de placeholders no soportados `${input:...}` en `install-cursor.js` para evitar fugas en `~/.cursor/mcp.json`.
- **Consolidación de la Especificación de Instalación**:
  - Actualización completa de la línea base `openspec/specs/install/spec.md` con los 7 targets globales y requerimientos `REQ-install-008` a `REQ-install-015`.

## [2.44.0] - 2026-08-14

### Added
- **Target Antigravity de Primera Clase**:
  - Perfil declarativo del compilador (`scripts/lib/target-profiles/antigravity.js`) y registro en `PROFILES` de `cli.js`.
  - Transformador de hooks para Antigravity en `scripts/lib/target-transform.js` adaptando eventos (`SessionStart`, `PreToolUse`, `PreCompact`, `SubagentStop`, `Stop`).
  - Validador formal `scripts/configure/validate-antigravity.js` y suite de pruebas `validate-antigravity.test.js`.
  - Instalador transaccional `scripts/configure/install-antigravity.js` con soporte para expansión de variables, idempotencia y preservación de hooks de usuario.
  - Comandos npm en `package.json`: `build:antigravity`, `setup:antigravity`, `reload:antigravity`.
  - Eliminado el script legacy no integrado `scripts/sync-antigravity.js`.
- **Motor Unificado de Instalación (`scripts/configure/install-engine.js`)**:
  - Manifiesto de propiedad (`.ospec-workflow-install.json`) con normalización de rutas POSIX para todos los targets globales.
  - Poda automática y segura de archivos obsoletos (`pruneStaleFiles`) entre versiones preservando estrictamente archivos del usuario.
  - Journal de rollback transaccional con reversión completa en caso de fallo durante la sincronización.
  - Parsers JSON y JSONC seguros con política fail-closed (cero escrituras destructivas ante sintaxis inválida).
  - Fusión no destructiva de configuraciones y hooks en `~/.cursor/hooks.json`, `~/.gemini/config/hooks.json` y `opencode.json`.

### Fixed
- **Hardening de Seguridad y Convergencia Multiobjetivo**:
  - **Cursor**: Sincronización de servidores MCP desde `.mcp.json` y preservación no destructiva de hooks de usuario en `~/.cursor/hooks.json`.
  - **OpenCode**: Ejecución fail-closed en `tool.execute.before` (`opencode-plugin.js`), denegando herramientas ante errores de hook; requerimiento mandatorio de binario compilador (`required: true`).
  - **Copilot**: Fusión segura fail-closed de configuración y seguimiento mediante manifiesto de propiedad.
  - **Codex**: Extracción dinámica de MCP desde `.mcp.json` con soporte completo de variables de entorno (`env`); eliminada la tabla estática duplicada.
  - **Claude**: Validación estricta de códigos de salida en comandos de marketplace y plugin (`status === 0`), eliminando falsos éxitos.
  - **VS Code**: Fusión segura JSONC de `settings.json` preservando comentarios; validador `validate-vscode.js` integrado en la suite de comprobación.
  - **Limpieza de Código Muerto**: Eliminadas constantes obsoletas (`ALLOWED_BUNDLE_KEYS`, `RELATIVE_PATH_KEYS`) en `validate-codex.js`.
  - **Especificación OpenSpec**: Actualizada la línea base de `openspec/specs/install/spec.md` con los requerimientos `REQ-install-008` a `REQ-install-014`.

## [2.43.5] - 2026-08-14

### Fixed
- **Unificación Total de Autoridad TDD y Binding Mecánico Candidate ↔ Git Tree**:
  - `deriveCandidateDeltaPaths` y `recordRemediationAttempt` soportan binding mecánico explícito entre identidades canónicas de Candidate v2 (con digests SHA-256 reales de 64 hex) y Git Tree OIDs (`options.git_trees`, `options.before_git_tree`/`options.after_git_tree`), eliminando el hack de relleno y recorte de 24 ceros (`slice(24)` / `padStart(64, "0")`).
  - `skills/sdd-verify/SKILL.md`: eliminada la regla que otorgaba autoridad directa al prompt del orquestador; `testing.tdd_mode` resuelto mediante `resolveTddMode` es la única autoridad, y el orquestador se limita a reenviar el valor resuelto.
  - `skills/sdd-apply/SKILL.md`: clarificada la activación de Strict TDD supeditada exclusivamente a `testing.tdd_mode: strict`.
  - `rules/sdd-strict-tdd.instructions.md`: actualizada la cabecera de activación condicional para referir a `testing.tdd_mode: strict`.
  - `skills/sdd-init/SKILL.md`: Paso 3 actualizado para definir el test runner como detector de disponibilidad y delegar el modo TDD en `testing.tdd_mode` / preset de escala.
  - `agents/sdd-orchestrator.agent.md`, `docs/tdd-y-revision.md` y `docs/harness-runtime.md`: eliminadas todas las referencias residuales a `strict_tdd: true`.

## [2.43.4] - 2026-08-10

### Fixed
- **Cierre definitivo de Bounded Verify Lineage (K3)**:
  - `deriveCandidateDeltaPaths` exige objetos Git resolubles para calcular el delta real Candidate A → B; eliminados `diffText`/`diff` externos y fallback por conjuntos de paths.
  - `startVerifyLineage`, `evaluateRecheck` y `getLineageNextAction` derivan `contract_digest` exclusivamente desde bytes OpenSpec en disco (`computeContractDigestFromArtifacts(changeRoot, mode)`); el objeto `contract` inline ya no es autoridad.
  - `resolveTddMode` lee únicamente `testing.tdd_mode`; eliminado todo residuo de `strict_tdd`/`strictTdd` en runtime, pre-commit hook, regla Strict y skill de init.
  - `scale: team` ya no activa Focused Mode si `testing.tdd_mode: standard`.
  - Integridad de evidencia de verificación: afirmaciones de `apply-progress.md` y `verify-report.md` reconciliadas contra HEAD real.

## [2.43.3] - 2026-08-10

### Fixed
- **Cierre Final de Garantías de Bounded Verify Lineage (K3)**:
  - Guard de candidate drift pre-remediación (`prepareRemediation`) con validación obligatoria contra `current_candidate_id` antes de escrituras.
  - Derivación mecánica del delta de remediación (`deriveCandidateDeltaPaths`) a partir de la diferencia real Candidate A → Candidate B.
  - Derivación de `contract_digest` directamente desde los bytes de artefactos OpenSpec leídos de disco (`computeContractDigestFromArtifacts`).
  - `resolveTddMode` simplificado a `testing.tdd_mode` exclusivamente, eliminando `scale` y legacy `strict_tdd` en runtime.
  - Fast-path de remediación en `sdd-apply` ejecutado antes de la carga de contexto completo.
  - Lógica determinista de reanudación de tareas (`apply-resume.js`) impidiendo la reejecución de tareas `[x]` tras reinicios.
  - Clasificación de evidencia de verificación (`verify-evidence-classification.js`) y suite de límites de roadmap (`roadmap-boundary.test.js`).
  - Reconciliación de estado terminal de `k3-readiness-remediation` y roadmap marcando K4a como `next-eligible`.

## [2.43.2] - 2026-08-10

### Fixed
- **Alineación de Bounded Verify Lineage con Garantías K3**:
  - Reemplazada la identidad `verify-candidate-v1` por el `Candidate/v2.candidate_id` canónico de K3.
  - Detección de candidate drift activa en todos los estados (`remediation-pending`, `recheck-pending`, `closed`).
  - `contract_digest` vinculado a los bytes reales de artefactos OpenSpec ordenados canónicamente.
  - Comprobación mecánica del scope de remediación (`actual_remediation_changed_paths` ⊆ `allowed_paths`).
  - Recetas explícitas de validación obligatorias para congelar hallazgos bloqueantes sin fallbacks implícitos.
  - Recuperación normal de tareas `[x]` en `sdd-apply` leyendo `apply-progress.md` antes del flujo normal.
  - `resolveTddMode(config)` como única autoridad runtime TDD para `sdd-apply`, `sdd-verify` y pre-commit.

## [2.43.1] - 2026-08-10

### Fixed
- **Remediación de Defectos de Convergencia FSM y Alineación del Contrato Nativo de Codex**:
  - Incorporado el estado `remediation-pending` en `verify-lineage.js` y la transición mediante `recordRemediationAttempt()` a `recheck-pending`.
  - Validación estricta del digest del candidato en estado `closed` (`verified_candidate_id`), transicionando a `supersede-and-discovery` si el código cambia.
  - Reordenado `Step 2a: Bounded Verify Lineage Router` en `sdd-verify/SKILL.md` para ejecutarse al inicio de `sdd-verify` con `HALT` inmediato antes de cualquier preflight de discovery.
  - Implementación del `Step 2c: Remediation Mode Pipeline` y desglose del `Step 4: Common Task Executor` (`standard`, `focused`, `strict`) en `sdd-apply/SKILL.md`.
  - Emisión e instalación exclusiva de `AGENTS.md` para el target Codex en `~/.codex/AGENTS.md` o `<repo>/AGENTS.md`, eliminando la dependencia de `agent.md`.
  - Filtrado de reglas condicionales (`activation: conditional`) en la inyección de `AGENTS.md` para Codex.
  - Unificación de la resolución del modo TDD desde `testing.tdd_mode` como fuente única de verdad.

## [2.43.0] - 2026-08-10

### Fixed
- **Remediación Determinista del Protocolo SDD, Bounded Verify Lineage y Codex Target**:
  - Implementación del reductor puramente funcional `verify-lineage.js` con presupuesto acotado de 2 reintentos de remediación (`max_remediation_attempts: 2`), digests de candidato/contrato y manejo determinista de regresiones causales vs observaciones tardías.
  - Separación física en `sdd-verify` entre los pipelines de Discovery y Targeted Recheck, con `RETURN` explícito tras finalizar la verificación dirigida de hallazgos congelados.
  - Creación e integración del módulo `focused-tdd.md` en `sdd-apply` soportando 3 modos de TDD (`STRICT`, `FOCUSED`, `STANDARD`).
  - Corrección de la duplicación de reglas en la transformación del target Codex (`scripts/lib/target-transform.js`), evitando inyectar contenido de reglas en `agent.md` cuando la estrategia es `to-agents-md`.
  - Migración de la configuración legacy `strict_tdd: true` a `testing.tdd_mode: focused` en `openspec/config.yaml`.
  - Eliminación de la contradicción en `strict-tdd.md` sobre la ejecución de tests tras el lote completo de refactorización.

## [2.42.8] - 2026-08-10

### Changed
- **Reestructuración de Arquitectura TDD, Bounded Lineage y Codex Target**:
  - Desacoplamiento de `strict_tdd: true` implícito por detección de test runner en `sdd-init`, estableciendo el modelo por niveles `testing.tdd_mode` (`standard`, `focused`, `strict`) según escala (`solo` → `standard`, `team` → `focused`, `enterprise` → `strict`).
  - Triangulación y refactorización condicional en `strict-tdd.md` eliminando microciclos excesivos y ejecutando pruebas tras el lote de refactor completo.
  - Exclusión explícita en `tdd-workflow` cuando el ciclo de cambio SDD se encuentra activo.
  - Implementación de `Bounded Verify Lineage` en `sdd-verify`, acotando las re-verificaciones tras `sdd-apply` al chequeo dirigido de hallazgos congelados en `state.yaml` y marcando nuevos problemas como `late_observation` no bloqueantes.
  - Corrección de la estrategia de reglas del target Codex a `to-agents-md` acorde al ADR-001, sintetizando el archivo `AGENTS.md` a nivel raíz y manteniendo el orquestador por debajo de 500 líneas.

## [2.42.7] - 2026-08-10

### Fixed
- **Remediación de Preparación y Cierre de Contratos K3** (`k3-readiness-remediation`):
  - Alineación de la validación de Candidate v2 con el vocabulario fail-closed (`exact`, `changed`, `ambiguous` y `unknown`).
  - Definición explícita de la semántica predecesor/sucesor impidiendo que un Candidate modificado permanezca marcado como `exact`.
  - Inclusión de fixtures de prueba para enlaces simbólicos, rutas sensibles a mayúsculas/minúsculas, proyecciones y separación de identidades.
  - Verificación de la disponibilidad de esquemas y APIs K3 en todas las distribuciones en `dist/`.
  - Reconciliación transaccional de estados de archivo y promoción de decisiones arquitectónicas (`docs/adr/adr-20260809-001` a `004`).

## [2.42.6] - 2026-08-08

### Fixed
- **Endurecimiento de Tipo String en `freezeCandidate` diffText**:
  - Validación explícita de tipo `string` para la propiedad opcional `diffText` en `freezeCandidate`, rechazando valores no-string fail-closed con `TypeError`.
  - Cobertura de prueba unitaria verificando el rechazo de objetos o tipos no-string en `diffText`.

## [2.42.5] - 2026-08-08

### Fixed
- **Integridad de Autodeclaración de SourceSnapshot y Garantía de Esquema en freezeCandidate**:
  - Verificación en `validateWorkOrderBinding` de la autoconsistencia del `source_snapshot_id` declarado dentro del propio registro `sourceSnapshot` contra su digest recomputado, retornando el código de razón específico `SOURCE_SNAPSHOT_ID_MISMATCH` cuando difieren.
  - Validación de patrón `^sha256:[a-f0-9]{64}$` y `minLength: 1` en `schemas/kernel/source-snapshot/v1.schema.json`.
  - Validación estricta de elementos de `paths` (strings no vacíos) en `freezeCandidate` e inyección de un guard de invariante final (`validateCandidateV2`) garantizando que todo resultado de `freezeCandidate` sea siempre schema-valid Candidate v2.
  - Pruebas adversariales adicionales para verificación de autoconsistencia de SourceSnapshot e invariante de freezeCandidate.

## [2.42.4] - 2026-08-08

### Fixed
- **Corrección de Cierre Contractual de Validación de Schemas K3 y Endurecimiento de Candidates**:
  - Eliminación de la mutación/reparación previa de payloads en `validateSourceSnapshotV1`, `validateWorkOrderSchema` y `validateWorkResultV1`, garantizando validación pura sobre el objeto original recibido.
  - Ejecución incondicional de validación de esquema JSON en `validateIdentityKind` para las entidades primarias (`SourceSnapshot`, `WorkOrder`, `WorkResult` y `Candidate`), eliminando el bypass cuando la propiedad `kind` estaba presente.
  - Endurecimiento estricto de `computeCandidateId` para exigir propiedades canónicas K3 (`repository_id`, `projection` `workspace|staged`, `base_tree`, `candidate_tree`, `diff_hash`, `paths` arreglo de strings, `changed_paths_modes_digest`).
  - Cobertura de pruebas unitarias y adversariales adicionales verificando el comportamiento fail-closed ante payloads sin reparar.

## [2.42.3] - 2026-08-08

### Fixed
- **Remediación Acumulativa de Schemas y Bindings Criptográficos K3** (`k3-cumulative-schema-binding-remediation`):
  - Ejecución obligatoria de validación JSON Schema dentro de los gates de binding `validateWorkOrderBinding` (`SourceSnapshot` v1 y `WorkOrder` v2) y `validateWorkResultBinding` (`WorkOrder` v2 y `WorkResult` v1) previa a la recomputación criptográfica.
  - Validación estructural contra JSON Schema v1 en `validateIdentityKind` para objetos `SourceSnapshot` y `WorkResult` sin propiedad `kind` (v1 des-kinded), rechazando objetos vacíos o malformados como `{}` fail-closed.
  - Validación profunda de tipos y formatos de propiedades anidadas en `computeWorkOrderId` (`ownership` owner/mode, `budget` campos numéricos, `dependencies` ítems sha256) y `computeWorkResultId` (`patch` string, `commands` ítems, `logs` ítems, `filesystem_inventory` ítems).
  - Limpieza de la tabla `EXPECTED_KINDS` en `validateIdentityKind` para restricción estricta de `Candidate` a `"candidate/v2"` y `WorkOrder` a `"work-order/v2"`.
  - Inclusión de 58 pruebas TDD unitarias y adversariales garantizando 0 errores y 0 advertencias en todo el sistema.

## [2.42.2] - 2026-08-08

### Fixed
- **Remediación Estricta de Binding y Schemas K3** (`k3-strict-schema-binding-remediation`):
  - Validación de forma estricta sin coerción silenciosa a valores vacíos (`""`, `[]`, `{}`) en las funciones de cómputo de identidades K3 (`computeSourceSnapshotId`, `computeWorkOrderId`, `computeWorkResultId`).
  - Validación acumulativa de contrato y digest (`schema válido ∧ kind/version válido ∧ ID recomputado == ID declarado`) en las puertas de binding `validateWorkOrderBinding` y `validateWorkResultBinding`.
  - Discriminación coherente de tipos v1 permitiendo propiedad `kind` opcional en los schemas `source-snapshot/v1` y `work-result/v1`.
  - Refinamiento de la baseline de inventario `K1_SCHEMA_BASELINE` excluyendo manifiestos evolutivos de registro (`manifest.json` y `contract-claims.json`).
  - Cobertura completa de 10 pruebas adversariales TDD verificando el comportamiento fail-closed ante manipulación de datos o esquemas parciales.

## [2.42.1] - 2026-08-07

### Fixed
- **Cierre de Límites de Identidades K3 y Publicación Canónica v2** (`k3-identities-boundary-closure`):
  - Gate de congelado `INVALID_FROZEN_CANDIDATE` en `evaluateCandidateRelation` rechazando baselines o targets no congelados o inválidos antes de evaluar relación.
  - Discriminación positiva cerrada por tabla `EXPECTED_KINDS` en `validateIdentityKind` fallando ante kinds ausentes o incompatibles.
  - Recomputación criptográfica completa en `validateWorkOrderBinding` y `validateWorkResultBinding` verificando payloads declarados contra digests de origen.
  - Publicación de schemas v2 en rutas canónicas `schemas/kernel/candidate/v2.schema.json` y `schemas/kernel/work-order/v2.schema.json` con id estable `ospec://schemas/kernel/candidate/v2` y `ospec://schemas/kernel/work-order/v2`.
  - Restauración exacta de bytes y pins `K1_SCHEMA_BASELINE` era `02e97a5` para `candidate/v1` y `work-order/v1`.
  - Dominio digest `work-order/v2` para WorkOrder v2 con aislamiento respecto a `work-order/v1`.
  - Promoción de 5 Decisiones de Arquitectura (`ADR-001` a `ADR-005`) en `docs/adr/`.

## [2.42.0] - 2026-08-07

### Added
- **Remediación de Identidades de Ejecución K3 y Versionado de Schemas v2** (`k3-identities-remediation`):
  - Schemas JSON v2 con discriminador de tipo explícito (`kind` const): `schemas/kernel/candidate-v2/v2.schema.json` (`kind: "candidate/v2"`) y `schemas/kernel/work-order-v2/v2.schema.json` (`kind: "work-order/v2"`).
  - Inmutabilidad absoluta de la baseline K1 (`candidate/v1.schema.json`, `work-order/v1.schema.json` y `K1_SCHEMA_BASELINE` preservados al 100%).
  - Constructor exclusivo `freezeCandidate()` para `candidate/v2` con desambiguación estricta entre `diffText` (cadena cruda procesada como digest SHA-256) y `diff_hash` (digest verificado), rechazando valores vacíos o contradictorios.
  - Payloads canónicos completos en `computeWorkOrderId` (incluyendo `dependencies`, `ownership`, `required_evidence`).
  - Validaciones de binding fail-closed `validateWorkOrderBinding()` y `validateWorkResultBinding()`.
  - Recálculo determinista de digests en `evaluateCandidateRelation()`, ignorando el `candidate_id` declarado para detectar spoofing y retornar `DECLARED_ID_MISMATCH` (`relation: "unknown"`, `action: "stop"`).
  - Discriminación cerrada por schema/kind en `validateIdentityKind()` y regla positiva para `EvaluationAttestation` y `DeliveryAuthorization` (exigiendo `CandidateId` sintácticamente válido `sha256:<64 hex>`).
  - Suite de 14 pruebas adversariales verificando inmunidad ante suplantación de identidades, alteración de payloads congelados y alias de tipos.

## [2.41.0] - 2026-08-07

### Added
- **K3: Identidades de ejecución y Candidate freeze** (`k3-identities-candidate-freeze`):
  - Cuatro identidades de ejecución con digests SHA-256 domain-prefixed: `SourceSnapshotId`, `WorkOrderId`, `WorkResultId`, `CandidateId`.
  - Schemas JSON estables `source-snapshot/v1` y `work-result/v1` bajo `schemas/kernel/`.
  - Extensión de `candidate/v1.schema.json` con campos de freeze (modos, untracked, predecessor, relación).
  - Campo requerido `source_snapshot_id` en `work-order/v1.schema.json`.
  - Módulo `scripts/lib/execution-identities/index.js` con funciones `computeSourceSnapshotId`, `computeWorkOrderId`, `computeWorkResultId`, `computeCandidateId`, `freezeCandidate`, `evaluateCandidateRelation`, `validateIdentityKind`.
  - Candidate freeze restringido a proyecciones `workspace` | `staged` con digest de modos de archivo y untracked intencionados.
  - Evaluación fail-closed de relación inicial Candidate: `exact`, `changed`, `ambiguous`, `unknown`.
  - Guardas no-aliasing y rechazo de targets mutables para identidades de ejecución.
  - Validación de inputs null/undefined en todas las funciones compute (TypeError guards).
  - Validación de baseline ambiguo/unknown en `evaluateCandidateRelation`.
  - Familias `source-snapshot` y `work-result` registradas en `manifest.json` y `contract-claims.json`.
  - Fixtures de validación (válidos e inválidos) para los 4 schemas.
  - Suite de tests con Strict TDD: 8 tests de ejecución-identidades + fixtures de schema.

## [2.40.11] - 2026-08-07

### Fixed
- **Recuperación fail-closed ante candados stale (`stale-lock-recovery-required`)**: Eliminado el borrado/renombrado automático inseguro de candados caducados en `FileSystemStore.withFileLock`. Al detectar un `.lock` caducado perteneciente a un proceso extinto, `withFileLock` falla cerrado lanzando `stale-lock-recovery-required`.
- **Verificación determinista de exclusión mutua single-writer**: Añadida prueba determinista con barrera `Promise.all` verificando que el número máximo de ejecuciones concurrentes dentro de la sección crítica es estrictamente 1 (`maximumActive === 1`), garantizando la prevención de carreras TOCTOU y escrituras concurrentes.

## [2.40.10] - 2026-08-07

### Fixed
- **Eliminación del puente `setRunKernelOperation` / `runKernelOperation` de `internal/permit-authority.js`**: Removidas las funciones del export de `internal/permit-authority.js` y `index.js`. `runKernelOperation` permanece como función lexical y estrictamente privada dentro de `lifecycle-kernel/index.js`.
- **Eliminación de self-grant en `minimal-kernel-harness.js`**: Removido `runKernelOperation` aceptando `permitLedger` y sustituidas todas las llamadas en el harness por `createKernelRuntime` directo.
- **Estrategia atómica Quarantined Rename en `FileSystemStore`**: Reemplazada la reapertura `"r+"` por la operación atómica del sistema `fs.rename(lockPath, quarantinePath)`. En POSIX y Windows, exactamente un scavenger atómicamente renombra el candado caducado, eliminando completamente la corrupción de bytes nulos (`\0`) por desalineación de offset de archivo y resolviendo la condición de carrera TOCTOU.

## [2.40.9] - 2026-08-07

### Fixed
- **Encapsulación estricta de `permitIssuer` en `createKernelRuntime`**: Eliminada la opción `options.permitIssuer` y la propiedad accesor `permitIssuer` del runtime de producción en `lifecycle-kernel/index.js`. `createKernelRuntime` genera y mantiene `permitIssuer` dentro de su closure privada.
- **Remoción de bypass en `minimal-kernel-harness.js`**: El harness ya no inyecta `input.permitLedger` en `createKernelRuntime`.
- **Composición aislada para tests**: Creado `createTestKernelRuntime` en `scripts/lib/test-support/permit-test-helpers.js` para permitir la inyección controlada de issuers en suites de pruebas unitarias sin contaminar el runtime de producción.
- **Takeover atómico de candados stale**: `FileSystemStore.withFileLock` abre `.lock` en modo `"r+"`, verifica que `ownerToken` bajo el handle coincida con el token caducado del proceso extinto, trunca e instala el nuevo payload atómicamente antes de retornar el handle, eliminando la carrera TOCTOU.

## [2.40.8] - 2026-08-06

### Fixed
- **Aislamiento estricto de `permitIssuer` en `KernelRuntime`**: `KernelRuntime.runOperation` descarta incondicionalmente cualquier `permitLedger` proporcionado por el caller en los argumentos de entrada y utiliza exclusivamente su `permitIssuer` privado interno.
- **Propagación de fallo backend CAS en `AuthorityStore`**: `AuthorityStore.compareAndSwapLocked` inspecciona el resultado de `entry.inner.commit(...)` tanto en el flujo estándar como en el de curado convergente, propagando inmediatamente respuestas no exitosas (como `cas-conflict`) sin alterar el `authority` local ni los baselines.
- **Protección de liveness en stale lockfiles**: `FileSystemStore.withFileLock` verifica la actividad del proceso propietario (`isPidAlive`) antes de eliminar candados `.lock` por caducidad, evitando robo de candados activos en operaciones de larga duración.
- **Pruebas de concurrencia a nivel `AuthorityStore`**: Pruebas de integración con `Promise.all` sobre instancias de `AuthorityStore` compitiendo sobre un mismo `FileSystemStore`, verificando el comportamiento end-to-end de 1 ganador y 1 `cas-conflict`.

## [2.40.7] - 2026-08-06

### Fixed
- **Encapsulación completa de la superficie de autoridad**: Des-exportación de `_internalCreateIssuer`, `mintOperationPermit`, `issueOperationPermit`, `isPermitAuthorityIssuer` y `runKernelOperation` de las interfaces públicas de producción (`permits.js`, `lifecycle-kernel/index.js`). `createKernelRuntime(options)` es el único punto de entrada público. Las funciones internas de permit authority residen en `lifecycle-kernel/internal/permit-authority.js`.
- **Módulo de soporte de pruebas aislado**: Creación de `scripts/lib/test-support/permit-test-helpers.js` con helpers de minteo directo para suites de test, sin re-exportación en módulos de producción.
- **Verificación de `expectedRevision` en CAS backend**: `AuthorityStore.compareAndSwap` propaga `expectedRevision: currentRevision` a `entry.inner.commit(...)` tanto en la ruta CAS normal como en la ruta de curado convergente (heal). `FileSystemStore.commit(...)` verifica `expectedRevision === currentRevision` bajo `withFileLock` y retorna `{ ok: false, code: "cas-conflict" }` si no coincide.
- **Fail-closed en `FileSystemStore.load()`**: Cuando el archivo principal y el `.bak` están ausentes, lanza error con código `authority-head-not-found` en lugar de reinicializar silenciosamente, salvo que se proporcione explícitamente `initializeIfMissing: true`.
- **Lockfile con token de propietario JSON**: `withFileLock` escribe `{ ownerToken, pid, timestamp }` en el archivo `.lock` y solo lo desvincula en `finally` si el `ownerToken` coincide con el del proceso actual, previniendo la eliminación accidental de candados ajenos.
- **Suite adversarial y de concurrencia**: Tests de no-filtración de superficie pública, carrera concurrente con barrera de sincronización (`Promise.all`, 2 instancias leen R0 antes de commit), fail-closed sin archivos, y seguridad de token de propietario.
## [2.40.6] - 2026-08-06

### Fixed
- **Encapsulación total en Kernel Runtime**: Eliminación completa de accesores públicos (`getPrivateIssuer`, `_createPermitAuthorityIssuerInternal`). `createKernelRuntime(options)` actúa como el único punto de entrada con closure privado que protege la capacidad de emisión de permisos.
- **Sanación convergente CAS durable**: `AuthorityStore.compareAndSwap` invoca explícitamente `inner.commit(...)` al curar el authority bag en el camino convergente, garantizando que los permisos consumidos y receipts persistan en disco tras un reinicio.
- **CAS multi-instancia cruzado**: `FileSystemStore` implementa `withFileLock` (archivo `.lock` con reintentos y expiración de stale locks) y comprobación de revisión en disco antes del commit. Dos instancias concurrentes sobre la misma revisión resultan en exactamente un éxito y un conflicto `cas-conflict`.
- **Recuperación resiliente en Windows**: `FileSystemStore.load()` inspecciona y restaura automáticamente desde archivos de respaldo `.bak` cuando la ruta principal devuelva `ENOENT`, evitando reinicializaciones accidentales del lifecycle.
- **Vinculación de revisión post-CAS en Receipt**: `OperationReceipt.revision` se vincula a la revisión ganadora post-CAS `R1` (en lugar de la previa `R0`).

## [2.40.5] - 2026-08-06

### Fixed
- **Encapsulación estricta del Permit Issuer**: Eliminación de `getPermitIssuer()` de la interfaz pública de `AuthorityStore`. Remoción de `PERMIT_AUTHORITY_ISSUER` y `createPermitAuthorityIssuer` de las exportaciones públicas, y reemplazo del `Symbol.for` global por un `Symbol` privado a nivel de módulo (`STORE_ISSUERS` WeakMap), impidiendo que llamantes externos obtengan o falsifiquen la capacidad emisora.
- **Registro CAS atómico unificado y durabilidad crash-safe**: `AuthorityStore` persiste la tupla completa de 4 elementos `{ state, journal, authority, budgets }` como una sola unidad atómica durante el CAS. `FileSystemStore` implementa secuencia atómica en 4 pasos (escritura en archivo temporal -> `fsync` de archivo -> renombrado atómico `renameSync` -> `fsync` de directorio padre) garantizando recuperación consistente tras un reinicio de proceso sin requerir la invocación manual de `snapshot()`.
- **Cierre 4R auditable**: Re-certificación auditable de las 4 dimensiones de revisión (`risk`, `resilience`, `reliability`, `readability`) con estado `approved`.

## [2.40.4] - 2026-08-06

### Fixed
- **Issuer capability**: `createPermitLedger()` es reader-only; solo `createPermitAuthorityIssuer()` (propiedad del Authority Store) puede registrar offers/decisions y emitir permits. `runKernelOperation` rechaza ledgers ajenos (`issuer-capability-required`).
- **Replay ligado al intent persistido**: la authority bag guarda `operation_intent_digest` / digests completos; `findReplayReceipt` compara contra el registro almacenado, no contra el permit presentado por el caller.
- **IDs no reciclables**: `permit_id` / offer / decision usan UUID; restart no colisiona con IDs consumidos.
- **CAS atómico**: mutex por subject; authority bag se publica solo tras `inner.commit` exitoso; `computeRevision` incluye `authority_root_digest`.
- **Oráculos semánticos**: `enforced` exige marcadores por capability (`execution_id`, `worker_id`, `tool`, `answered`+correlation, `authorizes_delivery===false`); no-op/`{}` → `partial`.

### Docs
- Changelog de hardening durable-authority + semantic oracles (pre-K3).

## [2.40.3] - 2026-08-06

### Fixed
- **Issuer sin DTOs fabricados**: `issueOperationPermit` exige `offer_id` + `decision_id|rule_id` registrados en el ledger runtime (`registerTransitionOffer` / `registerPolicyDecision` / `registerHumanDecision` / `registerKernelRule`); DTOs inventados → `issuer-fabricated-decision`.
- **Probes ejecutados para `enforced`**: `createClaudeHostAdapter` es async y marca `enforced` solo tras observar un `TransportOutcome` real vía `invokeTransportAsync`; `liveProbes` declarativos ya no autorizan.
- **Promise anidada rechazada**: handlers Claude hacen `await` de primitives; `invokeTransportAsync` asienta thenables en `value` y clasifica rechazo como `ok:false` (sin falso éxito).

### Docs
- Changelog de hardening pre-K3 (authority provenance + live probes + async settlement).

## [2.40.2] - 2026-08-05

### Fixed
- **CapabilityProof live bind**: `verifyCapabilityProof` exige identidad viva (`expectedAdapterId/Version`, `expectedHostRuntimeVersion`, `expectedProbeDigest`); el headless ya no rellena el digest desde `proof.probe_digest`.
- **Claude `enforced` honesto**: solo con primitiva real + live probe + digest independiente; sin primitiva → `unavailable|instructional|partial`.
- **Transports async seguros**: `invokeTransportAsync` / `classifyTransportFailure` compartidos; rechazo de Promise → `ok:false`; settlement del invoke tras timeout/cancel (sin `unhandledRejection`).
- **Fault matrix vía ports**: fallos atraviesan el adapter con wrappers + invoke async (no solo inject sintético).
- **Deep-freeze de ports** en `createHostAdapter`; schemas aditivos `transport-request|outcome|failure` v1.
- **W4 harness-alone**: test negativo runtime de cobertura incompleta sin Headless peer.

### Docs
- Specs baseline deltas en capability-proof, host-capabilities-contract, reference-host-adapter, headless-conformance-host, kernel-contract-schemas, minimal-kernel-harness, lifecycle-kernel-runtime.
- ADRs `adr-20260805-007`…`009`; change archivado en `openspec/changes/archive/2026-08-05-k2a-1-live-capability-probes-async-transports/`.
- Roadmap: k2a-1 `done`; K3 `next-eligible`.

## [2.40.1] - 2026-08-05

### Fixed
- **K2.1b permit issuance**: `runKernelOperation` deja de auto-mintear (`mintPermit` default `false`); issuer controlado `issueOperationPermit` (TransitionOffer + PolicyDecision|HumanDecision|KernelRule + `expected_revision`).
- **Consume atómico**: permit consumed + `OperationReceipt` co-commiteados en la misma revisión CAS que state/journal (authority bag); sin receipt efímero post-CAS.
- **4R remediation**: CAS convergente co-escribe bag o fail-closed; bag materializado antes de `inner.commit` con rollback; `mintOperationPermit` fuera de la API pública; exact-replay liga `arguments_digest`; `permit-reuse` consulta bag; `persistJournal` respeta `commitJournal` `ok:false`.

### Docs
- Roadmap quick-path: deja de decir bare `Ejecutar K2a → K3` (WARNING5).
- Specs baseline deltas en `operation-permits`, `authority-store`, `lifecycle-kernel-runtime`, harness/model/canon.
- ADRs `adr-20260805-005`…`006`; change archivado en `openspec/changes/archive/2026-08-05-k2-1b-permit-issuance-atomic-consume/`.

## [2.40.0] - 2026-08-05

### Added
- **K2a Host Capabilities Contract**: `HostCapabilities` con estados cerrados `enforced|partial|instructional|unavailable` y cinco transports (`Execution`, `Question`, `Worker`, `ToolExecution`, `DeliveryGate`) sin autoridad de lifecycle/CAS/permit.
- **CapabilityProof**: prueba reproducible (`adapter_version`, `host_version`, `fixture`, `evidence_digest`) requerida antes de `enforced`; digests canónicos sin timestamps.
- **Headless Conformance Host**: peer del Minimal Kernel Harness con fault matrix (timeout/cancel/worker-fail/interrupt), rechazo de adapters que dupliquen lifecycle/Graph, y outcomes fail-closed.
- **Reference adapter Claude Code**: único adapter real activado; registry con stubs inactivos para el resto (expansión en K11a).
- **Schemas / model**: ocho familias JSON Schema K2a, `host-boundary` + scope-guard, seis checkers de modelo y peer wiring del harness.

### Fixed
- **4R remediation**: denylist de autoridad completa (aliases snake_case), `invokePort` con catch estructurado, `pass` exige `ok===true` sin fault, helper legible `selectEnforcementFailureReason`.

### Docs
- Specs baseline nuevas: `host-capabilities-contract`, `capability-proof`, `headless-conformance-host`, `reference-host-adapter` + deltas en runtime/harness/schemas/canon/model.
- ADRs `adr-20260805-001`…`004`; change archivado en `openspec/changes/archive/2026-08-04-k2a-headless-conformance-host/`.

## [2.39.0] - 2026-08-04

### Added
- **K2.1 Authority Store**: CAS obligatorio (`compareAndSwap`) con revisión `state+journal`, durabilidad mid-op vía `commitJournal` y ancla por-writer (`mid_op_ticket`) que cierra recycle S0→S1→S0 y forge ajeno.
- **OperationPermit / OperationReceipt**: ledger runtime-owned; `TransitionOffer` nunca autoriza; receipt distinto de `receipt/v1`; binding de operation/subject/args al ledger.
- **Effect semantics**: clases cerradas `pure|idempotent-keyed|probeable|compensatable|irreversible`; irreversible ambiguo → `decide|stop` sin retry ciego; interrupt en `executing` persiste `unknown`.
- **Harness / model / schemas**: fault matrix K2.1 (CAS/stale/reuse/irreversible), 7 checkers ejecutables, familias `operation-permit`, `operation-receipt`, `effect-class`.

### Fixed
- **4R remediation**: 8 hallazgos bloqueantes resueltos (ticket mid-op, authorize binding, interrupt unknown, tests mid-op, rename semántico, permit↔operation).

### Docs
- Specs baseline: `authority-store`, `operation-permits`, `effect-semantics` + deltas en runtime/harness/model/schemas/canon.
- ADRs `adr-20260804-001`…`004`; change archivado en `openspec/changes/archive/2026-08-04-k2-1-authority-store-permits/`.

## [2.38.0] - 2026-08-04

### Added
- **K2 Lifecycle Kernel**: núcleo funcional / shell imperativo con digest de estado, registro de operaciones, reducer puro, selector de transiciones, journal con idempotencia/reconciliación, eventos derivados no autoritativos y recovery honesty.
- **Minimal Kernel Harness**: API pública determinista con store/executor/clock inyectados, matriz de interrupción, snapshot round-trip y halt en `decide` sin auto-aprobación.
- **Model-based conformance**: exploración acotada en Node con 8 invariantes ejecutables, ports opacos (`SubjectId`/`AuthorityToken`/`BudgetRef`/`PolicyRef`), manifest diferido y replay de contraejemplos vía harness.
- **Parity de superficie runtime**: proyecciones humana/negociada derivadas de la misma transición K2; command honesty contra dead-ends.
- **Bridges de compatibilidad**: routing, review-lineage y archive consumen operaciones K2 sin segundo reducer ni romper historiales.

### Fixed
- **Fail-closed de effects**: `{ok:false}` y outcomes ambiguos no avanzan estado; journal `failed`/`unknown` con resume `reconciliation-required`; `started` solo reintenta con barrera pre-effect.
- **K1 scope-guard**: rutas sucesoras K2 excluidas del inventario congelado K1 sin debilitar el allowlist K1.
- **Durabilidad de journal**: `commitJournal` obligatorio en mutaciones; `effectExecutor` requerido salvo `status`.

### Docs
- Specs baseline: `lifecycle-kernel-runtime`, `minimal-kernel-harness`, `lifecycle-model-conformance` y delta `transition-surface-parity` (REQ-006/007).
- Change archivado en `openspec/changes/archive/2026-08-04-k2-lifecycle-kernel/`.

## [2.37.2] - 2026-08-03

### Fixed
- **Cursor hooks / Task**: el launcher degrada `permissionDecision: ask` a `allow` + mensaje advisory en hosts Cursor (`preToolUse`, `beforeShellExecution`, `beforeReadFile`, `subagentStart`), porque Cursor no implementa `ask` y abortaba el despacho de subagentes con error fatal.
- **Install Cursor**: al sincronizar `hooks.json`, cablea `preToolUse`/`subagentStart` (y `preCompact` cuando aplica) a partir de los eventos ya generados; `validate-cursor` acepta esos eventos.

## [2.37.1] - 2026-08-03

### Fixed
- **Instalación completa y rollback (Targets)**: Completa la sincronización de artefactos gestionados y aplica rollback transaccional ante fallos tardíos, restaurando bytes y permisos, retirando altas MCP parciales y limpiando directorios nuevos sin alterar archivos del usuario.
- **Validación binaria fail-closed (Copilot y Cursor)**: Distingue contenido binario real de texto por su contenido, exige el ejecutable nativo requerido y convierte errores, carreras y artefactos ilegibles del filesystem en fallos de validación explícitos.

### Changed
- **Idempotencia real (Codex y Cursor)**: Las reinstalaciones convergen sin duplicar agentes, hooks o MCP, preservan configuración y autenticación del usuario, y mantienen sin cambios los digests de los árboles gestionados.
- **Evidencia de verificación (Setup de targets)**: Valida 127 pruebas focales y una suite global con 1.734 pruebas aprobadas, 2 omitidas y 0 fallos; cobertura combinada de 89,41% en líneas, 84,64% en ramas y 95,35% en funciones.

## [2.37.0] - 2026-08-03

### Added
- **K1 contract suite**: Árbol `schemas/kernel/` versionado (`$id` `ospec://…/v1`) con 12 familias, fixtures válidos/inválidos, aliases de migración y emission claims.
- **Canon de autoridad y clasificación**: `authority-canon`, clasificador con hard floors por evidencia (migration/auth/API pública/Repair/Direct), fingerprint `stableSerialize`+SHA-256 y reasons estables; sin cablear routing fixed.
- **Transición y paridad de superficies**: `next_transition` (`execute|collect|decide|stop`) con tokens/`command` cuando aplica, y paridad material entre proyección humana y envelope negociado.
- **Checkers CI K1**: cuatro checkers en `contract-lint` (schema-compat, emission, prose-authority, maturity) registrados en `DEFAULT_REGISTRY`.
- **Baselines OpenSpec**: dominios `harness-authority-canon`, `kernel-contract-schemas`, `change-classification`, `transition-surface-parity` y delta `contract-lint` (REQ-008…011); ADRs 20260803-001…004.

### Fixed
- **Validador JSON Schema dep-free**: `schema===false` rechaza toda instancia; schemas no-objeto fallan cerrado (no false-valid).
- **Cobertura execute-token**: tests RED para argumentos `execute` sin `token` o solo whitespace.

### Docs
- Madurez `{implemented|target|experimental}` en arquitectura del harness; change archivado en `openspec/changes/archive/2026-08-03-k1-contract-suite/`.

## [2.36.0] - 2026-07-31

### Added
- **Baseline fixed-policy canónica (PR #74)**: Publica la política de referencia 9/9 con identidad, provenance y métricas comparables; la publicación es atómica y fail-closed, mientras el smoke 3/3 se mantiene como diagnóstico. Verificación: 68/68 focales, 17/17 ciclos y 34/34 bindings.

### Security
- **Receipts Strict TDD runtime autenticados por contenido (PR #73)**: Rechaza de forma fail-closed tampering, traversal y symlinks, y preserva los bytes raw en Windows. Verificación: 33/33 pruebas focales y suite global verde.

### Fixed
- **Cierre del gate 4R (Harness)**: Corrige los contratos de diffs Git canónicos para archivos vacíos y del envelope completo del generalista. Las pruebas focales y relacionadas, además de la suite global, quedaron verdes tras ambos fixes.

### Changed
- **Política agente→tier canónica (PR #72)**: Establece `models.yaml` como única fuente de política, conserva las invariantes estructurales del resolver, reasigna `sdd-propose` al tier `default` y alinea documentación, specs, fixtures y contratos.
- **Roadmap del harness**: Reorienta las prioridades hacia el kernel determinista y Graph IR.

### Docs
- **Trazabilidad SDD de fixed-policy**: El cambio, ejecutado con TDD estricto y gate 4R, cerró con PASS de 16/16 escenarios MUST; quedó archivado transaccionalmente en `openspec/changes/archive/2026-07-31-fixed-policy-reference-baseline/`, sincronizó `openspec/specs/orchestrator-evals/spec.md` y promovió `docs/adr/adr-20260731-001-publish-a-self-describing-fixed-policy-baseline.md`.

### Known limitations
- **Validación temporal del candidato**: Se conserva como advisory no bloqueante la falta de validación ISO-8601 de `candidate.generated_at`.

## [2.35.0] - 2026-07-26

### Added
- **Archive híbrido transaccional (O6A)**: `sdd-archive` emite `archive-plan.json` (Plan-and-Report); runtime determinista (`scripts/lib/archive-plan.js`, `scripts/lib/archive-transaction.js`, CLI `scripts/archive-transaction-run.js`) valida gates/fingerprints/hashes, stagea bajo `.ospec/archive-tx/{change}/`, compara bytes, hace commit atómico y borra el origen solo tras full match, con journal, rollback, recovery y receipt.
- **Baseline OpenSpec**: dominios nuevos `archive-plan-contract` y `archive-transaction-runtime`; deltas en `agents` (REQ-agents-008 → invocación de runtime con receipt) y `skills` (Plan-and-Report, Cost en receipt, fingerprints en preflight).
- **`renameWithFallback`**: export aditivo en `atomic-write.js` para rename de directorio con fallback Windows `EPERM`/`EEXIST`.

### Security
- **Path confinement fail-closed** en plan/CLI/runtime (`../`, absolutos, domain traversal).
- **Override de quality-gates** ligado al mismo approval o al subárbol `gates.quality-gates.override` (sin regex fail-open de documento completo).

### Changed
- Commit mid-flight con journal `committing`, retención de `.bak`/`created_by_tx` para rollback, `done` antes de `rm(origin)`, y fixtures FS de Compare A/B, kill/resume y rollback post-commit.
- Roadmap: O6A entregado; siguiente en ruta crítica **O2B** (baseline fixed-policy).

### Docs
- ADR `adr-20260726-001` … `adr-20260726-006` (staging/journal, validador puro, renameWithFallback, failure_reason vs plan codes, preflight runtime-owned, paridad Go N/A).
- Change archivado: `openspec/changes/archive/2026-07-26-hybrid-archive-transaction-runtime/`.

## [2.34.0] - 2026-07-25

### Added
- **Target nativo Cursor (sexto host)**: perfil `scripts/lib/target-profiles/cursor.js`, transform `to-mdc` / hooks camelCase / `readonly` en review-*, `toolMap` Cursor (`Read`, `Write`+`StrReplace`, `Grep`+`Glob`, `Shell`, `Task`) con degradación del ask-tool a chat estructurado.
- **Instalación generator-first**: `npm run build:cursor` → `dist/cursor`; `npm run setup:cursor` / `reload:cursor` → `scripts/configure/install-cursor.js` sincroniza `~/.cursor` expandiendo `__OSPEC_CURSOR_ROOT__`.
- **Validador y golden Cursor**: `validate-cursor.js`, fixtures `scripts/configure/__fixtures__/golden/cursor/`, matriz de seis targets en `check.js` / real-repo / parity.

### Changed
- **Baseline OpenSpec**: sincroniza deltas en `generator` (`REQ-generator-006`–`009`), `install` (`REQ-install-004`–`007`), `agents` (`REQ-agents-017`) y `hooks-runtime` (`REQ-hooks-runtime-001`).
- **Seguridad del instalador**: assert por destino (anti-symlink anidado), re-check pre-write, quote siempre en hooks, fail-closed si falta `hooks.json`, abort no-cero ante fallo parcial.

### Removed
- **`scripts/sync-cursor.js`**: retirado; `setup:cursor` ya no usa sync ad-hoc.

### Docs
- ADR `adr-20260725-006` … `adr-20260725-009` (to-mdc, sourceRoots AGENTS.md, frontmatter Cursor, instalador dedicado)
- Change archivado: `openspec/changes/archive/2026-07-25-cursor-native-target/`

## [2.33.0] - 2026-07-25

### Added
- **Fast path Strict TDD de evidencia (O4.2)**: reparación fail-closed limitada a gaps de formato con identidad de candidato congelada, allowlist de evidencia y un solo focal recheck.
- **Provenance histórica content-addressed**: modo `historical` autentica snapshots append-only bajo `.ospec/strict-tdd-historical/`; tampering, refs ausentes o corruptas fallan cerrado sin comparar bytes del working tree.
- **Política canónica de tiers en `models.yaml`**: partición SDD 5/6/6 y paridad de generación en los cinco targets; `enforceModelPolicy` deja de ser bypass público.

### Changed
- **Baseline OpenSpec**: sincroniza deltas en `agents` (`REQ-agents-016`), `routing` (`REQ-routing-006`), `skills` (`REQ-skills-008`), `generator` (`REQ-generator-005`) y `sdd-document` (`REQ-sdd-document-001`, tier `cheap`).
- **Cierre 4R remediation-v2**: el último slice `historical-provenance` de O4.2 pasa validación dirigida; lineage `approved` con `all-remediation-slices-passed`.

### Docs
- ADR `adr-20260725-003-structured-strict-tdd-evidence-is-authoritative`
- ADR `adr-20260725-004-freeze-evidence-remediation-in-independent-pure-reducer`
- ADR `adr-20260725-005-treat-models-yaml-as-canonical-model-tier-policy`
- Change archivado: `openspec/changes/archive/2026-07-25-strict-tdd-evidence-remediation-fast-path/`

## [2.32.0] - 2026-07-25

### Added
- **Remediación 4R por slices (remediation-v2)**: presupuestos y validación independientes por causa raíz; slices passed solo se reabren con evidencia de regresión atribuible (`impacted_slices`).
- **Migración determinista O4.2 / schema-v1**: partición aditiva e idempotente a slices; falla cerrada si `regression.detected: true` no trae impactos atribuibles.
- **Telemetría de phase-cost para 6 agentes review**: allowlist JS/Go alineada para el ciclo de revisión selectiva.

### Changed
- **`createSuccessor`**: exige `authority_kind` allowlisted (`new-candidate` | `new-scope` | `new-discovery-authority`) también sobre predecesores no migrados a v2.
- **`validateSliceCorrection`**: binding exclusivo al `active_slice_id` / `pending_correction.slice_id`; paridad fail-closed con v1 en outcomes y `regression.evidence`.
- **Baseline OpenSpec**: sincroniza deltas en `routing`, `agents`, `skills` y `hooks` tras archivar `review-remediation-slices`.

### Fixed
- Binding no acotado de `activeSlice` que permitía validar un slice ready no activo.
- Fail-open de validación v2 ante regression omitida o `detected:true` sin `impacted_slices`.

### Docs
- ADR `adr-20260725-001-independently-version-slice-remediation`
- ADR `adr-20260725-002-correction-authority-root-cause-slice-scoped`
- Change archivado: `openspec/changes/archive/2026-07-25-review-remediation-slices/`

## [2.31.0] - 2026-07-18

### Changed
- **[Escalado adaptativo de revisión] (Routing)**: Los cambios `normal` con 0 señales no despachan especialistas, con 1 o 2 ejecutan revisión dirigida y con 3 o 4 escalan a profundidad `strict` con cobertura 4R completa, sin descartar dimensiones positivas.
- **[Auditoría de profundidad y escalado] (Review gate)**: `scripts/lib/review-dimensions.js`, `scripts/lib/review-gate-state.js` y la baseline `openspec/specs/routing/spec.md` persisten la profundidad y el motivo determinista de escalado, conservando el generalista inicial, el fingerprint de evidencia y el linaje acotado.
- **[Trazabilidad SDD y verificación] (OpenSpec)**: El change archivado `review-signal-overflow-escalation`, ejecutado por la ruta `standard` con Strict TDD y compuerta 4R, sincroniza la baseline de routing y el ADR `adr-20260718-005-persist-explicit-review-depth-and-overflow-reason.md`; la verificación focal pasó 40/40 y la suite completa 1375/1377, con 2 skips ambientales y 0 fallos.

## [2.30.0] - 2026-07-18

### Added
- **Compuerta de revisión generalista (O5)**: Ejecuta una compuerta generalista de lectura exclusiva (`review-change`) antes de invocar a los especialistas, derivando la necesidad de despacho de forma estructurada.
- **Despacho selectivo de especialistas (O4)**: Limita la ejecución a un subconjunto de 0 a 2 dimensiones especialistas para cambios normales basándose en prioridades de evidencia deterministas, y los 4 especialistas para cambios de alto riesgo.
- **Máquinas de estado y linaje de revisión acotado (O4)**: Implementa reducciones puras en `review-gate-state.js` y `review-lineage.js` que congelan la génesis, el presupuesto de líneas y limitan las correcciones dirigidas a 3 intentos, previniendo bucles infinitos de revisión.
- **Paridad de targets en revisión**: Integra la compuerta generalista y validación de linaje en claude, vscode, github-copilot, opencode y codex.

### Fixed
- **Target VS Code**: el generador interpreta listas YAML multilínea y entradas estructuradas de `models.yaml`, incrustando los modelos configurados sin producir `[object Object]`.
- **Binding O1 en Windows**: las comprobaciones de identidad de archivos toleran la diferencia de `dev` entre `lstat` y `fstat`, manteniendo la validación del inode y del contenido del transcript `codex-events`.

### Tests
- **Verificación del hotfix y linaje**: `npm test` completó todos los checks con 0 errores y 0 warnings.

## [2.29.1] - 2026-07-15

### Fixed
- **Telemetría de costes por fase**: el runtime Go normaliza los eventos
  `token_count` del host, mantiene índices globales entre relanzamientos y
  evita ejecutar callbacks sin adquirir el lock.
- **Persistencia de artefactos**: la telemetría phase-cost se conserva durante
  las pruebas y el change archivado incluye el bloque Cost agregado por fase.

## [2.29.0] - 2026-07-15

### Added
- **Clarify condicional (O3)**: `sdd-spec` emite señales estructuradas de ambigüedad y el
  orquestador solo despacha `sdd-clarify` cuando alguna lo justifica; una spec estándar
  bien definida continúa directamente a diseño.
- **Envelopes fail-closed por fase**: la validación rechaza señales ausentes o mal tipadas
  en resultados exitosos de `sdd-spec` antes de persistir estado o despachar fases
  posteriores, sin romper el fallback de envelopes genéricos.

### Changed
- **Paridad del contrato en runtimes y targets**: JavaScript y Go aplican el mismo orden
  determinista de validación, y los cinco targets generados preservan la decisión
  condicional de clarify.
- **Trazabilidad SDD y remediación 4R acotada**: el change
  `make-clarify-conditional` cerró 20/20 tareas y 11/11 escenarios; los hallazgos de
  Reliability se corrigieron y revalidaron sin reabrir reviewers sin hallazgos.

### Tests
- **Verificación final**: `npm test` pasó 1306/1308 pruebas con 2 skips esperados y
  `go test -count=1 ./...` pasó los 9/9 paquetes.

## [2.28.0] - 2026-07-14

### Added
- **Configuración de agentes (Codex target)**: Soporte para la emisión del parámetro `model_verbosity` en los TOML de agentes de Codex, permitiendo el control fino de la verbosidad de salida de los modelos según la configuración de tiers en `models.yaml`.
- **Reconciliación global de especificaciones (SDD Reconcile)**: Ejecución de la fase de reconciliación global (`sdd-reconcile`) sobre los 8 dominios con desviaciones detectadas (`routing`, `skill-registry`, `install`, `generator`, `hooks`, `skills`, `agents`, `sdd-document`), sincronizando de forma aditiva las especificaciones con los cambios de código y actualizando el registro en `manifest.md`.

### Added
- **Benchmark de cambios de referencia (O2)**: catálogo canónico de nueve perfiles,
  runner con métricas run-level, identidad fuerte de cache, recuperación offline y
  publicación atómica de la baseline solo cuando existe evidencia comparable 3/3.
- **Evidencia diagnóstica y seguimiento operativo**: conserva observaciones no
  comparables fuera de la baseline y documenta la separación entre infraestructura
  verificable y ejecución live posterior.

## [2.26.0] - 2026-07-12

### Added
- **Telemetría de coste por dispatch (fase O1)**: Registro de métricas detalladas de tokens (prompt, artefactos, salidas de herramientas y salida de modelos), duración en milisegundos, tier del modelo, estado de relanzamiento y timestamp en `phase-costs.jsonl`. Garantiza paridad entre las implementaciones de JS y Go y aislamiento frente a fallos de I/O.
- **Visualización de costes en Archive**: Integración del bloque agregador `Cost` en `archive-report.md` para mostrar las invocaciones, relanzamientos, duración acumulada y consumo de tokens por categoría para cada fase del flujo SDD.

## [2.25.4] - 2026-07-11

### Fixed
- **Target Codex nativo y global**: `setup:codex` instala agentes, skills y hooks directamente en la configuración global de Codex, sin marketplace ni plugin residual. Los hooks de `SessionStart` y `PreToolUse` emiten ahora el protocolo nativo válido de Codex.
- **Sincronización idempotente de skills por agente**: cada agente instalado referencia exclusivamente su skill homónima; el instalador compara el contenido completo y solo actualiza las skills que difieren, conservando los recursos ajenos. El runtime ya no duplica skills y elimina el perfil TOML obsoleto del orquestador, cuya configuración pertenece a `AGENTS.md`.

## [2.25.3] - 2026-07-11

### Fixed
- **Instalación global de Codex adaptada a AGENTS.md**: corregida la ruta de destino global en el instalador para que apunte a `~/.codex/AGENTS.md` de acuerdo con la especificación oficial, manteniendo `agent.md` a nivel de proyecto local para el orquestador.

## [2.25.2] - 2026-07-11

### Fixed
- **[Límite de delegación generada] ([Agents])**: los perfiles de agentes generados emiten `[agents] max_depth = 1` desde `scripts/lib/target-profiles/codex.js` y `scripts/lib/target-transform.js`, evitando la delegación recursiva y preservando una capa coordinador-trabajador. Cambio guiado por SDD (ruta standard) con TDD estricto y gate 4R. Verificación: 120 pruebas enfocadas y `npm test` en PASS.

## [2.25.1] - 2026-07-10

### Fixed
- **Instalación Codex idempotente frente a MCPs y marketplaces preexistentes**: `setup:codex` reutiliza servidores con el mismo `command` + `args`, preserva colisiones de nombre y no intenta reemplazar un marketplace `ospec-tools` ya registrado desde otra fuente.
- **Payload MCP nativo para Codex**: el plugin Codex deja de empaquetar el `.mcp.json` camelCase heredado; Context7 y MarkItDown se registran una sola vez mediante `codex mcp` con IDs compatibles (`context7`, `markitdown`). El validador bloquea `.mcp.json`/`mcpServers` residuales y el generador elimina artefactos stale.
- **Setup local compatible con Codex 0.144.1 en Windows**: el catálogo se genera en `.agents/plugins/marketplace.json` con el schema documentado y los shims npm `.cmd` se ejecutan a través de Node sin habilitar shell.

## [2.25.0] - 2026-07-10

### Added
- **Contrato del payload publicado para Codex (change `codex-target-phase-2`)**: el manifiesto del target (`.codex-plugin/plugin.json`) retiene metadata (`name`/`version`/`description`) y emite todos los paths de componentes (`skills`, `mcpServers`, `hooks`) en forma segura relativa a `./`, rechazando traversal (`..`) y rutas absolutas en `target-transform.js`. `validate-codex.js` endurece el gate correspondiente y añade validación de ids de servidores MCP contra `^[a-zA-Z0-9_-]+$` como fallo duro de generación.
- **Wrapper de hooks de 5 eventos con adaptador POSIX/Windows**: `codexHooks` envuelve cada uno de los cinco eventos soportados (`SessionStart`, `PreToolUse`, `PreCompact`, `SubagentStop`, `Stop`) en grupos `{matcher, hooks:[{command, commandWindows, timeout}]}`, con paridad Go/JS íntegra (`internal/hooks/pretooluse.go`, `internal/hooks/subagentstop.go`).
- **Alias de transcript y contrato de PreToolUse sin `ask`**: `SubagentStop` acepta `input.agent_transcript_path` como alias del campo estándar; `PreToolUse` degrada decisiones `ask` a `allow` + mensaje advisory cuando el wrapper generado señaliza el target mediante dos variables de invocación combinadas (ver *Security* abajo).
- **Instalación separada e idempotente de plugin y agentes TOML**, documentada en `docs/codex/README.md` (instalación/actualización, revisión y confianza de hooks vía `/hooks`, flujo de tarea nueva, rollback) y verificada con un smoke test end-to-end (`codex-smoke.test.js`) contra el payload generado e instalado en un directorio temporal.
- 10 nuevos requisitos + 1 modificado sincronizados a los dominios baseline `generator`, `hooks`, `install` y `agents` (18 escenarios), y 3 ADRs promovidas a `docs/adr/`.

### Security
- **Degradación ASK→allow ya no depende únicamente de una variable de entorno de sesión**: tras un hallazgo CRITICAL del gate de revisión (riesgo de fuga por variables de entorno residuales de shell/CI), la degradación exige ahora DOS señales por invocación — el selector de target y un marcador inline (`OSPEC_CODEX_WRAPPER=1`) que el propio wrapper generado inyecta en cada comando — aplicado en paralelo en el hook JS y su espejo Go.
- **Guard de atribución de IA en mensajes de commit portado al hook Go**: cerrado un hueco de paridad que permitía que un `git commit` con atribución de IA pasara sin bloqueo cuando se despachaba vía el binario Go (`internal/hooks/pretooluse.go`), en vez de solo vía el hook JS.

## [2.24.0] - 2026-07-09

### Added
- **Distribución de Marketplace para Codex (Marketplace)**: Nuevo flujo de empaquetado en `codex-marketplace.js` que aísla y ensambla el marketplace de Codex en `plugins/codex/ospec-workflow` de forma independiente a Claude. Verificación: tests unitarios en `codex-marketplace.test.js` y workflow de GitHub Actions actualizados.
- **Tiers y Modelos para Codex (Models)**: Actualización de `models.yaml` para incorporar la familia OpenAI GPT-5.6 (`gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`) con inyección de `model_reasoning_effort` y `model_verbosity` según el tier. Verificación: test de contrato en `real-repo.test.js`.

### Fixed
- **Remoción de Configuración Automática de Codex (Configure)**: Eliminación de la creación y fusión destructiva de `.codex/config.toml` en `install-codex.js` para evitar colisiones con claves del usuario; el validador de Codex `validate-codex.js` ahora prohíbe explícitamente la presencia de este archivo. Ciclo SDD completo: change `fix-codex-config-toml` verificado con Strict TDD y suite de 106 tests integrados en verde.

## [2.23.0] - 2026-07-09

### Added
- **Soporte del target de Codex (Bloques 5.1 a 5.4)**: nuevo perfil de target `codex` en `target-profiles/codex.js` consumido por `target-transform.js`, que genera el bundle de plugin `.codex-plugin/plugin.json` y transforma los markdown de agentes a TOML en `.codex/agents/` con mapeos de tiers a modelos y sandbox_mode automático.
- **Puente de hooks para el target Codex (Bloque 5.2)**: transforma `hooks/hooks.json` a PascalCase y reescribe `${CLAUDE_PLUGIN_ROOT}` a `$PLUGIN_ROOT` en la invocación de los hooks.
- **Instalador y Distribución de Codex (Bloque 5.3)**: nuevos comandos de instalación local (`npm run install:codex`) e instalador global (`npm run setup:codex`), que compilan, copian los TOML de agentes a `~/.codex/agents/` y realizan la fusión no destructiva de la configuración en `.codex/config.toml`.
- **Columna de modelos en models.yaml (Bloque 5.4)**: añadida la columna `codex` que mapea la familia OpenAI GPT-5.6 (`premium: { model: gpt-5.6-sol, model_reasoning_effort: high }`, `default: gpt-5.6-terra`, `cheap: gpt-5.6-luna`), con soporte para parsear e inyectar `model_reasoning_effort`.
- **Robustez y legibilidad en transform**: validaciones explícitas de argumentos en `transform()`, aplanado de anidamientos condicionales a un nivel máximo de 3 en `handleAgentToml`, y ampliada la suite de pruebas unitarias cubriendo todos los flujos de error de formato y validaciones en `target-transform.test.js`.

### Fixed
- **Seguridad en la ejecución y rutas de Codex**: resolución absoluta de binarios mediante variables `PATH` en Windows (previniendo binary planting en CWD) y validación defensiva contra TOCTOU e infiltración por symlinks en la instalación a nivel de archivo de agente individual.
- **Cierre 4R del puente de hooks Codex**: endurecidos los caminos de error para evitar validaciones fail-open: `validate-codex` convierte archivos/directorios ilegibles y hooks malformados en errores de validación, el checker I3 reporta perfiles Codex inválidos o no cargables, `codexHooks()` valida entradas antes de transformar comandos, y `withFileLock()` falla en cerrado ante fallos persistentes de lock en Windows. Cobertura añadida para `scripts/check.js`, `validate-codex`, `i3-budget-constant`, `target-transform` y `ospec-state`.

## [2.22.0] - 2026-07-08

### Added
- **Suite de evals golden del orquestador (cierre del ítem 2.1 del roadmap, Bloque 2)**: nueva capability `orchestrator-evals` bajo `scripts/evals/` con 7 escenarios golden (4 del núcleo del orquestador — petición vaga → intent restatement, high-risk → clarify, verify FAIL spec-gap → ruta a sdd-spec, apply design-mismatch → blocked — y 3 de `sdd-document` — gate batcheado de idioma+scope, update sin cambios → no-op, write fuera de sandbox → blocked). Harness *agent-assisted*: Node (`run.js`, `lib/{fixtures,capture,assertions}.js`) resuelve setup/aserción/reporte, mientras un turno de agente real ejecuta el orquestador (nunca mock ni replay de transcript), habilitando subir de versión el modelo en `models.yaml` con evidencia objetiva. Aserciones exclusivamente estructurales (ruta, `blocker_type`, artefactos, campos de `state.yaml`, forma de `question_gate`) — nunca sobre prosa, para tolerar variación entre modelos. `run.js` queda fuera del glob `--test` de CI por diseño (ADR-004); solo la librería pura de aserciones/fixtures se ejecuta en `npm test`.
- Nuevo dominio baseline `openspec/specs/orchestrator-evals/spec.md` (4 requirements).

### Fixed
- **Reutilización silenciosa de fixtures corruptas a medias**: `materializeFixture`/`applyGitBaseline` ahora escriben un marcador de materialización completa (`.eval-capture/materialized.json`) solo tras un éxito íntegro; `run.js` lo exige antes de reutilizar un workspace, evitando puntuar contra un fixture a medio copiar o con el baseline de git a medias tras un fallo de disco/permiso.
- **Path traversal potencial en el marcador `GIT-BASELINE.json`**: guard de contención (`resolveContainedPath`) antes de consumir rutas relativas declaradas en `gitHead_files`/`post_baseline_untracked`.
- **Proxy débil en el escenario `document-update-noop`**: nuevo matcher `expect.fileTreeUnchanged`/`baselineFileTree` en `assertions.js`, que detecta aparición silenciosa de archivos de salida nuevos (antes solo se verificaba `state.last_updated`).

## [2.21.0] - 2026-07-07

### Added
- **Lint de contratos unificado (cierre del Bloque 1 del roadmap)**: nuevo `scripts/lib/contract-lint.js` (registro puro de checkers, sin cortocircuito) con tres checkers — `i1-manifest` (nuevo: cruza el manifiesto `runtime_capabilities:` del frontmatter de los 14 SKILL.md de fase SDD contra las `tools:` reales del agente vinculado en `agents/{nombre}.agent.md`, emitiendo un offender explícito si el agente vinculado a un phase skill no existe en disco), `j1-commands-agents` (extracción de `scripts/commands-agents-contract.test.js` preservando sus guards rel-1/rel-2) e `i3-budget-constant` (extracción/generalización de la coherencia hooks.json↔constantes de lock JS+Go de `scripts/lib/ospec-state.test.js`). Sin vía de invocación nueva: el arnés `scripts/contract-lint.test.js` queda recogido por el glob existente de `scripts/check.js` (pre-commit + CI ya cableados).
- **Manifiesto `runtime_capabilities:` en los 14 SKILL.md de fase SDD**: retrofit obligatorio para ese tier (1:1 vinculado a su agente), calibrado contra las tools reales (`REQ-skills-001`); utility/stack/`_shared` quedan `OPTIONAL` en este change (fallback ausente=false).
- **Categoría de evidencia `static-lint`** en la taxonomía de `sdd-verify` (`REQ-skills-002`), distinta de `runtime-test`, para que un contract test estático no cuente como evidencia de comportamiento cuando el spec exige ejecución real.
- Nuevo dominio baseline `openspec/specs/contract-lint/spec.md` (7 requirements).

## [2.20.3] - 2026-07-07

### Fixed
- **Coerción boolean-like residual en `matchConditions` (I2)**: nueva función pura exportada `detectResidualBooleanStrings(conditions)` en `route-dispatcher.js` para detectar valores `"true"`/`"false"` string que no pasaron por la coerción del parser (p.ej. tablas de routing construidas programáticamente en vez de parseadas desde YAML), evitando que condiciones `bugfix`/`refactor`/`hotfix` caigan silenciosamente al route `standard`. Test de regresión end-to-end contra la tabla real de `openspec/config.yaml`.
- **Desalineación entre el presupuesto de timeout del hook `SessionStart` y el `staleMs` del lock (I3)**: `staleMs`/`staleLockAge` bajado de 10s a 5s en ambos runtimes (`ospec-state.js` y `internal/store/store.go`, con constantes nombradas), y `hooks/hooks.json` ahora declara `timeout: 5` explícito para `SessionStart` (antes era el único hook sin timeout declarado). Nuevo test de coherencia hooks.json↔constantes de lock en JS y Go.

### Changed
- Sincronizados `openspec/specs/routing/spec.md`, `openspec/specs/hooks/spec.md` y `openspec/specs/hooks-runtime/spec.md` con el comportamiento anterior.

## [2.20.2] - 2026-07-07

### Added
- **Soporte de diagramas Mermaid en scaffold de Starlight (Opción D)**: Añadidas las dependencias `astro-mermaid` (v^2.1.0) y `mermaid` (v^11.16.0) al [package.json](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/skills/sdd-document/assets/web-doc-template/package.json) del scaffold y registrado el plugin `mermaid()` en su [astro.config.mjs](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/skills/sdd-document/assets/web-doc-template/astro.config.mjs) (posicionado antes de `starlight()`). Esto habilita el renderizado nativo client-side de diagramas en bloques de código ` ```mermaid ` para cualquier nueva inicialización de documentación con la Opción D, sincronizado con la instancia local de `web-doc/`. Tests: paso verde de la suite de contratos estáticos de `starlight-web-doc` y compilación local exitosa con empaquetado de chunks específicos de diagramas (stateDiagram, erDiagram, etc.).

### Fixed
- **Error de parseo got 'PS' en diagrama Mermaid**: Corregido error de sintaxis en el diagrama de arquitectura de [overview.md](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/openwiki/architecture/overview.md) envolviendo las etiquetas con caracteres especiales (paréntesis, comas, barras) entre comillas dobles, de modo que el motor de Mermaid no confunda la sintaxis del parser.

## [2.20.1] - 2026-07-07

### Fixed
- **Enlaces wiki-internos rotos en el sitio Starlight (Opción D)**: `sync-openwiki.mjs` copiaba los enlaces `.md` tal cual, pero Starlight sirve las páginas como slugs sin extensión, así que cada enlace interno (`architecture/overview.md`) devolvía 404. Ahora `rewriteLinks` los reescribe a URLs de slug locales (`/architecture/overview/`), resolviendo los relativos contra el directorio de la página contenedora, preservando fragmentos `#ancla` y dejando intactos los enlaces externos y los assets no-`.md`. Además, un enlace "bare" anclado a la raíz del wiki (`hooks-runtime/lifecycle.md` escrito dentro de `security/guardrails.md`) ya no se anida bajo el directorio de la página: el set de páginas fuente reales desambigua — si el candidato relativo a la página no existe pero el anclado a raíz sí, gana la raíz; si ambos existen, se mantiene la semántica markdown estándar. Tests: +7 casos runtime en `sync-openwiki.test.js` (slug local, `../` relativo, ancla, prefijo `/openwiki/`, fallback a raíz, preferencia por hermano existente, externos/assets intactos).

### Changed
- **Instancia local `web-doc/`**: sincronizada con el script corregido y con un logo (`src/assets/ospec-logo.png`) enganchado como `logo` y `favicon` de Starlight a la izquierda del título del sitio. El wiki `openwiki/` se regeneró en español (modo init, Opción D).

## [2.20.0] - 2026-07-07

### Added
- **Identidad del sitio y navegación ordenada en el template Opción D** (REQ-sdd-document-019, REQ-016 ampliado): `astro.config.mjs` deriva el título del sitio del `name` del `package.json` del repo padre (Title-Case por segmento, con fallback al nombre del directorio) en vez del placeholder "Project Documentation"; `sync-openwiki.mjs` recorta el H1 inicial del cuerpo transformado (Starlight ya renderiza el `title` del frontmatter como H1, que se veía duplicado en cada página) y emite `src/sidebar.generated.json` — quickstart siempre primero como enlace superior y un grupo por subdirectorio del wiki, ordenados por primera mención en los enlaces del propio quickstart (alfabético para los no mencionados) — que `astro.config.mjs` consume con fallback al sidebar autogenerado si falta. Tests: +3 casos runtime en `sync-openwiki.test.js` y +3 anclas en `starlight-web-doc-contract.test.js`.

### Fixed
- **Falsos positivos del chequeo de atribución AI con palabras en español**: el patrón de `commit-msg-hook.js` y `pre-tool-use.js` matcheaba nombres de vendor como subcadena, con lo que «coherente», «coherencia», «bombardeo» o «llaman» bloqueaban commits legítimos. Los nombres de vendor quedan anclados a límites de palabra (`\b`), con tests de regresión en ambos sentidos y el patrón documentado en `rules/no-model-attribution.instructions.md` actualizado.

## [2.19.1] - 2026-07-07

### Fixed
- **Template Opción D (`web-doc/`): scaffold generado crasheaba en runtime** (change `fix-web-doc-scaffold-paths`, ruta lite con Strict TDD): `content.config.ts` vivía en la raíz del template pero Astro 5 solo lee la config de colecciones desde `src/content.config.ts`, con lo que la colección `docs` cargaba sin el schema de Starlight y toda petición reventaba con `Cannot read properties of undefined (reading 'hidden')` en `utils/navigation.ts` (incluida la ruta 404). Además el import `@astrojs/starlight/loader` (singular) no existe en el paquete publicado — solo exporta `./loaders`. Se mueve el archivo a `src/`, se corrige el import y se añade `redirects: { "/": "/quickstart" }` en `astro.config.mjs` para que la raíz del sitio no dé 404. Sincronizados `option-d-starlight.md` §3, el baseline REQ-sdd-document-014 (delta MODIFIED archivado en `openspec/changes/archive/2026-07-07-fix-web-doc-scaffold-paths/`) y el test de contrato `scripts/starlight-web-doc-contract.test.js` (11 anclas: ruta `src/`, import plural obligatorio/singular prohibido, redirect raíz), con ciclo RED→GREEN verificado en runtime.

## [2.19.0] - 2026-07-06

### Added
- **Opción D "OpenWiki + Starlight web" en `sdd-document`** (change `starlight-web-doc`, ciclo SDD completo con gate 4R remediado): nueva opción de scope en el gate batcheado de idioma+scope que genera `web-doc/` en la raíz del repo objetivo como proyecto Starlight cascarón — scaffold estático copiado verbatim desde `skills/sdd-document/assets/web-doc-template/` (package.json, astro.config.mjs, content.config.ts, tsconfig.json, CSS custom), nunca ejecuta `npm create astro` ni instala dependencias (REQ-sdd-document-014). `openwiki/` permanece como única fuente de verdad: el script `web-doc/scripts/sync-openwiki.mjs` (Node ESM zero-dependency, cableado en `predev`/`prebuild`) transforma el wiki a `src/content/docs/` con inyección de frontmatter `title` (REQ-016), reescritura de enlaces fuente a la URL del remote `origin` sobre la rama por defecto (REQ-017) y paridad estricta 1:1 con poda de huérfanos (REQ-018). Sync incremental por mtime/hash con cache local git-ignored (REQ-015). Sandbox de escritura dual modelado como SET `{openwiki/, web-doc/}` con inventario post-run J5 del orquestador extendido a multi-directorio (REQ-sdd-document-002/006/011, REQ-agents-006). Degradaciones seguras endurecidas por el gate 4R: guard anti-poda-destructiva cuando `openwiki/` falta o está vacío, passthrough de frontmatter YAML anidado sin pérdida, try/catch por página/cache/poda con warnings (nunca tumba el build del usuario final) y fallbacks logueados. Procedimiento del ejecutor en `skills/sdd-document/references/option-d-starlight.md`; 3 ADRs promovidos a `docs/adr/`. Tests: `scripts/sync-openwiki.test.js` (18 casos runtime sobre proyecto materializado en temp dir) y `scripts/starlight-web-doc-contract.test.js` (9 anclas estáticas de contrato).
- **Skill `stack-starlight`**: base de conocimiento del framework Starlight (Astro) — setup, configuración, sidebar, frontmatter, componentes, theming e i18n — con 4 documentos de referencia; fuente técnica de la plantilla de la Opción D.

## [2.18.0] - 2026-07-06

### Added
- **Harden de archivado y baseline fingerprints (Bloque 1.2 / I1)**: formalización del contrato en el que la finalización y borrado del directorio de origen en `sdd-archive` es propiedad exclusiva del orquestador (REQ-agents-008). El executor de `sdd-archive` se limita a sincronizar specs, escribir el reporte de archivo y copiar los artefactos, retornando un inventario de copias detallado en su envelope. El orquestador realiza una verificación/diff recursivo de inventario (presencia y contenido por hash/bytes) contra el disco físico antes de proceder con el borrado. Asimismo, el cálculo y registro del SHA-256 de las especificaciones baseline touched (`touched_baseline_domains`) pasa a ser responsabilidad standing inline del orquestador inmediatamente después del éxito de `sdd-spec` (REQ-agents-009), eliminando el patrón manual de assumptions por fingerprints no registrados. Nuevo test de contrato `scripts/archive-move-fingerprint-contract.test.js` y extensión de sentinels de límites en `scripts/configure/real-repo.test.js` (manteniendo el guard del orquestador < 500 líneas en 497 líneas). Ciclo SDD completo: deltas de `agents` (2 ADDED) y `skills` (1 MODIFIED + 1 ADDED) sincronizados al baseline y change archivado en `openspec/changes/archive/2026-07-05-harden-archive-move-fingerprints/`.

## [2.17.0] - 2026-07-05

### Added
- **Cableado del orquestador para `sdd-document` (J1+J4+J5)**: el orquestador ahora enruta `/sdd-document` de punta a punta. Wiring mínimo inline (allowlist de `agents:`, bullet en el índice de comandos y fila en la Circumstantial Handler Pointer Table — bajo el guard de 500 líneas) con el protocolo completo en `skills/_shared/route-document.md`: gate único batcheado de idioma+alcance (J4) con persistencia en approval ledger (`gate: document-init`) y `.last-update.json` (incluye `doc_language`/`scope_choice`), pre-pregunta keep/change en modo update con regla de precedencia entre candidatos, resolución autoritativa del output dir por el orquestador (A→`openwiki/`, B→`docs/wiki/`, C→custom con rechazo de paths fuera del repo antes de delegar), y verificación de sandbox post-run propiedad del orquestador (J5) scoped por `git status`, con gate de halt abort/acknowledge y política de fallo inconcluso cuando `git status` falla. Nuevo test de contrato `scripts/commands-agents-contract.test.js` que parsea la tabla §3.2 Command Roster del spec de `agents` (flechas `→` y `->`), falla ante filas del roster faltantes o comandos sin fila, y asserta explícitamente la presencia de `sdd-document.prompt.md`. Gate 4R con remediación completa (1 CRITICAL + 6 WARNING + 2 SUGGESTION) y re-verificación PASS. Ciclo SDD completo: deltas de `agents` (3 ADDED) y `sdd-document` (3 MODIFIED) sincronizadas al baseline y change archivado en `openspec/changes/archive/2026-07-05-wire-sdd-document/`.

## [2.16.0] - 2026-07-05

### Added
- **Agente documentador `sdd-document`**: nuevo executor (`agents/sdd-document.agent.md` + `skills/sdd-document/SKILL.md` + comando `/sdd-document`) que compila arquitectura, specs y estado del repo en un wiki Markdown local. Gate interactivo de alcance al lanzar: Opción A — wiki técnico completo estilo OpenWiki (`quickstart.md` + `openwiki/` con subdirectorios temáticos y source maps), Opción B — estado SDD y specs bajo `docs/wiki/`, Opción C — ruta custom validada. Reglas de sandbox de escritura (paths relativos al output dir, sin escapes; excepciones declaradas para `/AGENTS.md` y `/CLAUDE.md` como archivos de instrucción raíz), registro en `models.yaml` (tier default) y suite de contrato `scripts/sdd-document.test.js`. Ciclo SDD completo (dogfooding): baseline nuevo `openspec/specs/sdd-document/spec.md` (13 REQs), delta de `agents` sincronizada y change archivado en `openspec/changes/archive/2026-07-05-add-documenter-agent/`. Nota: el cableado del orquestador (roster/route) llega en el change siguiente (J1).

## [2.15.0] - 2026-07-04

### Added
- **Telemetría de costo por fase (C3)**: el hook `SubagentStop` (JS y Go, paridad byte a byte) persiste una fila JSONL por dispatch de fase en `.ospec/session/{change}/phase-costs.jsonl` vía `appendPhaseCost`/`AppendPhaseCost` — `phase`, `status`, `est_tokens` (heurística `round(utf8ByteLength/4)`, idéntica cross-runtime, etiquetada como estimada) y timestamp — con escritura atómica fail-safe (lock con reclamación de stale-lock, probado con 40 escritores concurrentes). Familia nueva de fixtures de paridad `subagent-stop-phase-cost-*` (floor de SubagentStop 2→4: escenarios active-change y no-active-change). `sdd-archive` agrega un bloque **Cost** al `archive-report.md` (fases despachadas, re-launches derivados de las filas del JSONL, preguntas al usuario desde `state.yaml`, tokens estimados totales) con fallback explícito cuando el JSONL falta o está vacío (ADR-001: fuente de agregación, promovida a `docs/adr/adr-20260704-001`). Contrato del bloque asegurado por `scripts/cost-block-contract.test.js`. Ciclo SDD completo (dogfooding): specs delta de `hooks`/`agents` sincronizadas al baseline y change archivado en `openspec/changes/archive/2026-07-04-add-change-cost-telemetry/`.

## [2.14.2] - 2026-07-04

### Fixed
- **Falsos positivos del agent-shield en el escaneo de credenciales**: el regex genérico de `password/key/token = "..."` usaba `\s*`, que cruza saltos de línea, y matcheaba keywords como substring de otras palabras — un doc con "Key rule:" seguido párrafos después de un string entre comillas disparaba la advertencia de seguridad. El patrón endurecido exige que keyword y valor convivan en la misma línea (`[ \t]*` + `[^"'\n]`) y que la keyword no sea sufijo de otra palabra (`(?:^|[^a-z])`, compatible con RE2; se preservan prefijos legítimos como `db_password` y `api_key`).

### Changed
- **Escaneo de secretos desacoplado y espejado Go/JS**: la clasificación de archivos sensibles (deny/ask por nombre) y el escaneo de contenido salen de los handlers monolíticos hacia módulos dedicados — `scripts/hooks/lib/secret-scan.js` y `internal/hooks/secretscan.go` — con contrato de paridad documentado en `docs/harness-go-js-parity.md`, ids estables por patrón, límite de 1MB compartido y comportamiento fail-open ante errores de lectura. En Go los regexes ahora se precompilan a nivel de paquete (antes se recompilaban en cada invocación del hook) y el deny de `.git/config` se alinea al canon JS (cualquier path `.git/config`, sin scoping por workspace root). Suites table-driven espejadas: `secret-scan.test.js` (34 casos) y `secretscan_test.go`, incluyendo regresión de los falsos positivos multilínea y por substring.

## [2.14.1] - 2026-07-04

### Changed
- **Orquestador adelgazado a <500 líneas (C2)**: `sdd-orchestrator.agent.md` baja de 694 a 490 líneas. Extraídos vía pointer table on-demand: los shapes JSON de delivery-strategy, review-workload y blocked-envelope (`skills/_shared/question-shapes.md`), el manejo del gate de clarify — las condiciones RUNS/SKIP quedan inline (`skills/_shared/clarify-routing.md`) — y el handler de gaps resolution (`skills/_shared/gaps-resolution.md`). Secciones que duplicaban convenciones existentes ahora referencian `approval-ledger.md` y `skill-resolver.md` (Resolution Order y Stack-Skill Candidate Resolution) en vez de repetirlas. La Circumstantial Handler Pointer Table se movió al final del prompt (orden cache-aware: núcleo estable primero, material que crece entre versiones al final). El guard de `real-repo.test.js` ratchetea de 700 → 500 líneas y suma 5 sentinels de no-reinlining para los bloques extraídos.

## [2.14.0] - 2026-07-04

### Added
- **Contrato estricto de result-envelope (C5)**: las fases SDD emiten su envelope de retorno como bloque fenced `json:result-envelope` con JSON estricto directamente parseable (aditivo a la prosa existente, nunca la reemplaza); el hook `SubagentStop` lo parsea, lo valida con un validador dep-free compartido y persiste `summary`/`key_decisions` en `state.yaml` con merge fill-gap y escritura atómica; el orquestador consume los campos estructurados como fuente autoritativa (agents §6.1a). Paridad Go/JS byte a byte generalizada a `SubagentStop` con familia de fixtures propia (patrón E1) y truncado code-point-first antes del escape para seguridad YAML. Ciclo SDD completo (dogfooding): specs delta de `agents`/`hooks`/`skills` sincronizadas al baseline, 3 ADRs promovidas a `docs/adr/` (adr-20260704-001..003) y change archivado en `openspec/changes/archive/2026-07-04-strict-result-envelope/`.
- **Remediación del gate 4R sobre C5**: 8 tareas TDD RED-first cerrando 1 BLOCKER + 2 CRITICAL + 5 WARNINGs de paridad detectados por la revisión 4R post-verify; re-verificación PASS con `npm test` 914/914 y `go test` 8 paquetes en verde.

## [2.13.0] - 2026-07-03

### Added
- **Suite de contrato Go/JS ejecutable (E1)**: las golden fixtures de `internal/testdata/parity/` ahora se verifican en AMBOS runtimes — Go vía `TestPreToolUse_ParityFixtures` (byte a byte) y JS vía el nuevo `scripts/hooks/parity-contract.test.js`, que ejecuta el proceso real del hook contra cada fixture (con prefix-match documentado solo para el sufijo impl-specific del error de parseo JSON). Fixture nueva `pre-tool-use-bypass.json` cubre la degradación por `permission_mode`. Regla operativa en `docs/harness-go-js-parity.md`: ante un mismatch se corrige la implementación rezagada, nunca la fixture sola.
- **Matriz de capacidades y paridad por target (D1/D2)** — `docs/target-capabilities.md`: qué capacidad existe en cada host (preguntas estructuradas, sub-agentes paralelos, background tasks, lifecycle hooks, fallback de modelos), la degradación definida cuando falta (gates → pregunta de chat estructurada; 4R → secuencial), y la tabla de paridad de protecciones que deja explícito que los git hooks locales son la única capa universal — un usuario de vscode/copilot ya no puede asumir protecciones que su host no ejecuta.
- **Onboarding por rol (F2)** — `docs/onboarding/`: tres guías de 10 minutos — tech lead ("qué me garantiza esto", con tabla de garantías auditables), developer ("qué comandos me importan") y reviewer ("cómo leo un change", con orden de lectura y señales de alerta).
- **Punto de entrada en inglés (F1)** — `docs/en/README.md`: overview, garantías, instalación y comandos para evaluación por equipos mixtos; los docs canónicos siguen en español.
- **Test de contrato `scripts/eje-def-contract.test.js`** (7 landmarks de D/E/F).
- **Resúmenes de fase en `state.yaml` (C1)**: al completar cada fase, el agente extiende su entrada en `phases:` con `summary` (≤160 chars, factual, derivado del artefacto) y `key_decisions` (≤3). En continuaciones (`/sdd-continue`, post-compact, nueva sesión) el orquestador arma los prompts desde estos resúmenes en vez de releer artefactos completos — los sub-agentes siguen leyendo los artefactos que su fase exige como dependencia dura, y los changes pre-feature (sin bloque) caen al comportamiento anterior. Ahorro estimado: 60-80% del costo de contexto en resume.
- **Enforcement del presupuesto de compact rules (C4/E3)**: nuevo lint en `scripts/docs-lint.test.js` (corre en pre-commit) que mide los tokens estimados de las `compact_rules` de cada skill descubierta y falla sobre el cap duro de 500 — un skill nuevo con compact rules gordas ya no puede degradar silenciosamente todos los dispatches. `token-budget.md` documenta el cap y la regla de ratchet (solo baja, nunca sube). Estado actual: peor ofensor `tdd-workflow` ≈ 471 tokens.
- **Test de contrato `scripts/eje-c-contract.test.js`**: landmarks de C1/C4 + regeneración de targets en directorio temporal.

## [2.12.0] - 2026-07-03

### Added
- **Gate de colisión entre changes + ownership (B2)**: nuevo handler circunstancial `skills/_shared/gate-change-collision.md` (cableado en el pointer table del orquestador) que, antes de `sdd-apply` y cuando existe otro change activo, compara file scopes y dominios delta; en solape pregunta continuar / coordinar / re-scopear y persiste la decisión (`approvals` + bloque `collisions:`). Bloque opcional `ownership:` en config (dominios → team + globs, `codeowners_sync` advisory). El orquestador estampa `owner:` (autor + rama) en `state.yaml` al crear cada change. Guard de baseline: `sdd-spec` registra `baseline_fingerprints:` (SHA-256 por dominio) y `sdd-archive` bloquea con `blocker_type: stale-baseline` si el baseline se movió desde que se escribió el delta — nunca merge ciego.
- **Trazabilidad REQ → task → commit → test (B3)**: IDs estables `{#REQ-domain-NNN}` en los headings de requirements (`sdd-spec`); las tasks listan los REQs que cubren con tags `[REQ-...]` y todo MUST aparece en al menos una task (`sdd-tasks`); `sdd-apply` añade trailers `Ospec-Change:` / `Ospec-Task:` a los work-unit commits; el hook `commit-msg` los valida de forma advisory con un change activo (o bloquea con `traceability: { trailers: required }` en config); `sdd-verify` emite la **Traceability Matrix** (REQ → tasks → commits → tests) marcando WARNING los REQs sin test vinculado y `tasks-gap` los REQs fuera de toda task.
- **Presets por escala (B5)**: `sdd-init` pregunta la escala una sola vez (vía orquestador) — `solo` (lite-first, sin 4R), `team` (default: defaults actuales + colisión + trailers advisory), `enterprise` (strict TDD + trazabilidad required + mentorship balanced + 4R) — y escribe `scale:` + su preset en `config.yaml`; en re-init preserva el valor existente. Todo sigue siendo editable en config (el preset solo materializa bloques en init).
- **Tests**: `scripts/eje-b-contract.test.js` (14 landmarks + regeneración de targets en temp dir) y 6 tests nuevos del trailer check en `scripts/hooks/commit-msg-hook.test.js`.
- **Mentorship mode (A4)**: bloque opcional `mentorship:` en `openspec/config.yaml` (`mode: mentor | balanced | expert`, default `balanced`; `focus:` opcional). El orquestador lo resuelve una vez por sesión y lo inyecta como una línea por dispatch (`Mentorship mode: {mode}`); la semántica por modo vive en `sdd-phase-common.md` §F — `mentor` añade la sección "Por qué así" (alternativas descartadas + racional) y hasta 1 concepto aprendible; `balanced` da racional solo en decisiones arquitectónicas y gates; `expert` mantiene los resúmenes mínimos actuales. Afecta SOLO prosa hacia el usuario, nunca artefactos OpenSpec (misma frontera que Reply Language Forwarding). Ausencia del bloque = no-op estricto.
- **ADRs cableados al flujo (A5)**: `sdd-design` extrae las decisiones significativas (contrato público, modelo de datos, dependencia nueva o patrón transversal) a `openspec/changes/{name}/decisions/adr-NNN.md` en formato corto (Context / Decision / Alternatives / Consequences); `sdd-archive` promueve los ADRs aceptados a `docs/adr/adr-{YYYYMMDD}-{NNN}-{slug}.md` como memoria viva del proyecto antes del move, conservando las copias change-local en el archivo como rastro de auditoría.
- **Test de contrato `scripts/mentor-adr-contract.test.js`**: landmarks de prosa en orquestador, phase-common, config, design y archive, más regeneración de targets en directorio temporal.

### Fixed
- **Los advisories del hook PreToolUse ahora respetan `bypassPermissions`**: un `ask` devuelto por un hook tiene prioridad sobre el modo de permisos del host, así que AgentShield (contenido con pinta de credencial), el Token Budget Advisor (lecturas >50k y acumulado >150k), el Git Collaboration Guard (commit con árbol sucio o en rama default), el Spec Drift Advisory y las reglas ASK interrumpían al usuario incluso con permisos bypasseados — la razón por la que existían los kill-switches `DISABLE_*`. Ahora el hook lee `permission_mode` del input y, en `bypassPermissions`, degrada todo `ask` advisory a `allow` + `systemMessage` no bloqueante (prefijo `[ospec advisory]`); las reglas `deny` (rm -rf /, force push, atribución AI, claves SSH/.npmrc) nunca se degradan. Paridad Go/Node con tests espejo en ambos runtimes (`scripts/hooks/pre-tool-use.js`, `internal/hooks/pretooluse.go`). Spec: `openspec/specs/hooks/spec.md` §3.4.1.
- **`sdd-archive` Step 5 endurecido — move no es copy**: se explicita que tras el move la carpeta original del change NO debe existir (con procedimiento copy-verify-delete para toolsets sin move), tras detectarse un archive real que dejó ambas carpetas y corrompía el descubrimiento de changes activos.

## [2.11.0] - 2026-07-03

### Added
- **Contrato de recomendación (`openspec/specs/recommendation-contract/spec.md`)**: toda opción `recommended: true` en un `question_gate` DEBE incluir en su `description` el racional (1 línea), el trade-off principal frente a las alternativas y la reversibilidad de la decisión; el `reason` del gate DEBE declarar el costo de equivocarse. Un senior no dice "elegí A": dice por qué, qué se paga por B y si la decisión es reversible. Los ejemplos embebidos en el orquestador y las fases fueron actualizados al nuevo shape.
- **Detección de ambigüedad fuera de clarify (`openspec/specs/ambiguity-detection-boundaries/spec.md`)**: dos límites nuevos que adelantan y atrasan la detección respecto del gate de clarify. *Antes* — intent restatement en Change Classification: cuando la petición del usuario es vaga, el orquestador la reformula en 2-4 líneas y la valida vía `askQuestions` antes de clasificar, eliminando la clase de error más cara (construir lo que no se pidió). *Después* — `sdd-apply` devuelve `blocker_type: design-mismatch` cuando el código real contradice el design (API distinta, dependencia inexistente, patrón incompatible), ruteando de vuelta a `sdd-design` en vez de improvisar workarounds.
- **Formalización del enum `blocker_type`** en el Result Envelope y specs de `agents` (§6.7–§6.10): compliance del contrato de recomendación, intent restatement, design-mismatch.
- **Test de contrato `scripts/recommendation-ambiguity-contract.test.js`**: verifica que orquestador, fases y targets generados documentan el nuevo contrato (48/48 junto a los contratos existentes).

Cambio guiado por SDD (ruta `standard`) con TDD estricto y gate 4R. Verificación: PASS WITH WARNINGS con los 5 hallazgos WARNING del gate 4R corregidos y re-verificados. Rastro de auditoría en `openspec/changes/archive/2026-07-03-recommendation-contract-and-early-ambiguity-detection/`.

## [2.10.0] - 2026-07-02

### Added
- **Assumption Ledger (`openspec/specs/assumption-ledger/spec.md`)**: nueva capacidad que convierte las micro-decisiones silenciosas de los agentes de fase en un rastro auditable. Define el esquema `assumptions[]` (`id`, `phase`, `statement`, `reversibility`, `basis`), la regla de materialidad (solo impacto en comportamiento observable o contrato público bloquea con `question_gate`; una decisión interna nunca bloquea) y la persistencia en `state.yaml` bajo un nuevo bloque `assumptions:` que espeja el patrón existente de `approvals:`.
- **Campo `assumptions` opcional en el Result Envelope** (`skills/_shared/sdd-phase-common.md` §D): los agentes de fase pueden devolver entradas de assumption sin que esto afecte a los agentes que no lo usan (campo aditivo, retrocompatible).
- **Assumption Ledger Protocol en el orquestador** (`agents/sdd-orchestrator.agent.md`): el orquestador persiste cada `assumptions[]` recibido con semántica append/read-merge-update, y es la única autoridad que garantiza unicidad de `id` entre batches (renumera el `seq` local del phase agent al persistir si colisiona).
- **Assumption Reconciliation Pre-flight en `sdd-verify`** (`skills/sdd-verify/SKILL.md` Step 2a, `skills/sdd-verify/references/report-format.md`): re-presenta cada entrada `unresolved` agrupada por `reversibility`, ofreciendo `confirm`, `correct` o `promote-to-clarification` (esta última solo señaliza `status: promoted`, sin auto-disparar `sdd-clarify`). Las entradas `reversibility: low` que quedan sin resolver escalan a `WARNING` en `verify-report.md`; las `reversibility: high` no escalan.

### Fixed
- **Condición de carrera en `docs-lint.test.js`**: el escaneo recursivo en vivo del árbol del repo podía lanzar `ENOENT` cuando otra suite (`validate-phase.test.js`) creaba/borraba en paralelo un directorio real bajo `openspec/changes/`. Detectado en CI (`ubuntu-latest`) por la concurrencia real de `node --test`. Ahora `ENOENT` durante el listado o la lectura se trata como "ya no está" en vez de propagar el error.

Cambio guiado por SDD (ruta `standard`) con TDD estricto y gate 4R. Verificación: **PASS** (0 CRITICAL, 0 WARNING tras remediación de 2 hallazgos del gate 4R). Rastro de auditoría en `openspec/changes/archive/2026-07-02-add-assumption-ledger/`.

## [2.9.1] - 2026-07-02

### Changed
- **`git-collaboration-guard` ahora dispara solo en `git commit`**: antes, cualquier `Edit`/`Write` en la rama por defecto o con árbol sucio devolvía `ask`, generando fricción constante durante la edición normal. Ahora `isRiskyAction` (Node: `scripts/hooks/lib/git-state.js`; Go: `internal/hooks/pretooluse.go`) solo evalúa comandos que matchean `\bgit\s+commit\b` — el guard se comporta como un pre-commit check en vez de interrumpir cada edición. Paridad Go/Node preservada y verificada por tests dedicados.
- **Umbrales del Token Budget Advisor elevados**: límite por archivo individual `20,000 → 50,000` tokens y límite acumulado de sesión `90,000 → 150,000` tokens, en ambas implementaciones (`scripts/hooks/pre-tool-use.js`, `internal/hooks/pretooluse.go`), reduciendo falsos positivos en lecturas normales de archivos grandes.

Specs actualizados: `openspec/specs/git-collaboration-guard/spec.md`, `openspec/specs/token-budget-advisor/spec.md`, `openspec/specs/hooks/spec.md`. Verificación: `npm test` 774/774, `go test ./...` sin fallos.

## [2.9.0] - 2026-07-02

### Added
- **`spec-reconciliation` (drift detection + reconcile opt-in)**: nueva capacidad de conciencia continua sobre el desvío entre `openspec/specs/**` y el código. `detectSpecDrift` en `scripts/lib/ospec-state.js` compara el hash de manifest por dominio baseline contra HEAD, filtrando por los `sources:` globs del Domain Map — sin nuevo campo de manifest.
- **Resumen de drift en `SessionStart`**: nuevo campo aditivo `result.specDrift` (dominios desviados agregados), espejando los bloques existentes de seguridad/colaboración git. Se omite (no se fija a `undefined`) cuando no hay desvío.
- **Aviso de drift pre-commit** en `PreToolUse` (Step 5c): en `git commit`, `ask` (nunca `deny`) cuando los ficheros staged solapan con un dominio desviado. La regla DENY existente mantiene precedencia.
- **`/sdd-reconcile`** (comando + `skills/sdd-reconcile/SKILL.md` + `agents/sdd-reconcile.agent.md`): flujo opt-in que siembra deltas de spec retroactivos acotados a la ventana de diff desde el último hash de baseline registrado del dominio.
- **Gate de conciencia ambiental SDD** en `agents/sdd-orchestrator.agent.md`: regla always-on que dispara `AskUserQuestion` cuando una tarea no trivial solapa el alcance de un cambio activo o un dominio especificado — sin depender de que el usuario mencione "SDD".
- **Kill switch `DISABLE_SPEC_DRIFT_GUARD`**: neutraliza ambas rutas de hook nuevas sin efectos residuales.

### Changed
- **Contratos `hooks` y `agents`**: extendidos con los bloques aditivos de drift (`session-start`, `pre-tool-use`) y el gate de conciencia del orquestador, documentados en `openspec/specs/hooks/spec.md` y `openspec/specs/agents/spec.md`.

Cambio guiado por SDD con TDD estricto. Verificación: **PASS WITH WARNINGS** (776/776 tests, sin CRITICAL). Rastro de auditoría en `openspec/changes/archive/2026-07-02-sdd-context-awareness-reconciliation/`.

## [2.8.1] - 2026-06-29

### Fixed
- **Legibilidad del fallo del hook `pre-commit`**: el motivo del rechazo ya no queda enterrado bajo miles de líneas de salida de éxito. `scripts/hooks/pre-commit-hook.js` ahora invoca `scripts/check.js` con `stdio: "pipe"` (en vez de `"inherit"`): en éxito suprime la salida TAP y muestra solo una línea breve de progreso; en fallo vuelca la salida capturada y la cierra con un **banner `===`** que identifica el origen del fallo y los bypass disponibles, dejando el motivo como lo último y más visible. Los bypass existentes (`DISABLE_OSPEC_PRECOMMIT`, `DISABLE_OSPEC_ATTRIBUTION_CHECK`, `git --no-verify`) se preservan. Cambio guiado por SDD (ruta lite) con TDD estricto.

## [2.8.0] - 2026-06-29

### Added
- **`git-collaboration-guard` (advisory-first)**: nueva guarda en los hooks `PreToolUse` y `SessionStart` que prepara el harness para colaboración git multi-desarrollador. Detecta cuándo la sesión opera sobre la **rama por defecto** (resuelta vía `origin/HEAD`) y/o sobre un **árbol de trabajo sucio** (`git status --porcelain`), y al editar código o ejecutar `git commit` devuelve `ask` (nunca `deny` por defecto) con un aviso en español. `SessionStart` añade el aviso al iniciar en la rama por defecto.
- **Detección de árbol sucio**: tercer probe `git status --porcelain`; los ficheros sin trackear cuentan como sucio. El campo `dirtyTree` se **omite** (no se fija a `false`) cuando el probe falla, distinguiendo "limpio" (`false`) de "no se pudo determinar" (`null`).
- **Bypass por variable de entorno** `DISABLE_GIT_COLLABORATION_GUARD=true`: salta todas las llamadas a git y suprime los avisos.
- **Sanitización de nombre de rama anti prompt-injection**: `sanitizeBranchName` (paridad Go/Node) elimina caracteres de control, colapsa espacios y trunca a 120 caracteres antes de interpolar el nombre en el aviso visible por el modelo.
- **Recomendación "rama antes de código"**: el orquestador y las fases `sdd-propose`/`sdd-apply` recomiendan crear una rama antes de modificar código (advisory no bloqueante); la skill `branch-pr` documenta estrategias de colaboración multi-dev.

### Changed
- **Contratos de hooks `PreToolUse` y `SessionStart`**: se extienden para invocar la guarda de colaboración con *fail-open* por chequeo (si git no resuelve, cada campo falla abierto de forma independiente) y un **deadline compartido de 5 s** repartido entre los tres probes, con paridad estricta entre la implementación Go (`internal/hooks`) y el fallback Node (`scripts/hooks/*.js`). La regla DENY existente mantiene precedencia sobre la guarda (`ask`).
- **Propagación a los 4 targets**: las recomendaciones de prompts se regeneran en `claude`, `vscode`, `github-copilot` y `opencode` por el pipeline de build.

## [2.7.0] - 2026-06-27

### Added
- **Validación de fases con rutas declarativas**: nueva librería `flow-validator.js` y script `validate-phase.js` que validan transiciones de fase contra las rutas declaradas en `openspec/config.yaml`, bloqueando transiciones inválidas antes de ejecutarlas.
- **Ruta `bugfix`**: renombra la ruta `debug` a `bugfix` en la tabla de routing del orquestador, alineando la nomenclatura con Conventional Commits y añadiendo validaciones de transición al orquestador.
- **Propagación de campos `provides[]` en markers de federación**: `mergeMarkersIntoAtlas` copia campos no reservados (como `surface`) desde los `provides[]` entries del marker al contrato derivado del atlas, habilitando metadatos de contratos inter-miembro.
- **`SKILL_ENTRY_SCRIPTS` como roots del BFS de empaquetado**: los cuatro scripts de runtime de federación (`federation-marker.js`, `federation-explore.js`, `workspace-general-baseline.js`, `federation-baseline-orchestrator.js`) se añaden como roots explícitos del BFS en `gatherRuntimeScripts`, garantizando que el runtime de federación se empaquete en todos los targets.

### Changed
- **Eliminación de duplicación de prompts en agentes de fase**: refactorización de los agentes de fase para eliminar secciones de prompt duplicadas, consolidando la lógica en `sdd-phase-common.md`.
- **Extracción de referencias de habilidades grandes**: corrección de enlaces rotos en skills y extracción de contenido extenso a subdirectorios `references/` para cumplir el límite de 500 líneas de SKILL.md.
- **Relajación de deadlock en Strict TDD**: refinamiento de las reglas de mocks e higiene en el modo Strict TDD para evitar bloqueos cuando los tests requieren fixtures o mocks de infraestructura.
- **Documentación de convenciones**: limpieza de configuraciones muertas en `openspec/config.yaml` y documentación formal de convenciones del proyecto.

### Fixed
- **Bypass de capitalización en `install-target.js` en Windows**: canonicalización de rutas con `path.resolve` para evitar que diferencias de capitalización de letra de unidad (`C:` vs `c:`) eludan las guardas de seguridad de destino.
- **Paridad Go/JS en `session-start`**: corrección del bypass de `.gitignore` y alineación del comportamiento entre el binario Go y el fallback JS en el hook `session-start`.
- **Campo `capabilities` en `SkillEntry`**: añadido el campo faltante `capabilities` a la estructura `SkillEntry` para paridad entre las implementaciones Go y Node.
- **Propagación de errores de `fs.stat` en `cli.js`**: añadido `try-catch` para propagar correctamente errores de `fs.stat` en el pipeline de configuración.
- **Contradicción de permisos en `sdd-workspace`**: eliminada la contradicción entre la documentación y el comportamiento real respecto a permisos de escritura en repositorios miembro.
- **Approver neutral en `federation-baseline`**: neutralización del valor del approver a un valor target-agnóstico para evitar dependencias de plataforma en los gates de federación.

## [2.6.0] - 2026-06-22

### Added
- **Orchestrator Body Partitioning — CORE vs. circunstanciales**: Extracción de 5 bloques circunstanciales a archivos markdown puros de prosa bajo `skills/_shared/` (`route-brownfield.md`, `gate-4r-review.md`, `route-federation.md`, `dispatch-lifecycle-hooks.md`, `gate-archive-quality.md`) para optimizar el presupuesto de tokens.
- **Tabla de punteros en CORE**: Introducción de la sección `### Circumstantial Handler Pointer Table` en el orquestador (`agents/sdd-orchestrator.agent.md`) como punto único de resolución e importación bajo demanda para los handlers.
- **Test Estructural**: Incorporación del test estructural de integración `"real repo: orchestrator pointer-table refs resolve and handler sentinels absent from body"` en `scripts/configure/real-repo.test.js` para asegurar que el cuerpo del orquestador no exceda las 700 líneas y no contenga sentinelas inline de los handlers circunstanciales.

### Changed
- **Reducción de tamaño del CORE**: Reducción del cuerpo del orquestador en un **38% (de 986 a 607 líneas)**, cumpliendo con la meta de diseño.
- **Regeneración de Targets**: Actualización automática de los 4 targets generados (`claude`, `vscode`, `github-copilot`, `opencode`) propagando la tabla de punteros y los archivos `_shared/`.
- **Integración de Tests de Federation**: Adaptación de los tests de contrato de federación preexistentes para tolerar la distribución física de lógica en los archivos compartidos.

## [2.5.0] - 2026-06-21

### Added
- **Quality Gates declarativos** (`declarative-quality-gates`): nuevo bloque opcional `quality_gates:` en `openspec/config.yaml` evaluado por `sdd-verify` tras los pasos de test/build. Cuatro slots tipados (`tests`, `lint`, `architecture`, `security`) con campos `required`, `on_fail` (`advisory` por defecto | `halt`), `command` y `timeout_ms`. La ausencia del bloque es un no-op estricto: el comportamiento de verify es idéntico al baseline previo.
- **Núcleo de decisión puro `scripts/lib/quality-gates.js`** (sin I/O, espejo de `lifecycle-hooks.js`): `parseQualityGates`, `validateQualityGates`, `parseCoverage`, `classifyCoverage`, `classifyGate`, `enforceGate`, `aggregateStatus` y `buildAuditBlock`. Cubierto por 69 pruebas unitarias bajo TDD estricto.
- **Auditoría por gate en dos destinos**: tabla `## Quality Gates` en `verify-report.md` y bloque `gates.quality-gates` en `state.yaml` (hermano de `clarify` y `4r-review-gate`), escrito solo cuando hay política declarada.
- **Override de archivado con auditoría obligatoria**: el usuario puede forzar el archivado pasando un gate `halt` fallido mediante una justificación escrita, registrada en `state.yaml` (`gates.quality-gates.override`) y en `verify-report.md` con timestamp.
- **Migración de cobertura**: `quality_gates.tests.coverage.minimum` supersede a `rules.verify.coverage_threshold` cuando el bloque está declarado; al estar ausente, el campo legacy permanece activo (aditivo, retrocompatible).

### Changed
- **`sdd-verify` (SKILL + agente)**: nuevo paso 9a de evaluación de gates con ejecución acotada por `timeout_ms`, superficie de errores de validación, y escritura de auditoría *fail-closed* con read-back (envelope `blocked` ante fallo de persistencia).
- **`sdd-orchestrator`**: nuevo Archive Dispatch Guard *policy-aware* que lee config + `state.yaml` + envelope de verify, y confirmación de override en dos lugares antes de despachar `sdd-archive`.
- **`openspec-convention.md`**: documentación del bloque `gates.quality-gates`, el estado `error`, la asimetría de nombres `quality_gates`/`quality-gates` y el orden de las reglas de agregación.

### Security
- **Frontera de confianza de comandos de gate** (mirroring `run-command` de lifecycle hooks): los strings `command`/`coverage.command` se ejecutan con privilegio completo vía `sdd-verify` y fluyen por la evaluación `PreToolUse` DENY/ASK. Documentado que deben tratarse como configuración versionada y de confianza, sin secretos inline (usar variables de entorno o referencias a secret-manager).

### Fixed
- **Remediación 4R-CRITICAL** (cierre de bypass silencioso de archivado): una escritura de auditoría fallida en `state.yaml` con `sdd-verify` devolviendo `status: success` permitía al orquestador leer el gate como "ausente" y despachar el archivado saltándose un gate `halt` requerido. Cerrado por dos capas independientes — escritura *fail-closed* con read-back (H1) y guard *policy-aware* en el orquestador (H2) —; el override de medio escribir se cierra exigiendo confirmación en ambos destinos (H3). Estado `error` distinto para fallos de herramienta/timeout (H4/H5) y validación de rango de cobertura sin clamp (H6).

## [2.4.9] - 2026-06-21

### Added
- **Memoria Operativa del Proyecto** (`project-operative-memory`): se agrega soporte para la memoria operativa del proyecto en la carpeta `openspec/memory/` con contratos específicos de lectura y escritura por fase.
- **Stub de convenciones**: se crea `openspec/memory/conventions.md` con un preámbulo claro y un aviso de curación manual para los agentes.
- **Suite de pruebas estáticas**: se añade `scripts/operative-memory-contract.test.js` con 16 pruebas unitarias bajo TDD estricto que garantizan la integridad de las cláusulas y tablas de la memoria.

### Changed
- **`sdd-phase-common.md`**: se actualiza con un patrón de inicialización de 3 pasos (cargar skill, cargar protocolo compartido, leer ficheros de memoria operativa designados), la tabla de lectura por fase y la tabla de propiedad.
- **`sdd-archive`**: se añade el paso 4 para persistir decisiones resueltas (con estado `resolved`) desde `state.yaml` a `openspec/memory/decisions.md` (anteponiendo de forma reverse-chronological e implementando salvaguardas de sanitización/idempotencia).
- **`sdd-verify`**: se añade el paso 10b para persistir hallazgos mapeados como WARNING o BLOCKER en `openspec/memory/known-issues.md` (con sanitización/idempotencia).

## [2.4.8] - 2026-06-20

### Added
- **Sistema de capacidades tecnológicas** (`capability-stack-skills`): el harness ahora activa skills de stack de forma declarativa según el bloque `capabilities:` de `openspec/config.yaml`. El hook `session-start` lee las capacidades activas y las expone en su resultado; el registro de skills incluye el campo `capabilities` en cada entrada.
- **Nuevo módulo puro `capability-registry.js`**: parsea el bloque YAML de capacidades sin ningún efecto secundario (sin I/O, sin dependencias externas). Expone `parseCapabilities`, `capabilityNames` y `matchStackSkills` con validación exhaustiva de entradas y contrato de pureza formal documentado.
- **30+ nuevas skills tecnológicas** estandarizadas bajo la convención `stack-*` con frontmatter completo (`capabilities`, `license: Apache-2.0`, `metadata.author`, `metadata.version`):
  - Frontend: `stack-angular` (con 35 referencias completas de la API Angular 20), `stack-react`, `stack-react-testing`, `stack-react-performance`, `stack-vite`
  - Backend JVM: `stack-springboot`, `stack-springboot-security`, `stack-springboot-tdd`, `stack-springboot-verification`, `stack-kotlin`, `stack-kotlin-coroutines-flows`, `stack-kotlin-exposed-patterns`, `stack-kotlin-ktor-patterns`, `stack-kotlin-testing`, `stack-java`
  - Backend otros: `stack-go`, `stack-go-testing` (renombrado de `go-testing`), `stack-python`, `stack-python-testing`, `stack-dotnet`
  - Infraestructura/Datos: `stack-postgres`, `stack-sqlserver`, `stack-kafka`
  - Transversales: `accessibility`, `api-design`, `hexagonal-architecture`, `tdd-workflow`, `backend-patterns`, `frontend-patterns`, `design-system`, `ai-first-engineering`, `ai-regression-testing`, `architecture-decision-records`, `agent-harness-construction`, `agent-self-evaluation`

### Changed
- **`skill-registry.js`**: añade extracción del campo `capabilities` en cada entrada del registro mediante `extractCapabilities`; exporta `collectFiles` y `extractCapabilities` para facilitar las pruebas unitarias.
- **`session-start.js`**: integra `resolveWorkspaceCwd` de `pathsafe.js` para proteger contra path traversal en la resolución del workspace; aplana la lógica de seguridad del Agent Shield extrayendo `checkUnignoredEnvFiles` y `checkEmbeddedCredentials` como helpers independientes.

### Fixed
- **I/O resiliente en `skill-registry.js`**: lecturas asíncronas de archivos en `discoverSkills` y `calculateFingerprint` envueltas en `try/catch`; errores `ENOENT` se absorben con un warning en lugar de crashear (concurrencia segura ante archivos eliminados durante el escaneo).
- **Enmascaramiento de errores en `writeRegistryCache`**: introducido flag `writeFailed` para garantizar que las excepciones del bloque de limpieza `finally` no oculten el error original de escritura o renombrado.
- **Tolerancia a fallos de configuración en `artifact-store.js`**: la lectura inicial en `createArtifactStoreFromConfig` ahora captura errores de sistema de archivos (ej. `EISDIR`, `EACCES`) y degrada graciosamente al modo por defecto en lugar de propagar la excepción.
- **Control de excepciones de I/O en `session-start.js`**: las lecturas de `.gitignore` y `.git/config` absorben únicamente `ENOENT`; otros códigos de error (ej. `EACCES`) se loguean como warnings en lugar de ignorarse en silencio.

## [2.4.7] - 2026-06-20

### Security
- Integración de **AgentShield Security** en los hooks `SessionStart` y `PreToolUse`. Valida de forma proactiva archivos `.env*` y `.npmrc` sin ignorar en `.gitignore`, así como credenciales expuestas en `.git/config` (SessionStart). Bloquea accesos no permitidos a claves SSH, `.npmrc` y `.git/config` local, y consulta interactivamente sobre secretos o API keys en ficheros < 1MB (PreToolUse). Bypass vía `DISABLE_AGENT_SHIELD=true`.

### Added
- Integración de **Token Budget Advisor** en los hooks `PreToolUse` para controlar el volumen de tokens de la sesión (límite por fichero de 20k, límite acumulado de sesión de 90k en `.ospec/session/<changeName>/token-events.jsonl`). Bypass vía `DISABLE_TOKEN_ADVISOR=true`.
- Hook de Git `pre-commit` (instalable idempotentemente vía `npm run setup:git-hooks` usando `scripts/setup-git-hooks.js`) que valida la integridad del workspace corriendo `check.js` y bloquea commits que violen el ciclo **Strict TDD** (cambios de producción staged que carezcan de test o checklist staged). Bypass vía `DISABLE_OSPEC_PRECOMMIT=true`.
- Defensa en tres capas contra la **atribución de modelo/IA en commits**: regla `PreToolUse` DENY que intercepta `git commit` y escanea el mensaje antes de ejecutarse (sin bypass); hook de Git `commit-msg` (también instalado por `npm run setup:git-hooks`) que rechaza trailers de atribución y nombres de vendor/modelo, con bypass vía `DISABLE_OSPEC_ATTRIBUTION_CHECK=true`; y la capa pasiva de reglas existente.
- Diagrama arquitectónico de flujos del arnés en `docs/harness-runtime.md` y diagrama del ciclo y rutas de workflows en `docs/sdd-workflows.md` usando imágenes PNG.

### Fixed
- Frontmatter generado inválido: `setScalar` (`scripts/lib/frontmatter.js`) ahora entrecomilla los valores escalares que romperían el YAML plano (`: ` interno, indicadores iniciales, comentarios, etc.). El comando `sdd-workspace`, cuya `description` contiene `atlas: scaffold`, generaba frontmatter que el cargador descartaba en silencio (el comando se cargaba sin metadata); el target `github-copilot` ya no pre-entrecomilla `applyTo` para evitar doble comillado.
- Test de consumo acumulado en `pre-tool-use.test.js`: corregido mock de cambio activo temporal para evitar bypass de límites en entornos sin cambios activos en desarrollo.

### Changed
- Sincronización y auditoría de la documentación general (`README.md`, `harness-runtime.md`, `tdd-y-revision.md`, `comparacion-arneses.md`) eliminando las propuestas obsoletas de oportunidades de mejora técnica ya implementadas.

## [2.4.6] - 2026-06-19

### Security
- Paridad de validación de rutas entre el binario Go y los hooks JS: nuevo `scripts/lib/pathsafe.js` que replica `validatePath`/`resolveCwd`. Los hooks `subagent-stop`, `stop` y `pre-compact` ahora rechazan rutas relativas, con `..` o raíces del sistema de ficheros en `cwd` y `transcript_path`, evitando lectura fuera de límites y escritura dirigida a la raíz.

### Fixed
- Pérdida de datos en `caveman-compress`: la escritura del fichero comprimido es ahora atómica (`os.replace`); si falla, el original queda intacto y se elimina el backup para no bloquear un reintento.
- `federation-baseline-orchestrator`: `loadStatus` ya no convierte cualquier error de I/O en estado vacío (solo `ENOENT`), evitando reinicios silenciosos del progreso de baseline de todos los miembros.
- Iteración no determinista en `subagentstop.go`: las claves del map se ordenan antes de recorrerlas, garantizando una resolución de skill estable entre ejecuciones.
- Escrituras atómicas en `artifact-store.js` (`workspace.yaml`), `stop.js` (`latest.md`) y `federation-marker.js` (sin ficheros `.tmp` huérfanos en fallos de rename).
- `JSON.parse` con contexto de fichero en `target-transform.js` e instaladores globales (`install-global-opencode`, `install-global-copilot`), que ahora fallan con un mensaje accionable en vez de un `SyntaxError` opaco.
- `caveman-compress`: `call_claude` cae al CLI ante cualquier fallo del SDK (no solo `ImportError`) y trunca stderr; `validate` valida la existencia de los paths; salida forzada a UTF-8 para evitar `UnicodeEncodeError` en consolas Windows.

### Added
- Cobertura de tests para el paquete Python `caveman-compress` (`scripts/test_caveman.py`, 10 casos sobre backup-guard, retry-restore, escritura atómica, fallback del SDK y clasificación) y test de la rama de error de `jsonio.ReadInput`.

### Changed
- Refactor de legibilidad: extracción de helpers para aplanar el anidamiento en `route-dispatcher.js`, `store.go` y `ospec-state.js`; eliminación de variables muertas y de un IIFE en el código Go, y renombrados menores (`os2` → `goos`).

## [2.4.5] - 2026-06-19

### Added
- Ruteo de modelos para el target VS Code: habilitado el parámetro `model: true` en el perfil `vscode.js` para inyectar los modelos resueltos de `models.yaml` en el frontmatter de los agentes generados en `dist/vscode/`.
- Scripts de configuración automatizada: añadidos los comandos `"setup:vscode"`, `"setup:copilot"`, y `"setup:opencode"` para compilar y configurar automáticamente los targets locales y globales.
- Configuración automática de VS Code: el script `install-vscode.js` localiza y actualiza la ruta del plugin en el archivo `settings.json` del usuario (tanto para VS Code normal como Insiders), generando un backup previo.
- Robustez en instaladores globales: los instaladores de OpenCode y Copilot CLI ahora crean de forma recursiva sus directorios globales si no existen en el sistema.
- Comandos de recarga unificados: registrados `"reload:vscode"`, `"reload:copilot"` y `"reload:opencode"` para facilitar el ciclo de desarrollo.

## [2.4.4] - 2026-06-19

### Added
- Soporte para instalación global en `opencode`: añadido el script `npm run install:global:opencode` que compila el target, copia binarios, agentes, comandos, skills, instrucciones y plugins directamente en `~/.config/opencode/` e integra de forma automática los servidores MCP y reglas en `opencode.json`.
- Renombrado del agente en `opencode`: se traduce automáticamente `sdd-orchestrator` a `ospec-workflow` para mejorar la integración visual y el autocompletado con Tab en el cliente de OpenCode.
- Documentación detallada en el `README.md` y en `docs/plugin-installation.md` explicando las dos modalidades de instalación (local y global).

## [2.4.3] - 2026-06-19

### Fixed
- Claude agent visibility in VS Code: preserved `user-invocable: false` in the generated Claude agent frontmatter (previously stripped), preventing duplicate agent entries in VS Code and direct user-invocation in Claude Code.
- Setup tool resilience: updated `install-claude.js` and `cli.js` to fallback to Microsoft WinGet local package directories to find `claude.exe` when it is not present in the system PATH.
- Validator CLI compatibility: removed the unsupported `--strict` flag from the `claude plugin validate` command execution in `claude.js` profile, avoiding validation failures on standard installations.

## [2.4.2] - 2026-06-19

### Added
- Capability routing at launcher level (`ospec-hooks-launch.js`): Bypasses the Go binary and delegates to Node.js JS fallbacks for `session-start`, `pre-compact`, and `stop` hooks when running in `workspace-federated` backend mode.
- Hot path performance protection: skips configuration checks entirely for `pre-tool-use` and `subagent-stop` to avoid any I/O latency.
- Full unit test coverage in `ospec-hooks-launch.test.js` validating the routing logic and edge cases.

## [2.4.1] - 2026-06-16

### Fixed
- Hook runtime delivery: `hooks.json` invoked the compiled `ospec-hooks` binary
  directly, but that binary is gitignored and the publish workflow never built or
  bundled it, so it never reached the `release` branch — every install from
  `release` got a `hooks.json` pointing at a missing binary and all five hooks
  failed (`ospec-hooks: No such file or directory`). Hooks now run through
  `scripts/hooks/ospec-hooks-launch.js`, a Node launcher that prefers the
  per-platform Go binary and falls back to the Node hooks when none ships for the
  host. `publish-marketplace.yml` cross-compiles all four platform binaries
  (windows/amd64, darwin/arm64, darwin/amd64, linux/amd64) into the published tree.

## [2.4.0] - 2026-06-15

### Added
- `opencode` (opencode.ai / SST) target for the multi-target generator. Transforms
  the canonical source into opencode's native layout, verified against the official
  docs: agents to `.opencode/agents/*.md` (`mode: primary|subagent`, `tools:` as a
  map, `provider/model` slugs), commands to `.opencode/commands/*.md` (keep `agent:`
  routing; `${input:name}` → positional `$1`/`$2`, `${input}` → `$ARGUMENTS`), rules
  to `.opencode/instructions/*.md` referenced from `opencode.json`, and MCP folded
  into `opencode.json` (`mcp` with `type: local|remote`; VS Code `${input:NAME}`/
  `${NAME}` placeholders in env/header values rewritten to opencode's `{env:NAME}`).
  Because opencode has no
  shell-command hooks, the SDD runtime (`session-start` / `pre-tool-use`) is bridged
  through a JS plugin at `.opencode/plugins/ospec.js`. Gated by a dedicated Node
  validator (`scripts/configure/validate-opencode.js`) plus golden fixtures, wired
  into `node scripts/check.js`. Adds the `opencode` column to `models.yaml`.
- Phase `sdd-clarify` between `spec` and `design` to resolve design decisions early.
- GPT model routing tiers for `opencode` target in `models.yaml`.

### Changed
- Migrated the 5 hooks from JavaScript to a compiled Go binary (`ospec-hooks`), enhancing hook performance and robustness.
- Added path traversal validation for `transcript_path` and `cwd` inside the hooks runner.
- Handled hook event concurrency with file-based locking.
- Simplified installation with single commands per target (e.g. `npm run setup:claude`).
- Hardened multi-OS validation and workflow concurrency in CI.
- Unified routing dispatcher with intent-based routing and 4R review gate.

## [2.3.0] - 2026-06-12

### Fixed
- Claude target tool grants now match the official Claude Code tools reference.
  The `edit` abstract tool mapped only to `Edit` (modify-existing), so every phase
  agent was granted a toolset that could not create the artifacts its own prose
  tells it to `Write` (`proposal.md`, `design.md`, `tasks.md`, spec deltas, source
  and test files). `edit` now expands to `["Edit", "Write"]`, mirroring the existing
  `search → ["Grep", "Glob"]` one-to-many mapping.

### Changed
- `execute` maps to `["Bash", "PowerShell"]` for the Claude target so test and build
  commands run cross-OS: on Windows without Git Bash the `Bash` tool is unavailable
  and `PowerShell` is the native shell tool. Where one shell tool is absent it is
  simply not loaded, so the grant is harmless. Aligns the agent toolsets with the
  existing multi-OS validation workflow.

## [2.2.0] - 2026-06-12

### Added
- Multi-target plugin compatibility: a dependency-free generator
  (`scripts/configure/cli.js`) that transforms the canonical VS Code source into
  native trees for three targets — `claude` (a `.claude-plugin` bundle, gated by
  `claude plugin validate --strict`), `github-copilot` (the `.github/` layout:
  `agents/`, `prompts/`, `instructions/`), and `vscode` (identity). Includes a
  pure `target-transform` with declarative per-target profiles, context-aware
  tool-name substitution, path remapping and artifact drops, a tier-based
  `models.yaml` resolver, frontmatter helpers, the Claude orchestrator delivered
  as a skill, and committed golden fixtures. The source is never mutated; VS Code
  keeps loading it directly.
- YAML frontmatter (`name`, `description`) on the `agent-introspection` and
  `harness-audit` skills so the plugin validator stops warning.
- Brownfield bootstrap path: `sdd-baseline` agent, command, and skill to seed
  `openspec/specs/` with current-behavior specs in resumable per-domain batches.
- Baseline Advisory gate in the orchestrator for brownfield repos.
- Validation harness hardening: `node scripts/check.js` is now the single local
  and CI verification entry point, running native tests and generating GitHub
  Copilot output through the profile-level validator.
- GitHub Copilot distribution validator for required `.github/` layout, hook
  schema, frontmatter semantics, forbidden plugin residue, placeholder leaks,
  local absolute paths, and unexpected Markdown suffixes.
- Multi-OS GitHub Actions workflow (`validate-harness.yml`) covering Ubuntu,
  Windows, and macOS with Node.js 22.
- Canonical OSS files: `LICENSE` (MIT), `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, and this changelog.

### Fixed
- Installation docs drift: hooks are Node.js (not PowerShell) and the MCP
  surface documents both Context7 and MarkItDown.
- P0 harness safety: removed legacy `.atl` registry inheritance from runtime
  guidance, unified skill registry cache resolution, and hardened PreToolUse
  command inspection for unknown tools carrying command payloads.
- GitHub Copilot validation robustness: required paths now check file vs
  directory type before traversal, and residue checks catch case-insensitive
  `vscode` references.

## [2.1.0] - 2026-06-11

### Added
- Configurable model routing via `profiles/models/{default,cheap,premium}.yaml`;
  agents no longer hardcode a model name.
- Runtime lifecycle hooks (`SessionStart`, `PreToolUse`, `PreCompact`,
  `SubagentStop`, `Stop`) with a Node.js runtime under `scripts/hooks/` and a
  native `node --test` suite.
- Governance: blocking approvals persisted in `state.yaml` and delimited prompt
  boundaries separating intent, artifacts, standards, and approval context.
- Minimal default MCP policy (Context7 + MarkItDown), documented in
  `docs/mcp-policy.md`.

### Changed
- README documents the plugin runtime and standard/lite/fast-forward workflows.

## [2.0.0] - 2026-06-10

### Added
- Spec-Driven Development workflow as a VS Code Agent Plugin: `sdd-orchestrator`
  coordinator plus phase agents (`explore`, `propose`, `spec`, `design`, `tasks`,
  `apply`, `verify`, `archive`) and `sdd-foundation` for greenfield discovery.
- OpenSpec as the versionable source of truth for each change.
- Interactive workflow gates through `vscode/askQuestions`.
- Strict TDD mode when the project exposes a compatible test runner.

[Unreleased]: https://github.com/snakeblack/ospec-workflow/compare/v2.4.5...HEAD
[2.4.5]: https://github.com/snakeblack/ospec-workflow/compare/v2.4.4...v2.4.5
[2.4.4]: https://github.com/snakeblack/ospec-workflow/compare/v2.4.3...v2.4.4
[2.4.3]: https://github.com/snakeblack/ospec-workflow/compare/v2.4.2...v2.4.3
[2.4.2]: https://github.com/snakeblack/ospec-workflow/compare/v2.4.1...v2.4.2
[2.4.1]: https://github.com/snakeblack/ospec-workflow/compare/v2.4.0...v2.4.1
[2.4.0]: https://github.com/snakeblack/ospec-workflow/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/snakeblack/ospec-workflow/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/snakeblack/ospec-workflow/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/snakeblack/ospec-workflow/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/snakeblack/ospec-workflow/releases/tag/v2.0.0
