# Proposal: k6a-runtime-boundary-closure

## Intent

Cerrar definitivamente las 11 brechas críticas y de contención en K6a (`worker-isolation`, `allowed-paths-validator`, `host-contract`, `contract-lint`) para asegurar el aislamiento estricto de ejecución, eliminar fallbacks inseguros y habilitar la vertical K4b.

## Scope

### In Scope
- **Unified Diff Estándar**: Almacenar contenido baseline real y generar hunks estándar aplicables (`--- a/ +++ b/` con contexto y contenido previo).
- **Enforcement Real de WorkerTransport**: Exigir `WorkerTransport` verificado para reportar `isolationReported = "enforced"`; degradar en spawn local sin sandboxing.
- **Contención Fail-Closed**: Delimitar la frontera de contención ante comandos arbitrarios sin aislamiento real.
- **Firma de invokeTransportAsync**: Corregir la invocación a `invokeTransportAsync(workerTransport, { signal, deadlineMs, input })` y propagar cancelación/timeout.
- **Encapsulación del Registro de Workspaces**: Generar `workspace_id` puramente con UUID interno (sin traversal del llamador) y proteger el registro contra mutaciones externas.
- **Materialización Fail-Closed**: Rechazar materialización para workspaces no registrados en el registry interno (sin fallback a `descriptor.root_path`).
- **Pipeline E2E Canónico**: Test de integración real K3 -> K4a -> K6a -> K3 (`computeSourceSnapshotId`, `compileExecutionGraph`, `compileWorkOrdersV2`, `validateWorkOrderBinding`, `validateWorkResultBinding`).
- **Reconciliación REQ-contract-lint-018**: Eliminar fallbacks legacy `.files` / dependencias de rutas y auditar en `k6a-canonical-contracts.js` fixtures e invocaciones JS sintéticas.
- **Telemetría de Transport**: Preservar `stdout`, `stderr` y `exit_code` tras `normalizeTransportOutcome`.
- **Eliminación de Race Condition**: Esperar evento `'close'` del proceso hijo antes de ejecutar `recoverInterruptedExecution()`.
- **Symlink Escape Fail-Closed**: Hacer fail-closed `checkSymlinkEscape()` ante fallos de `realpathSync` o excepciones de filesystem.

### Out of Scope
- Implementación de la vertical K4b (Repair shadow execution).
- Modificaciones al compilador de grafos de K4a o identidades criptográficas de K3.
- Introducción de nuevos esquemas o campos fuera del estándar canónico.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `worker-isolation`: Reforzar contención fail-closed, generación de unified diff fidedigno, encapsulación de workspace registry, firma de `invokeTransportAsync`, y verificación obligatoria de WorkerTransport para estado `enforced`.
- `contract-lint`: Extender `REQ-contract-lint-018` para auditar fixtures e invocaciones JS con `.files` sintéticos en `SourceSnapshot`.

## Approach

1. **Diff & Baseline**: Preservar copias/buffers del contenido base durante `materializeSourceSnapshot` para emitir unified diffs estándar válidos.
2. **Transport & Enforcement**: Validar presencia de `WorkerTransport` activo para `enforced`; corregir firma de `invokeTransportAsync`; preservar telemetría en `normalizeTransportOutcome`.
3. **Seguridad de Registro**: Asignar `workspace_id` exclusivamente con UUID interno; exigir registro activo en `materializeSourceSnapshot` sin fallback directo a rutas externas.
4. **Procesos & Symlinks**: Sincronizar terminación de subprocesos esperando `'close'` antes de la recuperación; capturar excepciones en `checkSymlinkEscape` tratándolas como violaciones de contención.
5. **Contratos & E2E**: Eliminar código muerto legacy (`.files`); ampliar checker `k6a-canonical-contracts`; implementar suite E2E K3->K4a->K6a->K3.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/worker-workspace.js` | Modified | UUID interno, registro privado blindado, baseline content, materialización fail-closed |
| `scripts/lib/worker-executor.js` | Modified | Firma `invokeTransportAsync`, enforcement de `WorkerTransport`, diff estándar, race condition 'close' |
| `scripts/lib/allowed-paths-validator.js` | Modified | Fail-closed ante fallos de `realpathSync` en `checkSymlinkEscape` |
| `scripts/lib/host-contract/index.js` | Modified | Preservación de telemetría `stdout/stderr/exit_code` en `normalizeTransportOutcome` |
| `scripts/lib/contract-checkers/k6a-canonical-contracts.js` | Modified | Detección de `.files` sintéticos en fixtures e invocaciones JS |
| `scripts/k6a-e2e-worker-isolation.test.js` | Modified | Actualización de tests de aislamiento y suite canónica E2E K3->K4a->K6a->K3 |
| `openspec/specs/worker-isolation/spec.md` | Modified | Requisitos normativos de enforcement estricto de transport, encapsulación y diff estándar |
| `openspec/specs/contract-lint/spec.md` | Modified | Reconciliación normativa de REQ-contract-lint-018 |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Incompatibilidad con tests heredados que suministraban `.files` o `workspace_id` custom | Med | Refactorizar suites y fixtures para usar la API canónica y UUIDs internos |
| Procesos zombies en cancelación de subprocesos locales | Low | Emitir SIGTERM/SIGKILL y aguardar evento `'close'` del child process |
| Sobrecarga de diffs en árboles de archivos grandes | Low | Limitar el diff a archivos modificados dentro del delta de mutación |

## Rollback Plan

Revertir los archivos modificados en `scripts/lib/worker-*`, `scripts/lib/allowed-paths-validator.js`, `scripts/lib/host-contract/`, `scripts/lib/contract-checkers/` y specs asociadas mediante `git checkout` al commit previo.

## Dependencies

- `scripts/lib/execution-identities/index.js` (K3)
- `scripts/lib/execution-graph/work-order-compiler.js` (K4a)
- `scripts/lib/host-contract/index.js` (K2a)

## Success Criteria

- [ ] `generateUnifiedDiff` emite hunks estándar válidos basados en contenido baseline real.
- [ ] `ExecuteWorkOrder` reporta `isolationReported: "enforced"` únicamente si existe un `WorkerTransport` verificado activo.
- [ ] `invokeTransportAsync` recibe `{ signal, deadlineMs, input }` y cancela de forma efectiva la ejecución.
- [ ] `workspace_id` se genera exclusivamente con UUID interno y `materializeSourceSnapshot` falla cerrado si el workspace no está en el registro.
- [ ] `checkSymlinkEscape` falla cerrado ante cualquier fallo de `fs.realpathSync`.
- [ ] Suite E2E canónica K3 -> K4a -> K6a -> K3 pasa al 100%.
- [ ] `k6a-canonical-contracts` detecta fixtures e invocaciones que asuman `.files` sintéticos.
- [ ] La suite completa `npm test` pasa sin errores ni regresiones.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
