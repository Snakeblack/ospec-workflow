# Design: k6a-contract-runtime-integration-remediation

## Technical Approach

Esta remediación soluciona las brechas de integración y desacoples de contratos identificados en la implementación inicial de K6a (`worker-isolation`) tras el gate de v2.46.0, alineando el subsistema de ejecución aislada con los contratos canónicos del harness:
1. **Materialización Canónica de Snapshot (`scripts/lib/worker-workspace.js`)**: Consume `SourceSnapshot v1` canónico (sin asumir `.files` sintético) y `WorkOrder v2` (donde `dependencies` son IDs SHA-256 del DAG de ejecución). Los archivos a proyectar se definen mediante un manifiesto explícito `capsule_inputs: string[]` o selector de proyección del snapshot. La cápsula calcula un digest determinista `fingerprint` sobre inputs, digests y `source_snapshot_id`, fallando cerrado si falta algún archivo requerido.
2. **Identidad Criptográfica Canónica de WorkResult (`scripts/lib/worker-executor.js`)**: Elimina la rutina de hashing duplicada en `worker-executor.js` y delega estrictamente en `computeWorkResultId` y `validateWorkResultBinding` de `scripts/lib/execution-identities/index.js`. Emite `work-result/v1` canónico con `work_result_id` determinista, manteniendo `execution_usage` como evidencia externa enlazada y garantizando la prohibición total de `CandidateId`.
3. **Integración con WorkerTransport y Conformance Host (`scripts/lib/worker-executor.js`)**: Conecta la ejecución al puerto `WorkerTransport` de `host-contract` vía `invokeTransportAsync`. Verifica `CapabilityProof` mediante `resolveCapabilityState`, reportando `"enforced"` únicamente ante verificación exitosa y degradando de forma segura a `"partial"` o `"unavailable"`. Soporta ejecución asíncrona real con propagación de `AbortSignal` y control de presupuestos K5 (`wall_time_minutes`, `commands`).
4. **Registro Privado de Workspaces y Blindaje de Contención (`scripts/lib/worker-workspace.js`, `scripts/lib/allowed-paths-validator.js`)**: Introduce un registro privado en runtime (`Map<string, InternalWorkspaceRecord>`) para indexar workspaces activos. `disposeWorkspace` valida contra el registro impidiendo borrados de rutas arbitrarias. El validador de rutas inspecciona symlinks en jerarquías no instanciadas (`symlink-parent/non-existent-child`) asegurando contención estricta.
5. **Inventario Base, Delta de Mutaciones y Parche Unified Diff Real (`scripts/lib/worker-workspace.js`, `scripts/lib/worker-executor.js`)**: Captura `baselineInventory` al aprovisionar el workspace. Tras la ejecución, deriva el delta exacto de mutaciones (`created`, `modified`, `deleted`), evalúa `validateAllowedPaths` exclusivamente sobre el delta y genera un parche unified diff aplicable y verificable mediante reconstrucción de árbol.
6. **Linter de Contratos y Conformidad de Modelo (`scripts/lib/contract-checkers/`, `scripts/lib/lifecycle-model.js`)**: Incorpora el checker `k6a-canonical-contracts` en `contract-lint.js` y actualiza los 6 verificadores de invariantes K6a en `lifecycle-model.js` para certificar la composición con contratos canónicos.

---

## Architecture Decisions

### Decision: Desacoplamiento de `capsule_inputs` de Dependencias DAG de Grafo y Materialización Canónica

| Opción | Tradeoffs | Decisión |
|--------|-----------|----------|
| **1. Reinterpretar `WorkOrder.dependencies` como rutas de archivos** | Sencillo a corto plazo; **rompe la semántica de `WorkOrder v2` donde las dependencias son IDs de nodos DAG (`sha256:...`)** | Rechazada |
| **2. Desacoplar `capsule_inputs: string[]` de dependencias DAG y consumir `SourceSnapshot v1` canónico** | Separa dependencias de orquestación de inputs de filesystem; mantiene contratos puros | **Elegida** |

