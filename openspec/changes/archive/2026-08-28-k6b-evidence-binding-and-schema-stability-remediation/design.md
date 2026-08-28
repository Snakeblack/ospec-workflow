# Design: K6b Evidence Binding and Schema Stability Remediation

## Technical Approach

Esta remediación implementa una arquitectura robusta para la estabilidad de esquemas del kernel, la integridad semántica en el enlace de evidencias y la validación estricta de reproducción en el Assurance Graph dentro del marco K6b.

El enfoque técnico se estructura en tres componentes principales alineados con las especificaciones del cambio:
1. **Publicación y retrocompatibilidad de esquemas del kernel**: Publicación canónica de `schemas/kernel/assessment/v2.schema.json` (`$id: "ospec://schemas/kernel/assessment/v2"`, `schema_version: 2`, `kind: "assessment/v2"`), exigiendo la propiedad `evidence_requirements_satisfied` con `minItems: 1` para afirmaciones de satisfacción y prohibiendo `verdict`. Se restaura `assessment/v1.schema.json` al contrato retrocompatible de la versión v2.51.0 sin romper consumidores legados, y se registran ambos en `manifest.json` y `contract-claims.json`. Los esquemas y fixtures de `evidence/v2`, `verification/v2` y K1 v1 se mantienen estrictamente inmutables (byte-identical).
2. **Aislamiento de frontera de confianza y enlace autoritativo de evidencias**: Desacoplamiento formal entre las observaciones físicas del runner (`rawEvidence`: bytes del payload, `provenance`, `origin`, `node_id` y `execution_sequence: {run_id, ordinal, previous_evidence_id}`) y los metadatos semánticos de confianza (`role`, `obligation_ids`, `evidence_requirements_satisfied`). El verificador independiente (`independent-verifier`) deriva autoritativamente estos metadatos a partir de los recibos de ejecución y del Execution Graph compilado, descartando claims no confiables del invocador. Se incorpora una matriz formal de incompatibilidad de roles (`red` ↔ `green`, `characterization-before` ↔ `characterization-after`, `negative` ↔ `acceptance`) y validación cronológica estricta para TDD y refactorizaciones.
3. **Validación fail-closed de digests canónicos, replay integral y Assurance Graph**: `resolveCanonicalInputDigests()` computa y verifica autoritativamente `openspec_input_digest`, fallando con `GRAPH_DIVERGENCE` ante cualquier discordancia o ausencia de entradas requeridas. `replayAssuranceGraph` realiza una revalidación completa de los registros persistidos de `evidence/v2`, `verification/v2` y `assessment/v2` (validación de esquemas, recomputación de identidades hash, bindings de candidate y subconjuntos de IDs). Por último, el proyector de Assurance Graph emite aristas `satisfies` única y exclusivamente cuando `evidence_requirements_satisfied.length > 0`.

---

## Architecture Decisions

### Decision: ADR-001 - Publicación Canónica de assessment/v2 y Restauración Retrocompatible de assessment/v1

| Opción | Trade-off | Decisión |
|---|---|---|
| **Publicar `assessment/v2` y restaurar `assessment/v1` v2.51.0** (Elegida) | Introduce un nuevo esquema pero previene rupturas y garantiza que `evidence_requirements_satisfied` sea obligatorio (`minItems: 1`). | **Elegida**: Publicar `assessment/v2.schema.json` y preservar `assessment/v1.schema.json` intacto para compatibilidad histórica. |
| Modificar in-place `assessment/v1.schema.json` con `minItems: 1` | Rompe consumidores históricos y artefactos archivados de versiones previas. | Descartada por violación de retrocompatibilidad. |
| Validación exclusiva en código JavaScript sin restricciones en esquema JSON | Reduce cambios en esquemas pero debilita la validación formal y verificación entre lenguajes. | Descartada por falta de rigor formal en contratos del kernel. |

