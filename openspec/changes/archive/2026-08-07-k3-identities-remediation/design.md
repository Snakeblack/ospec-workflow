# Design: Remediación de Identidades de Ejecución y Candidate Freeze K3

## Technical Approach

Esta remediación técnica aborda las debilidades y laxitudes de seguridad en el sistema de identidades de ejecución K3 (`SourceSnapshotId`, `WorkOrderId`, `WorkResultId`, `CandidateId`). El enfoque principal consiste en:

1. **Restaurar e Inmutabilizar K1**: Mantener intocables los esquemas `candidate/v1.schema.json` y `work-order/v1.schema.json` así como el pin de hashes `K1_SCHEMA_BASELINE` en `scripts/lib/lifecycle-kernel/k1-compat.js`.
2. **Introducir Esquemas v2 Explícitos**: Definir `schemas/kernel/candidate/v2.schema.json` y `schemas/kernel/work-order/v2.schema.json` con el campo discriminador `kind` obligatorio ("candidate/v2", "work-order/v2"), patrones de regex strictly `^sha256:[a-f0-9]{64}$` y campos `required` de freeze/binding en la raíz.
3. **Endurecer las Funciones Compute**: Requerir campos obligatorios, validar el formato `sha256:<64 hex>` en todos los digests de referencia e integrar canónicamente `dependencies`, `ownership` y `required_evidence` dentro de `computeWorkOrderId`.
4. **`freezeCandidate()` Exclusivo para v2**: Convertir `freezeCandidate()` en el constructor único de objetos `candidate/v2`, rechazando proyecciones no soportadas (`commit`) y desambiguando de forma estricta entre `diffText` (cadena diff cruda, siempre hasheada en SHA-256) y `diff_hash` (digest prefijado y validado).
5. **Funciones de Binding Fail-Closed**: Implementar `validateWorkOrderBinding` y `validateWorkResultBinding` en `scripts/lib/execution-identities/index.js` para asegurar la alineación entre órdenes, resultados y snapshots.
6. **Recálculo Obligatorio de Digests en Evaluaciones**: Modificar `evaluateCandidateRelation` para recalcular canónicamente los digests de baseline y target desde sus cargas frozen, ignorando los `candidate_id` declarados en los objetos y devolviendo un error `DECLARED_ID_MISMATCH` con `relation: "unknown"` y `action: "stop"` ante cualquier divergencia.
7. **Discriminación Cerrada por Tipo de Identidad**: Reemplazar guardas permisivos en `validateIdentityKind` por comprobaciones cerradas de `kind` y una regla positiva que exige que el target de attestations y autorizaciones sea un `CandidateId` sintácticamente válido (`sha256:<64 hex>`).

---

## Architecture Decisions

### Decision 1: Versionado y Discriminación con `kind` en Schemas v2 preservando Immutabilidad v1

**Choice**: Crear `schemas/kernel/candidate/v2.schema.json` (`$id: "ospec://schemas/kernel/candidate/v2"`) y `schemas/kernel/work-order/v2.schema.json` (`$id: "ospec://schemas/kernel/work-order/v2"`) que exigen el campo constante `kind: "candidate/v2"` y `kind: "work-order/v2"` respectivamente, manteniendo los esquemas v1 y sus pins en `K1_SCHEMA_BASELINE` inalterados.  
**Alternatives considered**: Modificar los esquemas v1 existentes para agregar `kind` o permitir esquemas sin discriminador de tipo explícito.  
**Rationale**: Modificar v1 violaría la inmutabilidad de los contratos base K1 verificados por `assertK1SchemasUnchanged`. Los esquemas v2 permiten una discriminación cerrada e impiden la confusión de tipos entre un `WorkResult` y un `Candidate`.

---

### Decision 2: Recálculo Determinista de Candidatos en `evaluateCandidateRelation`