- **Elección**: Separar `dependencies` (IDs de WorkOrder DAG `sha256:...`) de los inputs de filesystem declarados en `capsule_inputs: string[]` dentro de la cápsula. `MaterializeSourceSnapshot` proyecta los archivos requeridos desde el árbol del snapshot y calcula el `fingerprint` canónico.
- **Alternativas consideradas**: Reutilizar el campo `dependencies` para rutas fue rechazado porque contamina el grafo de ejecución K4a con strings de filesystem en lugar de hashes inmutables.
- **Razón**: Permite la composición estricta entre el compilador de grafos K4a y el runtime de ejecución K6a sin colisión semántica.

---

### Decision: Delegación Estricta de Identidad Criptográfica de WorkResult en `execution-identities`

| Opción | Tradeoffs | Decisión |
|--------|-----------|----------|
| **1. Mantener algoritmo local de hashing en `worker-executor.js`** | Autocontenido; **genera deriva criptográfica y rompe validaciones canónicas de `execution-identities`** | Rechazada |
| **2. Importar `computeWorkResultId` y `validateWorkResultBinding` desde `execution-identities`** | Fuente única de verdad criptográfica; garantiza que `work-result/v1` cumpla el dominio de hash oficial | **Elegida** |

- **Elección**: Eliminar el cálculo duplicado en `worker-executor.js` y reutilizar `computeWorkResultId` y `validateWorkResultBinding` del módulo `scripts/lib/execution-identities/index.js`.
- **Alternativas consideradas**: Mantener una función envoltorio local sin importar `execution-identities` fue rechazado porque introduce discrepancias en el orden de claves y manejo de `execution_usage`.
- **Razón**: Garantiza interoperabilidad criptográfica absoluta en toda la cadena K3 -> K4a -> K6a -> K3.

---

### Decision: Integración Asíncrona con `WorkerTransport` y `resolveCapabilityState` con Fallback Seguro

| Opción | Tradeoffs | Decisión |
|--------|-----------|----------|
| **1. Ejecución síncrona con `spawnSync` y simulación de capability** | Bloquea el event loop; no soporta `AbortSignal` ni integración real con `HostAdapter` | Rechazada |
| **2. Conexión asíncrona con `WorkerTransport` vía `invokeTransportAsync` y `resolveCapabilityState`** | Ejecución asíncrona real, cancelación limpia de subprocesos y verificación estricta de proofs | **Elegida** |

- **Elección**: `ExecuteWorkOrder` consume el puerto `WorkerTransport` usando `invokeTransportAsync`. Las capacidades de aislamiento se evalúan con `resolveCapabilityState` de `host-contract`, reportando `"enforced"` solo ante proof verificada, o degradando con trazabilidad a `"partial"`/`"unavailable"`.
- **Alternativas consideradas**: Promover silenciosamente a `"enforced"` fue rechazado por violar los principios de seguridad y observabilidad veraz del harness.
- **Razón**: Asegura contención real, capacidad de aborto inmediato y compatibilidad total con la arquitectura multi-host K2a/K11a.

---

### Decision: Registro Privado de Workspaces y Blindaje de Symlinks en Jerarquías No Instanciadas

| Opción | Tradeoffs | Decisión |
|--------|-----------|----------|
| **1. `disposeWorkspace` acepta rutas arbitrarias del caller** | Expone riesgo de borrado accidental o malicioso fuera del espacio de trabajo | Rechazada |
| **2. Registro privado en runtime (`workspace_id -> descriptor`) y validación de ancestros para symlinks** | Blindaje contra borrado arbitrario; detección de escapes por symlinks intermedios | **Elegida** |

- **Elección**: Gestionar los workspaces activos en una estructura privada (`Map`). `disposeWorkspace` resuelve exclusivamente workspaces registrados. En `allowed-paths-validator.js`, se valida la cadena de directorios ancestros de cada ruta para neutralizar symlink escapes incluso si el archivo destino aún no existe.
- **Alternativas consideradas**: Confiar en comprobaciones estáticas de strings fue rechazado porque no detecta enlaces simbólicos creados dinámicamente en directorios padres.
- **Razón**: Previene vulnerabilidades de traversal y mutaciones destructivas fuera de los límites del sandbox.

---

### Decision: Captura de `baselineInventory`, Validación sobre Mutation Delta y Parche Unified Diff Real