**Choice**: Publicar `schemas/kernel/assessment/v2.schema.json` con `$id: "ospec://schemas/kernel/assessment/v2"`, `schema_version: 2`, `kind: "assessment/v2"`, con `evidence_requirements_satisfied` obligatorio (`minItems: 1`, `uniqueItems: true`), `role` restringido al catálogo canónico, `additionalProperties: false` y prohibición de `verdict`. Restaurar `schemas/kernel/assessment/v1.schema.json` al contrato v2.51.0. Registrar ambos en `manifest.json` y `contract-claims.json`.

**Alternatives considered**: Modificar destructivamente v1 o depender exclusivamente de aserciones en tiempo de ejecución.

**Rationale**: Garantiza la inmutabilidad de los contratos kernel, proporciona compatibilidad hacia atrás total para artefactos v1 y establece un estándar inequívoco donde una evaluación v2 no puede emitirse con listas de cobertura vacías.

---

### Decision: ADR-002 - Desacoplamiento de Frontera de Confianza entre Observaciones Físicas y Metadatos Semánticos

| Opción | Trade-off | Decisión |
|---|---|---|
| **Separación estricta entre `rawEvidence` y metadatos derivados** (Elegida) | El verificador debe computar y resolver los enlaces semánticos, pero garantiza integridad de confianza. | **Elegida**: `rawEvidence` contiene solo datos físicos y de ejecución; `role`, `obligation_ids` y cobertura son derivados por el verifier. |
| Confiar en anotaciones semánticas inyectadas por el invocador/worker | Simplifica el código del verifier pero permite suplantación y falsificación de satisfacción de obligaciones. | Descartada por vulnerar la frontera de confianza de verificación independiente. |
| Incrustar campos de evaluación semántica en `evidence/v2.schema.json` | Mezcla observación física inmutable con juicio semántico de evaluación. | Descartada porque contamina el registro de observación con veredictos de interpretación. |

**Choice**: Tratar `rawEvidence` exclusivamente como la observación física del runner (`payload bytes`, `provenance`, `origin`, `node_id`, `execution_sequence: {run_id, ordinal, previous_evidence_id}`). Los metadatos semánticos (`role`, `obligation_ids`, `evidence_requirements_satisfied`) se derivan autoritativamente en el arnés de verificación (`independent-verifier`) mediante inspección del Execution Graph compilado y recibos del runner.

**Alternatives considered**: Confiar en payloads enriquecidos por workers o mutar el esquema de evidencia para incrustar obligaciones.

**Rationale**: Asegura que un worker no pueda afirmar que una ejecución arbitraria satisface un requisito MUST sin que el arnés lo vincule deterministamente contra el grafo de ejecución.

---

### Decision: ADR-003 - Validación Fail-Closed de Digests Canónicos, Replay Integral y Proyección Condicional de Satisfacción

| Opción | Trade-off | Decisión |
|---|---|---|
| **Validación fail-closed de `openspec_input_digest`, replay integral y aristas condicionales** (Elegida) | Aumenta el rigor en las aserciones de proyección y replay, previniendo estados inconsistentes o falsos positivos. | **Elegida**: Fallar con `GRAPH_DIVERGENCE` ante cualquier discordancia, revalidar todos los tipos de registros en replay y emitir `satisfies` solo si `length > 0`. |
| Proyectar aristas `satisfies` sin comprobar el tamaño de satisfacción | Permite grafos con aristas de satisfacción vacías que no demuestran cumplimiento de tokens. | Descartada por imprecisión semántica en el Assurance Graph. |
| Matriz binaria simple (prohibición total de reuso de evidencia) | Impide que una prueba de integración válida satisfaga simultáneamente un criterio de aceptación compatible. | Descartada por restringir patrones de prueba legítimos. |

