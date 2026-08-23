# Proposal: k6a-contract-runtime-integration-remediation

## Intent

Remediar las brechas de integración y desacoples de contratos identificados en la implementación de K6a (`worker-isolation`) tras el gate de v2.46.0:
1. Conectar con los contratos canónicos K3 (`SourceSnapshot v1`, `WorkResult v1`) y K4a (`WorkOrder v2` con dependencias SHA-256 de grafo).
2. Integrar con el puerto `WorkerTransport` del host-contract (K2a), soporte real de cancelación `AbortSignal` y budgets de timeout K5.
3. Incorporar captura de inventario base (`baselineInventory`), validación de `allowed_paths` sobre el delta real de mutaciones y generación de parches unified diff aplicables.
4. Unificar el cálculo criptográfico de `work_result_id` delegando estrictamente en `execution-identities`.

## Scope

### In Scope
- **Contratos Canónicos K3/K4a**: Desacoplar `dependencies` de `WorkOrder v2` (IDs de grafo `sha256:...`) de los inputs de filesystem; materializar `SourceSnapshot v1` canónico (sin campo inventado `.files`) vía proyección/manifiesto; emitir `work-result/v1` canónico y usar `computeWorkResultId` de `execution-identities`.
- **Integración WorkerTransport & Host (K2a)**: Invocar `WorkerTransport` vía `invokeTransportAsync`; verificar `CapabilityProof` con `resolveCapabilityState` (fallback seguro ante `partial`/`unavailable`); soporte efectivo de `AbortSignal` y timeouts K5.
- **Registro de Workspaces y Seguridad**: Registro privado de workspaces (`workspace_id -> descriptor`) impidiendo rutas arbitrarias en `disposeWorkspace`; validar symlinks en jerarquías no instanciadas.
- **Delta de Filesystem & Patch Real**: Capturar `baselineInventory` pre-ejecución; validar `allowed_paths` solo sobre mutaciones (`created`, `modified`, `deleted`); generar patch unified diff con validación de reconstrucción de árbol.
- **Composición E2E**: Suite de integración de la cadena completa K3 -> K4a -> K6a -> K3.

### Out of Scope
- Orquestación de la vertical Repair shadow (propiedad de K4b).
- Modificación del compilador de Execution Graph (K4a) o reducer de lifecycle (K2).
- Congelación o atestación de `CandidateId` (K3/K8).

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `worker-isolation`: Adaptar materialización de snapshot, ejecución vía `WorkerTransport`, captura de WorkResult canónico, validación de delta de filesystem y gestión segura del ciclo de vida del workspace.
- `lifecycle-model-conformance`: Alinear los escenarios y chequeos del modelo K6a con contratos canónicos y deltas reales.

## Approach

1. **Materialización**: En `scripts/lib/worker-workspace.js`, materializar archivos a partir de la proyección del `SourceSnapshot` / manifiesto de inputs de cápsula, validando que las dependencias de grafo K4a requeridas existan (falla cerrada).
2. **Identidad Criptográfica**: Eliminar el algoritmo duplicado de `scripts/lib/worker-executor.js` y reutilizar `computeWorkResultId` de `scripts/lib/execution-identities/index.js`.
3. **Transport & Cancelación**: Conectar `executeWorkOrder` con `WorkerTransport` (`invokeTransportAsync`), resolviendo capacidades con `resolveCapabilityState` y abortando procesos en vuelo ante `signal.aborted` o timeout.
4. **Delta & Patch**: Capturar `baselineInventory` al crear/materializar el workspace; tras la ejecución, derivar el delta de cambios, verificar `validateAllowedPaths` sobre el delta y emitir un patch unified diff válido.
5. **Registro Protegido**: Mantener un registro privado en runtime para asociar `workspace_id` con su raíz física, blindando `disposeWorkspace` y validaciones de symlink.
6. **E2E Pipeline**: Validar la composición íntegra K3 (`SourceSnapshot`) → K4a (`compileWorkOrdersV2`) → K6a (`executeWorkOrder`) → K3 (`validateWorkResultBinding`).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/worker-workspace.js` | Modified | Proyección de SourceSnapshot canónico, registro privado de workspaces, baseline inventory |
| `scripts/lib/worker-executor.js` | Modified | Conexión con `WorkerTransport`, `computeWorkResultId` canónico, `AbortSignal`, unified diff |
| `scripts/lib/allowed-paths-validator.js` | Modified | Validación sobre delta de mutaciones y blindaje de symlinks en rutas no instanciadas |
| `scripts/k6a-e2e-worker-isolation.test.js` | Modified | Tests E2E de pipeline canónico K3->K4a->K6a y reconstrucción de diff |
| `openspec/specs/worker-isolation/spec.md` | Modified | Actualizar requisitos normativos para contratos canónicos, WorkerTransport y deltas |
| `openspec/specs/lifecycle-model-conformance/spec.md` | Modified | Actualizar escenarios de conformidad del modelo K6a |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Incompatibilidad de fixtures preexistentes que asumían `.files` en SourceSnapshot | Med | Actualizar fixtures para suministrar el shape canónico de SourceSnapshot y proyección de inputs |
| Manejo dispar de cancelación de subprocesos en plataformas Windows vs POSIX | Med | Utilizar listeners de `AbortSignal` con terminación limpia de árbol de procesos (`child_process`) |
| Sobrecarga en el cálculo de unified diffs para repositorios grandes | Low | Limitar la generación del diff estrictamente a los archivos modificados dentro del delta |

## Rollback Plan

Revertir los archivos modificados en `scripts/lib/worker-*`, `scripts/lib/allowed-paths-validator.js` y las suites de test asociadas mediante `git checkout` al commit previo a la remediación.

## Dependencies

- `scripts/lib/execution-identities/index.js` (K3)
- `scripts/lib/execution-graph/work-order-compiler.js` (K4a)
- `scripts/lib/host-contract/index.js` (K2a)

## Success Criteria

- [ ] `MaterializeSourceSnapshot` procesa `WorkOrder v2` (dependencias SHA-256) y `SourceSnapshot v1` canónico sin `.files`.
- [ ] `CaptureWorkResult` genera `work-result/v1` canónico usando `computeWorkResultId` de `execution-identities`.
- [ ] `ExecuteWorkOrder` opera sobre `WorkerTransport`, respeta `AbortSignal` y resuelve capability proofs con `resolveCapabilityState`.
- [ ] Se verifica que `allowed_paths` valida el delta respecto al `baselineInventory` y emite un diff unified verificable.
- [ ] La suite de pruebas de K6a y composición canónica (`npm test`) ejecuta y pasa al 100%.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