| Opción | Tradeoffs | Decisión |
|--------|-----------|----------|
| **1. Validar todo el inventario final y generar lista sintética de rutas como patch** | No distingue archivos preexistentes de mutaciones; diff sintético no es aplicable | Rechazada |
| **2. Capturar `baselineInventory`, validar delta (`created`, `modified`, `deleted`) y emitir unified diff real** | Precisión milimétrica sobre las escrituras del worker; diff aplicable con reconstrucción verificable | **Elegida** |

- **Elección**: Capturar `baselineInventory` al crear la cápsula. Tras la ejecución, computar el delta de cambios (`created`, `modified`, `deleted`), verificar `allowed_paths` sobre dicho delta y estructurar un diff unified real con contenido y cabeceras aplicables.
- **Alternativas consideradas**: Diff binario o recreación completa de árbol fue rechazado por sobrecarga de memoria y pérdida de legibilidad en inspección.
- **Razón**: Cumple estrictamente con el contrato de `WorkResult v1` y permite validar formalmente la reconstrucción del árbol de archivos.

---

## Data Flow

```
   ┌─────────────────────────────────────────────────────────────┐
   │ Caller / Orchestrator (e.g. K4a Replay / K4b Repair Shadow) │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
               1. createWorkspace({ source_snapshot_id })
                                  │
                                  ▼
         ┌──────────────────────────────────────────────────┐
         │ scripts/lib/worker-workspace.js                  │
         │ - Genera workspace_id (ws-...)                   │
         │ - Registra en private workspace registry         │
         │ - Captura baselineInventory                      │
         │ - Retorna workspace-descriptor/v1 (active)       │
         └────────────────────────┬─────────────────────────┘
                                  │
                                  ▼
         2. materializeSourceSnapshot(workspace, workOrder, sourceSnapshot, { capsule_inputs })
                                  │
                                  ▼
         ┌──────────────────────────────────────────────────┐
         │ scripts/lib/worker-workspace.js                  │
         │ - Proyecta inputs declarados exclusivamente      │
         │ - Valida dependencias DAG SHA-256                │
         │ - Calcula fingerprint determinista               │
         │ - Actualiza baselineInventory de la cápsula      │
         │ - Retorna capsule-definition/v1                  │
         └────────────────────────┬─────────────────────────┘
                                  │
                                  ▼
         3. executeWorkOrder({ workOrder, workspace, transports, budget, signal })
                                  │
                                  ▼
         ┌──────────────────────────────────────────────────┐
         │ scripts/lib/worker-executor.js                   │
         │ - Pre-flight check de rutas declaradas           │
         │ - Evalúa capability con resolveCapabilityState   │
         │ - Invoca WorkerTransport (invokeTransportAsync)  │
         │ - Controla timeouts K5 y AbortSignal             │
         └────────────────────────┬─────────────────────────┘
                                  │
                     ┌────────────┴────────────┐
             [Valid] │                         │ [Violation]
                     ▼                         ▼
         ┌─────────────────────────┐     ┌──────────────────────────────────┐
         │ Ejecución Asíncrona     │     │ Emit containment-violation/v1    │
         │ - Captura stdout/stderr │     │ Halt fail-closed                 │
         │ - Mide duración y usage │     └──────────────────────────────────┘
         └───────────┬─────────────┘
                     │
         ┌───────────┴───────────────────────┐
 [Normal │ Exit]                             │ [Timeout / Abort Signal]
         ▼                                   ▼
 4. Inspección Post-Flight & Delta   5. recoverInterruptedExecution(...)
         │                                   │
         ▼                                   ▼
 ┌──────────────────────────────┐    ┌──────────────────────────────────┐
 │ - Deriva mutation delta:     │    │ - Captura logs parciales         │
 │   created, modified, deleted │    │ - Inventario de cambios parciales│
 │ - validateAllowedPaths(delta)│    │ - Estado workspace: interrupted  │
 │ - Genera unified diff real   │    │ - Retorna descriptor de recovery │
 │ - computeWorkResultId(K3)    │    └──────────────────────────────────┘
 │ - Retorna work-result/v1     │
 └──────────────┬───────────────┘
                │
                ▼
 6. disposeWorkspace(workspaceDescriptor)
                │
                ▼
 ┌──────────────────────────────┐
 │ - Valida en registro privado │
 │ - Elimina directorio raíz    │
 │ - Desregistra y marca        │
 │   status: disposed           │
 └──────────────────────────────┘
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/worker-workspace.js` | Modify | Implementa registro privado de workspaces, captura de `baselineInventory`, proyección desacoplada de `capsule_inputs` y cálculo determinista de `fingerprint`. |
| `scripts/lib/worker-executor.js` | Modify | Conecta con `WorkerTransport` e `invokeTransportAsync`, delega en `computeWorkResultId` de `execution-identities`, maneja `AbortSignal` asíncrono y genera unified diffs reales sobre mutation deltas. |
| `scripts/lib/allowed-paths-validator.js` | Modify | Valida contención sobre deltas de mutación e incorpora inspección de symlinks en jerarquías no instanciadas. |
| `schemas/kernel/capsule-definition/v1.schema.json` | Modify | Añade soporte para la propiedad opcional `capsule_inputs: string[]` en el esquema de cápsula. |
| `schemas/kernel/capsule-definition/fixtures/valid/` | Modify | Actualiza fixtures de cápsula con `capsule_inputs` y dependencias SHA-256. |
| `schemas/kernel/work-result-execution-payload/fixtures/valid/` | Modify | Actualiza fixtures con parches unified diff válidos y hashes bound canónicos. |
| `scripts/lib/contract-checkers/k6a-canonical-contracts.js` | Create | Checker para contract-lint que valida consumo de contratos canónicos K3/K4a y rechaza `.files` sintéticos o dependencias no-SHA256. |
| `scripts/lib/contract-lint.js` | Modify | Registra `checkK6aCanonicalContracts` en `DEFAULT_REGISTRY`. |
| `scripts/lib/lifecycle-model.js` | Modify | Actualiza la implementación de los 6 invariantes K6a (`inv-k6a-*`) con contratos canónicos y composición asíncrona. |
| `scripts/lib/worker-workspace.test.js` | Modify | Tests unitarios para registro privado, `baselineInventory` y materialización con `capsule_inputs`. |
| `scripts/lib/worker-executor.test.js` | Modify | Tests unitarios para `WorkerTransport`, `computeWorkResultId` canónico, `AbortSignal` y unified diff real. |
| `scripts/lib/allowed-paths-validator.test.js` | Modify | Tests para validación sobre deltas de mutación y escape de symlinks en ancestros. |
| `scripts/k6a-e2e-worker-isolation.test.js` | Modify | Suite E2E completa de integración K3 (`SourceSnapshot`) -> K4a (`WorkOrder v2`) -> K6a (`ExecuteWorkOrder`) -> K3 (`validateWorkResultBinding`) con reconstrucción de diff. |