**Choice**:
1. Implementar validación estricta en `resolveCanonicalInputDigests()` para `openspec_input_digest`, `contract_digest`, `policy_snapshot_id` y `execution_graph_digest`, detonando `GRAPH_DIVERGENCE` si difieren del cálculo autoritativo.
2. Definir una matriz formal de incompatibilidad de roles (`red` ↔ `green`, `characterization-before` ↔ `characterization-after`, `negative` ↔ `acceptance`) y permitir combinaciones compatibles (`integration` + `acceptance`, `invariant` + `integration`, `smoke` + `acceptance`).
3. Revalidar exhaustivamente en replay `evidence/v2` (digest de bytes, candidato, procedencia, ausencia de veredicto), `verification/v2` (id recomputado, candidato, subconjunto de evidencias) y `assessment/v2` (id recomputado, candidato, política, existencia de evidencia/obligación, minItems: 1).
4. Proyectar la arista `satisfies` en el Assurance Graph únicamente si `evidence_requirements_satisfied.length > 0`.

**Alternatives considered**: Ignorar discrepancias de OpenSpec digest o prohibir el compartimiento de evidencias entre roles compatibles.

**Rationale**: Mantiene el Assurance Graph como una proyección determinista, matemáticamente reproducible y libre de aserciones falsas.

---

## Data Flow