**Choice**: En `evaluateCandidateRelation(baseline, target)`, calcular los digests canónicos reales a partir de los datos frozen de baseline y target usando `computeCandidateId`. Si el atributo `candidate_id` declarado existe y no coincide exactamente con el recalculado, retornar un estado de error `DECLARED_ID_MISMATCH` (`relation: "unknown"`, `action: "stop"`).  
**Alternatives considered**: Confiar implícitamente en la propiedad `candidate_id` enviada por el cliente si está presente.  
**Rationale**: Confiar en el ID declarado expone al sistema a ataques de suplantación de identidad (spoofing), donde un cliente modifica el contenido del árbol pero mantiene el `candidate_id` de un candidato previamente verificado.

---

### Decision 3: Desambiguación Estricta de Diff en `freezeCandidate()`

**Choice**: Exigir que `freezeCandidate` acepte `diffText` (cadena de texto diff cruda que será automáticamente hasheada en un digest `sha256:<64 hex>`) o `diff_hash` (digest que debe cumplir con el patrón `^sha256:[a-f0-9]{64}$`). Si se pasa una cadena sin el prefijo `sha256:` como `diff_hash`, la operación falla inmediatamente.  
**Alternatives considered**: Detectar heurísticamente si `diff_hash` parece un diff y hashearlo sobre la marcha.  
**Rationale**: Las heurísticas silenciosas introducen comportamientos no deterministas y permiten el paso de digests corruptos o ambiguos.

---

### Decision 4: Regla Positiva para Attestations y Delivery Authorizations

**Choice**: Exigir que `validateIdentityKind(payload, expectedKind)` verifique activamente que los campos de referencia a candidatos en `CandidateEvaluationAttestation` y `DeliveryAuthorization` sean digests válidos con formato `sha256:<64 hex>`, rechazando explícitamente cualquier referencia mutable (ramas Git como `main` o rutas de archivos).  
**Alternatives considered**: Usar comprobaciones negativas (blacklist) para rechazar solo cadenas conocidas como `refs/heads/`.  
**Rationale**: Las listas negras son permisivas y vulnerables a variaciones. Una regla positiva (whitelist por expresión regular) garantiza que solo candidatos congelados con un digest criptográfico puedan ser atestiguados o autorizados para entrega.

---

## Data Flow

El flujo de vida de las identidades K3 y sus puntos de validación de binding y freeze se ilustra a continuación:

```
 [SourceSnapshot] (sha256:...)
        │
        ├───► computeWorkOrderId ──► [WorkOrder v2] (kind: "work-order/v2", sha256:...)
        │                                 │
        │                                 ├───► Worker Execution ──► [WorkResult] (unapproved)
        │                                 │                               │
        │                                 ▼                               ▼
        │                       validateWorkOrderBinding      validateWorkResultBinding
        │                                 │                               │
        │                                 └───────────────┬───────────────┘
        │                                                 ▼
        └────────────────────────────────────────► freezeCandidate
                                                          │
                                                          ▼
                                                   [Candidate v2] (kind: "candidate/v2", sha256:...)
                                                          │
                                    ┌─────────────────────┴─────────────────────┐
                                    ▼                                           ▼
                      evaluateCandidateRelation                   validateIdentityKind (Attestation/Delivery)
                   (recalcula candidate_id real)                       (valida digest sha256 positivo)
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/lifecycle-kernel/k1-compat.js` | Modify | Verificar y preservar los pins K1 sin alteración; asegurar la exclusión de v2 en inspecciones baseline. |
| `schemas/kernel/candidate/v1.schema.json` | Preserve | Mantener inalterado el esquema v1. |
| `schemas/kernel/work-order/v1.schema.json` | Preserve | Mantener inalterado el esquema v1. |
| `schemas/kernel/candidate/v2.schema.json` | Create | Nuevo esquema JSON para `candidate/v2` con `kind`, regex sha256 y campos requeridos. |
| `schemas/kernel/work-order/v2.schema.json` | Create | Nuevo esquema JSON para `work-order/v2` con `kind`, regex sha256, `dependencies`, `ownership` y `required_evidence`. |
| `scripts/lib/execution-identities/index.js` | Modify | Implementar las 4 funciones compute con validación estricta, `freezeCandidate` para v2, bindings y recálculo en `evaluateCandidateRelation`. |
| `scripts/lib/execution-identities/index.test.js` | Modify | Ampliar la suite unitaria e implementar los 14 escenarios de pruebas adversariales. |