---

## Interfaces / Contracts

### 1. Workspace Descriptor (`workspace-descriptor/v1`)

```typescript
interface WorkspaceDescriptor {
  schema_version: 1;
  workspace_id: string; // pattern: ^ws-[a-f0-9-]+$
  root_path: string;
  source_snapshot_id: string; // pattern: ^sha256:[a-f0-9]{64}$
  status: "active" | "disposed" | "interrupted";
  created_at: string; // ISO 8601
}

interface InternalWorkspaceRecord {
  descriptor: WorkspaceDescriptor;
  rootPath: string;
  baselineInventory: Array<FilesystemInventoryEntry>;
  createdAt: number;
}
```

### 2. Capsule Definition (`capsule-definition/v1`)

```typescript
interface CapsuleDefinition {
  schema_version: 1;
  capsule_id: string;
  fingerprint: string; // pattern: ^sha256:[a-f0-9]{64}$
  source_snapshot_id: string; // pattern: ^sha256:[a-f0-9]{64}$
  dependencies: string[]; // array of sha256 WorkOrder IDs
  capsule_inputs?: string[]; // relative file paths to project
  allowed_paths: string[];
  environment: Record<string, string>;
}
```

### 3. Work Result Execution Payload (`work-result-execution-payload/v1` & `work-result/v1`)