```
   ┌────────────────────────────────────────────────────────┐
   │             Runner / Physical Collector                │
   │  Emite rawEvidence: { bytes, provenance, origin,       │
   │    node_id, execution_sequence: {run_id, ordinal, ...}}│
   └───────────────────────────┬────────────────────────────┘
                               │ (Observación física aislada)
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │         Independent Verifier: Binding & Policy         │
   │  1. Valida frontera de procedencia con Collector       │
   │  2. Normaliza a evidence/v2                            │
   │  3. Deriva autoritativamente role y obligation_ids     │
   │     desde Execution Graph y runner receipts            │
   │  4. Aplica Matriz de Incompatibilidad de Roles         │
   │  5. Valida Secuencia Cronológica (TDD / Refactor)      │
   │  6. Verifica Obligation Coverage (MUST -> non-empty)   │
   │  7. Emite persistable assessment/v2 (minItems: 1)      │
   │  8. Emite verification/v2 (PASS | PASS WITH WARNINGS)  │
   └───────────────────────────┬────────────────────────────┘
                               │
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │               Assurance Graph Projector                │
   │  1. resolveCanonicalInputDigests():                    │
   │     - Computa autoritativamente openspec_input_digest  │
   │     - Valida contract, policy, execution_graph digests │
   │     - Falla con GRAPH_DIVERGENCE ante discrepancias    │
   │  2. Proyección de nodos y aristas:                     │
   │     - Proyecta aristas satisfies SOLO SI               │
   │       evidence_requirements_satisfied.length > 0       │
   │  3. Computa graph_id canónico                          │
   └───────────────────────────┬────────────────────────────┘
                               │
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │               Replay Assurance Graph                   │
   │  1. Revalida evidence/v2 (schema, candidate, digest)   │
   │  2. Revalida verification/v2 (id, candidate, subset)   │
   │  3. Revalida assessment/v2 (schema, candidate, policy, │
   │     node_id match, obligation match, coverage > 0)     │
   │  4. Reconstruye y compara graph_id de forma idéntica   │
   └────────────────────────────────────────────────────────┘
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `schemas/kernel/assessment/v2.schema.json` | Create | Esquema JSON Draft 2020-12 canónico de `assessment/v2` con `minItems: 1` en `evidence_requirements_satisfied`. |
| `schemas/kernel/assessment/v1.schema.json` | Modify | Restaurar contrato retrocompatible de la versión v2.51.0. |
| `schemas/kernel/assessment/fixtures/valid/v2-complete.json` | Create | Fixture válida de `assessment/v2` con cobertura no vacía. |
| `schemas/kernel/assessment/fixtures/valid/v2-four-roles.json` | Create | Fixture válida con 4 roles de evaluación para un mismo `evidence_id`. |
| `schemas/kernel/assessment/fixtures/invalid/v2-empty-coverage.json` | Create | Fixture inválida con `evidence_requirements_satisfied: []` para verificar fallo fail-closed. |
| `schemas/kernel/assessment/fixtures/invalid/v2-with-verdict.json` | Create | Fixture inválida que incluye `verdict` para verificar rechazo fail-closed. |
| `schemas/kernel/assessment/fixtures/invalid/v2-missing-coverage.json` | Create | Fixture inválida que omite `evidence_requirements_satisfied`. |
| `schemas/kernel/manifest.json` | Modify | Registrar familia `assessment-v2` (`path: "schemas/kernel/assessment/v2.schema.json"`, `$id: "ospec://schemas/kernel/assessment/v2"`, `schema_version: 2`) y mantener `assessment` v1. |
| `schemas/kernel/contract-claims.json` | Modify | Registrar familia `assessment-v2` con sus campos requeridos y valores de enumeración de roles y kind. |
| `scripts/lib/independent-verifier/assessment.js` | Modify | Actualizar emisión y validación de `assessment/v2` como estándar por defecto, calculando `assessment_id` v2 y manteniendo soporte retrocompatible para v1. |
| `scripts/lib/independent-verifier/evidence.js` | Modify | Procesar `rawEvidence` desacoplando metadatos semánticos y soportando `execution_sequence` para validación cronológica. |
| `scripts/lib/independent-verifier/strategy-policy.js` | Modify | Implementar matriz formal de incompatibilidad de roles (`red` ↔ `green`, `characterization-before` ↔ `characterization-after`, `negative` ↔ `acceptance`) y validación de secuencia temporal de refactorización (`characterization-before` -> `characterization-after`). |
| `scripts/lib/independent-verifier/obligation-coverage.js` | Modify | Emisión de `assessment/v2` asegurando que cada token de satisfacción sea no vacío y que cubra el subconjunto de `required_evidence`. |
| `scripts/lib/independent-verifier/index.js` | Modify | Orquestar derivación autoritativa de metadatos de evidencia, integración con la matriz de roles y pase de `assessment/v2` a la proyección de Assurance Graph. |
| `scripts/lib/assurance-graph/projector.js` | Modify | Reconciliar estrictamente `openspec_input_digest` en `resolveCanonicalInputDigests()` con fallo `GRAPH_DIVERGENCE`, y emitir arista `satisfies` solo cuando `evidence_requirements_satisfied.length > 0`. |
| `scripts/lib/assurance-graph/index.js` | Modify | Implementar revalidación exhaustiva en `replayAssuranceGraph` para `evidence/v2`, `verification/v2` y `assessment/v2`. |
| `scripts/lib/independent-verifier/assessment.test.js` | Modify | Tests unitarios para `assessment/v2`, hash v2, rechazo de arrays vacíos y compatibilidad v1. |
| `scripts/lib/independent-verifier/index.test.js` | Modify | Tests de integración para frontera de confianza de evidencias, matriz de incompatibilidad de roles y secuencia cronológica de refactor. |
| `scripts/lib/assurance-graph/index.test.js` | Modify | Tests para validación de `openspec_input_digest` con `GRAPH_DIVERGENCE`, replay de evidencias/verificaciones/evaluaciones y proyección condicional de aristas `satisfies`. |
| `openspec/changes/k6b-evidence-binding-and-schema-stability-remediation/decisions/adr-001.md` | Create | Registro de decisión arquitectural para la publicación de `assessment/v2` y compatibilidad v1. |
| `openspec/changes/k6b-evidence-binding-and-schema-stability-remediation/decisions/adr-002.md` | Create | Registro de decisión arquitectural para el desacoplamiento de frontera de confianza en evidencias. |
| `openspec/changes/k6b-evidence-binding-and-schema-stability-remediation/decisions/adr-003.md` | Create | Registro de decisión arquitectural para validación de digest canónico, replay y matriz de roles. |

---

## Interfaces / Contracts

### 1. Raw Evidence & Execution Sequence Contract

```typescript
interface ExecutionSequence {
  run_id: string;
  ordinal: number;
  previous_evidence_id?: string;
}