---

## Interfaces / Contracts

### Signature: `computeSourceSnapshotId`

```typescript
function computeSourceSnapshotId(snapshot: {
  repositoryId?: string;
  repository_id?: string;
  baseTreeDigest?: string;
  base_tree_digest?: string;
  projection: "workspace" | "staged";
  dependencyDigests?: string[];
  dependency_digests?: string[];
}): string; // Retorna "sha256:<64 hex>"
```

### Signature: `computeWorkOrderId`

```typescript
function computeWorkOrderId(workOrder: {
  sourceSnapshotId?: string;
  source_snapshot_id?: string;
  nodeId?: string;
  node_id?: string;
  role: string;
  operation?: string;
  objective?: string;
  dependencies?: string[];
  ownership?: { owner: string; mode: "exclusive" | "shared" };
  allowedPaths?: string[];
  allowed_paths?: string[];
  invariants?: string[];
  requiredEvidence?: string[];
  required_evidence?: string[];
  budget?: {
    model_turns: number;
    patches: number;
    commands: number;
    wall_time_minutes: number;
    changed_lines: number;
  };
}): string; // Retorna "sha256:<64 hex>"
```

### Signature: `computeWorkResultId`

```typescript
function computeWorkResultId(workResult: {
  workOrderId?: string;
  work_order_id?: string;
  sourceSnapshotId?: string;
  source_snapshot_id?: string;
  patch: string;
  commands?: object[];
  logs?: string[];
  exitCode?: number;
  exit_code?: number;
  filesystemInventory?: object[];
  filesystem_inventory?: object[];
}): string; // Retorna "sha256:<64 hex>"
```

### Signature: `computeCandidateId`

```typescript
function computeCandidateId(candidate: {
  repositoryId?: string;
  repository_id?: string;
  projection: "workspace" | "staged";
  baseTree?: string;
  base_tree?: string;
  candidateTree?: string;
  candidate_tree?: string;
  diffHash?: string;
  diff_hash?: string;
  pathsDigest?: string[];
  paths?: string[];
  changedPathsModesDigest?: string;
  changed_paths_modes_digest?: string;
  intendedUntrackedDigest?: string | null;
  intended_untracked_digest?: string | null;
}): string; // Retorna "sha256:<64 hex>"
```

### Signature: `freezeCandidate`

```typescript
function freezeCandidate(input: {
  repositoryId?: string;
  repository_id?: string;
  projection: "workspace" | "staged";
  baseTree?: string;
  base_tree?: string;
  candidateTree?: string;
  candidate_tree?: string;
  diffText?: string;
  diffHash?: string;
  diff_hash?: string;
  paths?: string[];
  fileModes?: Record<string, string>;
  changed_paths_modes_digest?: string;
  intendedUntracked?: Array<{ path: string; hash: string }> | object;
  intended_untracked_digest?: string | null;
  predecessorId?: string;
  predecessor_id?: string;
}): {
  kind: "candidate/v2";
  schema_version: 2;
  candidate_id: string;
  repository_id: string;
  projection: "workspace" | "staged";
  base_tree: string;
  candidate_tree: string;
  diff_hash: string;
  paths: string[];
  changed_paths_modes_digest: string;
  intended_untracked_digest: string | null;
  predecessor_id: string | null;
  relation: "exact";
};
```

### Signatures: Bindings

```typescript
function validateWorkOrderBinding(workOrder: object): {
  ok: boolean;
  reason_code?: string;
  error?: string;
};

function validateWorkResultBinding(workOrder: object, workResult: object): {
  ok: boolean;
  reason_code?: string;
  error?: string;
};
```

### Signature: `evaluateCandidateRelation`

```typescript
function evaluateCandidateRelation(
  baseline: object,
  target: object
): {
  relation: "exact" | "changed" | "ambiguous" | "unknown";
  action: "validate" | "re-evaluate" | "decide" | "stop";
  reason_code?: string;
  reason?: string;
};
```