```typescript
interface FilesystemInventoryEntry {
  path: string;
  sha256: string; // pattern: ^sha256:[a-f0-9]{64}$
  mode: number;
}

interface CommandOutcome {
  command: string;
  exit_code: number;
  duration_ms: number;
}

interface WorkResultPayload {
  schema_version: 1;
  work_result_id: string; // computed via computeWorkResultId(payload)
  work_order_id: string;
  source_snapshot_id: string;
  patch: string; // applicable unified diff
  commands: CommandOutcome[];
  logs: string[];
  exit_code: number;
  filesystem_inventory: FilesystemInventoryEntry[];
  execution_usage?: {
    wall_time_ms: number;
    memory_peak_bytes?: number;
  };
}
```

### 4. Mutation Delta Structure

```typescript
interface MutationDelta {
  created: string[];
  modified: string[];
  deleted: string[];
  allMutations: string[];
}
```

### 5. Signaturas de Módulos de Runtime

```javascript
// scripts/lib/worker-workspace.js
async function createWorkspace(options = {}): Promise<WorkspaceDescriptor>;
async function materializeSourceSnapshot(workspaceDescriptor, workOrder, sourceSnapshot, options = {}): Promise<CapsuleDefinition>;
async function disposeWorkspace(workspaceDescriptorOrId): Promise<{ ok: boolean, workspace_id: string, status: "disposed" }>;
async function inspectWorkspace(workspaceDescriptor): Promise<Array<FilesystemInventoryEntry>>;

// scripts/lib/allowed-paths-validator.js
function validateAllowedPaths(targetPaths, allowedPaths, options = {}): { ok: boolean, violation?: ContainmentViolation };
function isPathContained(targetPath, allowedPaths, workspaceRoot): boolean;

// scripts/lib/worker-executor.js
async function executeWorkOrder(options): Promise<{ ok: boolean, workResult?: WorkResultPayload, recovery?: Object, violation?: ContainmentViolation, isolationReported: string }>;
async function captureWorkResult(options): Promise<WorkResultPayload>;
async function recoverInterruptedExecution(options): Promise<Object>;
```

---

## Testing Strategy

| Capa | Qué se Prueba | Enfoque |
|------|--------------|---------|
| **Unit: Workspace Lifecycle** | `createWorkspace`, registro privado, captura de `baselineInventory`, `disposeWorkspace` seguro e idempotente, materialización con `capsule_inputs` | `scripts/lib/worker-workspace.test.js` con workspaces temporales |
| **Unit: Path Containment** | `validateAllowedPaths` sobre deltas de mutación, traversal (`../`), symlinks intermedios no instanciados, escrituras fuera de `allowed_paths` | `scripts/lib/allowed-paths-validator.test.js` con matrices de rutas y symlinks |
| **Unit: Worker Executor** | Conexión con `WorkerTransport`, `computeWorkResultId` canónico de `execution-identities`, propagación de `AbortSignal`, timeouts K5, generación de unified diff real | `scripts/lib/worker-executor.test.js` con mocks de transporte y subprocesos reales |
| **Contract Lint** | Verificador `k6a-canonical-contracts` detectando fixtures no canónicas (`.files`, no-SHA256) | `scripts/lib/contract-lint.test.js` y tests del checker |
| **Model Conformance** | 6 invariantes K6a (`inv-k6a-*`) verificados contra el Minimal Kernel Harness | `scripts/lib/k6a-lifecycle-model.test.js` |
| **E2E Integration** | Pipeline completo K3 (`SourceSnapshot`) -> K4a (`WorkOrder v2`) -> K6a (`ExecuteWorkOrder`) -> K3 (`validateWorkResultBinding`) con reconstrucción de diff | `scripts/k6a-e2e-worker-isolation.test.js` |

---

## Migration / Rollout

- **No se requiere migración de datos**: La remediación ajusta componentes en memoria, schemas de validación y utilidades de ejecución sin alterar almacenes persistentes existentes.
- **Actualización de Fixtures**: Se actualizan las fixtures de prueba en `schemas/kernel/` y suites de test para proveer contratos canónicos K3/K4a.
- **Rollback Plan**: Revertir los commits del cambio mediante `git revert` o checkout a la versión previa a la remediación.

---

## Open Questions

Ninguna. Todos los puntos de integración, contratos de datos y comportamientos en fallo cerrado han sido formalizados en las especificaciones delta y decisiones de arquitectura.