interface RawEvidenceObservation {
  bytes?: Buffer | string;
  rawBytes?: Buffer | string;
  provenance: "runtime-observed" | "host-attested" | "tool-produced" | "model-reported" | "human-decision" | "external-unverified";
  origin: string;
  node_id: string;
  candidate_id?: string;
  digest?: string;
  execution_sequence?: ExecutionSequence;
}
```

### 2. Assessment V2 Kernel Contract (`assessment/v2.schema.json`)

```typescript
type AssessmentRole =
  | "red"
  | "green"
  | "characterization-before"
  | "characterization-after"
  | "negative"
  | "acceptance"
  | "integration"
  | "invariant"
  | "smoke"
  | "rollback"
  | "dry-run";

interface AssessmentV2 {
  schema_version: 2;
  kind: "assessment/v2";
  assessment_id: `sha256:${string}`;
  evidence_id: `sha256:${string}`;
  role: AssessmentRole;
  obligation_id: string;
  node_id: string;
  candidate_id: `sha256:${string}`;
  policy_snapshot_id: `sha256:${string}`;
  evidence_requirements_satisfied: [string, ...string[]]; // minItems: 1, uniqueItems: true
}
```

### 3. Matriz de Incompatibilidad de Roles

```javascript
const INCOMPATIBLE_ROLE_PAIRS = Object.freeze([
  ["red", "green"],
  ["characterization-before", "characterization-after"],
  ["negative", "acceptance"],
]);