### Signature: `validateIdentityKind`

```typescript
function validateIdentityKind(
  payload: object,
  expectedKind: string
): {
  ok: boolean;
  reason_code?: string;
};
```

---

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit / Contract | Schemas v2 y compatibilidad K1 | Validar fixtures valid e invalid contra `candidate/v2.schema.json` y `work-order/v2.schema.json`. Ejecutar `assertK1SchemasUnchanged`. |
| Unit / Logic | Funciones `compute*` y `freezeCandidate` | Verificar determinismo, formato `sha256:<64 hex>`, ordenamiento canónico de arreglos y proyecciones requeridas. |
| Adversarial / Security | 14 escenarios de ataques e inyecciones | Suite dedicada en `index.test.js` ejecutando ataques de suplantación, binding bypass y alteración de firmas. |

### Desglose de los 14 Escenarios Adversariales

1. **Suplantación de CandidateId en `evaluateCandidateRelation`**: Baseline/Target con `candidate_id` alterado arbitrariamente. Debe retornar `DECLARED_ID_MISMATCH` (`unknown` / `stop`).
2. **Aceptación Directa de WorkResult**: Intentar pasar un `WorkResult` directamente como `Candidate` en `validateIdentityKind`. Debe fallar con `KIND_MISMATCH`.
3. **Mismatched WorkOrderId en Result Binding**: `WorkResult` que referencia un `work_order_id` distinto al `WorkOrder` en `validateWorkResultBinding`. Debe retornar `WORK_ORDER_MISMATCH`.
4. **Mismatched SourceSnapshotId en Order Binding**: `WorkResult` o `WorkOrder` con `source_snapshot_id` desalineado. Debe retornar `SNAPSHOT_MISMATCH`.
5. **Rechazo de Proyección `commit` en Freeze**: Invocar `freezeCandidate()` especificando `projection: "commit"`. Debe lanzar un error fail-closed.
6. **Formato Digest Malformado en Snapshot**: Pasar `source_snapshot_id` fuera del formato `sha256:<64 hex>` a `computeWorkOrderId`. Debe lanzar `TypeError`/`Error`.
7. **Propiedades Obligatorias Faltantes en `computeCandidateId`**: Invocar `computeCandidateId` omitiendo `base_tree` o `projection`. Debe lanzar `Error`.
8. **Desambiguación de Diff Crudo vs Hash Digest**: Pasar una cadena no digest a `diff_hash`. Debe fallar fail-closed.
9. **Referencia Mutable en Rama Git para Attestation**: Intentar crear una atestación apuntando a `refs/heads/main` o `master`. Debe retornar `MUTABLE_TARGET_REJECTED`.
10. **Target de Attestations con Cadena No SHA-256**: Pasar un identificador aleatorio como target de atestación. Debe fallar con `INVALID_TARGET`.
11. **Alteración de Dependencies/Ownership en WorkOrder**: Cambiar `ownership` o `dependencies` manteniendo el resto igual. Debe generar digests `WorkOrderId` diferentes.
12. **Negative Fixture: WorkResult validado contra Candidate v2 Schema**: Payload de `WorkResult` evaluado en `candidate/v2.schema.json`. Debe fallar la validación JSON Schema.
13. **Negative Fixture: Candidate validado contra WorkOrder v2 Schema**: Payload de `Candidate` evaluado en `work-order/v2.schema.json`. Debe fallar la validación JSON Schema.
14. **Modificación de Permisos de Archivo (100644 vs 100755)**: Mismo contenido de archivo con distinta máscara de permisos. Debe alterar `changed_paths_modes_digest` y derivar un `CandidateId` distinto.

---

## Migration / Rollout

No se requiere migración de base de datos ni feature flags. La actualización mantiene compatibilidad hacia atrás con contratos v1 mediante `k1-compat.js` y expone las nuevas capacidades v2 en `scripts/lib/execution-identities/index.js`.

---

## Open Questions

None