function assertCompatibleRoleSharing(items) {
  const rolesByEvidenceId = new Map();
  for (const item of items || []) {
    const evidenceId = item?.evidence?.evidence_id;
    const role = item?.role;
    if (!evidenceId || !role) continue;
    const roles = rolesByEvidenceId.get(evidenceId) || new Set();
    roles.add(role);
    rolesByEvidenceId.set(evidenceId, roles);
  }

  for (const [evidenceId, roles] of rolesByEvidenceId.entries()) {
    for (const [roleA, roleB] of INCOMPATIBLE_ROLE_PAIRS) {
      if (roles.has(roleA) && roles.has(roleB)) {
        return {
          ok: false,
          reason_code: "STRATEGY_EVIDENCE_ALIAS",
          error: `evidence_id ${evidenceId} cannot satisfy incompatible roles ${roleA} and ${roleB}`,
        };
      }
    }
  }
  return { ok: true };
}
```

### 4. Canonical Input Digest Resolution Contract

```javascript
function resolveCanonicalInputDigests(input) {
  const provided = input.canonicalInputs || {};
  const graph = input.executionGraph || {};
  const contract = provided.contract || {};

  const contractDigest = provided.contract_digest || contract.contract_digest || graph.contract_digest || null;
  const policySnapshotId = provided.policy_snapshot_id || graph.policy_snapshot_id || null;
  const executionGraphDigest = provided.execution_graph_digest || graph.graph_id || null;

  const canonicalOpenspecDigest = sha256Fingerprint("openspec-input/v1", {
    contract_digest: contractDigest,
    source_snapshot_id: graph.source_snapshot_id || provided.sourceSnapshot?.source_snapshot_id || null,
  });

  if (provided.openspec_input_digest && provided.openspec_input_digest !== canonicalOpenspecDigest) {
    return { ok: false, reason_code: "GRAPH_DIVERGENCE", error: "provided openspec_input_digest contradicts canonical derivation" };
  }

  // Verificar contract_digest, policy_snapshot_id y execution_graph_digest contra el grafo
  if (provided.contract_digest && provided.contract_digest !== graph.contract_digest) {
    return { ok: false, reason_code: "GRAPH_DIVERGENCE", error: "canonical contract digest contradicts Execution Graph" };
  }
  if (provided.policy_snapshot_id && provided.policy_snapshot_id !== graph.policy_snapshot_id) {
    return { ok: false, reason_code: "GRAPH_DIVERGENCE", error: "canonical policy snapshot contradicts Execution Graph" };
  }
  if (provided.execution_graph_digest && provided.execution_graph_digest !== graph.graph_id) {
    return { ok: false, reason_code: "GRAPH_DIVERGENCE", error: "canonical execution graph digest contradicts Execution Graph" };
  }

  return {
    ok: true,
    canonical_inputs: {
      contract_digest: contractDigest,
      policy_snapshot_id: policySnapshotId,
      execution_graph_digest: executionGraphDigest,
      openspec_input_digest: canonicalOpenspecDigest,
    },
  };
}
```

### 5. Proyección Condicional de Aristas `satisfies`

```javascript
// En projectAssuranceGraph:
for (const assessment of assessments) {
  if (!assessment || !assessment.evidence_id || !assessment.obligation_id) continue;
  pushNode(nodes, assessment.evidence_id, "test-evidence");
  pushNode(nodes, assessment.obligation_id, "requirement");
  
  // Proyección condicional estricta: solo si evidence_requirements_satisfied tiene elementos
  const satisfied = assessment.evidence_requirements_satisfied;
  if (Array.isArray(satisfied) && satisfied.length > 0) {
    pushEdge(edges, assessment.evidence_id, "satisfies", assessment.obligation_id);
  }
}
```

---

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| **Unit (Schemas & Fixtures)** | `assessment/v2` schema validation, rechazo de arrays vacíos, rechazo de `verdict`, y validación retrocompatible de `assessment/v1`. | Ejecutar validaciones contra todas las fixtures en `schemas/kernel/assessment/fixtures/valid/` e `invalid/` usando `validateInstance`. |
| **Unit (Assessment Identity & Coverage)** | Generación canónica de `assessment_id` v2, ordenamiento determinista de tokens y verificación de subconjuntos de cobertura. | Tests en `assessment.test.js` y `obligation-coverage.test.js` cubriendo escenarios normales y mutaciones adversariales. |
| **Unit (Role Compatibility & Sequence)** | Matriz de incompatibilidad de roles (`red` ↔ `green`, `characterization-before` ↔ `characterization-after`, `negative` ↔ `acceptance`), compatibilidad no conflictiva (`integration` + `acceptance`), y precedencia cronológica en refactor y TDD. | Tests en `index.test.js` y `strategy-policy.js` con evidencias ordenadas y desordenadas. |
| **Unit (Canonical Resolution & Replay)** | Fallo de `resolveCanonicalInputDigests` con `GRAPH_DIVERGENCE` ante discordancias de `openspec_input_digest`, validación completa de `replayAssuranceGraph` sobre `evidence/v2`, `verification/v2` y `assessment/v2`. | Tests en `assurance-graph/index.test.js` manipulando campos individuales de cada artefacto persistido. |
| **Integration (End-to-End Candidate Verification)** | Ejecución completa de `verifyCandidate` para todas las estrategias (`feature`, `bug`, `refactor`, `migration`, `config-docs`), verificando emisión de evidencia, evaluación, veredicto, grafo de aseguramiento y manifiesto de equivalencia. | Suite de integración en `independent-verifier/index.test.js` y `assurance-graph/index.test.js`. |
| **Regression (Schema Freeze & Byte-Identical Invariance)** | Invarianza byte a byte de los esquemas `evidence/v2.schema.json`, `verification/v2.schema.json`, K1 schemas y pines de `K1_SCHEMA_BASELINE`. | Test de aserción criptográfica SHA-256 en la suite de esquemas del kernel. |

---

## Migration / Rollout

No se requiere migración destructiva de datos ni interrupción de servicio:
1. **Publicación Aditiva**: `schemas/kernel/assessment/v2.schema.json` se publica como una nueva versión del esquema, coexistiendo de forma retrocompatible con `assessment/v1.schema.json`.
2. **Adopción del Verifier**: El verificador independiente emite por defecto registros `assessment/v2`, pero `replayAssuranceGraph` y las herramientas del kernel pueden aceptar e interpretar artefactos `assessment/v1` legados si fuera requerido.
3. **Rollback**: En caso de reversión, se eliminan los esquemas v2 y se restablecen las funciones del arnés sin afectar los baselines de esquemas K1/K4/K6a congelados.

---

## Open Questions

None. Todos los requisitos y escenarios han sido formalmente especificados en el proposal y las especificaciones del cambio.
