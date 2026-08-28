# Design: K6b Trusted Evidence and Replay Closure

## Technical Approach

Este diseño técnico implementa el cierre definitivo de las brechas de seguridad e integridad en K6b (Blockers B1, B2, B3 y Hallazgo H1), alineado estrictamente con las especificaciones de `independent-verification` y `assurance-graph`.

El enfoque técnico se compone de cuatro pilares arquitectónicos:
1. **Segregación física estricta de `rawEvidence`**: `normalizeEvidence` en `scripts/lib/independent-verifier/evidence.js` valida que el objeto de entrada `raw` no contenga aserciones semánticas (`role`, `obligation_ids`, `obligation_id` o `evidence_requirements_satisfied`). Si detecta alguna de estas propiedades, falla de inmediato fail-closed con `UNTRUSTED_CALLER_METADATA`. La carga física se restringe a `bytes`/`rawBytes`, `provenance`, `origin`, `node_id` y `execution_sequence`.
2. **Derivación autoritativa de satisfacción y rol**: En `verifyCandidate` (`scripts/lib/independent-verifier/index.js`), el verificador infiere `role` y enlaces a `obligation_ids` consultando el Execution Graph (`node.role`, `obligation.implemented_by`), y determina `evidence_requirements_satisfied` exclusivamente contrastando runner receipts (`receipts` / `runner_receipts`) emitidos por el harness de ejecución. Se erradica completamente el fallback de copia ciega de `node.required_evidence`.
3. **Cronología causal obligatoria**: En `scripts/lib/independent-verifier/strategy-policy.js`, `assertRoleOrder` exige de forma mandatoria la presencia de `execution_sequence` (`run_id`, `ordinal` monotónico creciente y encadenamiento `previous_evidence_id`) para estrategias temporales (`strict-tdd`, `bug`, `refactor`). Se prohíbe el fallback al orden de índices del array JSON; cualquier discrepancia o ausencia de secuencia causal falla con `STRATEGY_SEQUENCE_VIOLATION`.
4. **Replay criptográficamente íntegro**: En `scripts/lib/assurance-graph/index.js`, `validateReplayRecords` / `replayAssuranceGraph` recomputa el digest con `digestRawBytes`, recomputa el identificador con `computeEvidenceId(record, bytes)`, verifica coincidencia exacta con `record.evidence_id` y `record.digest`, y evalúa `evaluateProvenanceSufficiency` contra la procedencia del registro. Cualquier manipulación o insuficiencia falla con `GRAPH_DIVERGENCE`.

## Architecture Decisions

| Opción | Tradeoff | Decisión |
|---|---|---|
| **Segregación de rawEvidence**: Rechazo fail-closed `UNTRUSTED_CALLER_METADATA` vs. ignorar silenciosamente propiedades semánticas. | Ignorar campos permite payloads tolerantes pero oculta fallos de seguridad o intentos de inyección. | **Rechazo estricto con `UNTRUSTED_CALLER_METADATA`**: Los llamadores no confiables nunca deben inyectar metadatos semánticos en observaciones físicas. |
| **Derivación de cobertura**: Inferencia autoritativa desde `runner_receipts` vs. copia por defecto de `node.required_evidence`. | Copiar `node.required_evidence` simplifica fixtures pero genera falsos positivos donde la mera existencia de un archivo da por probada una obligación. | **Derivación exclusiva desde runner receipts**: Se exige prueba de ejecución efectiva emitida por el harness; sin recibo que atestigüe satisfacción, `evidence_requirements_satisfied` es `[]`. |
| **Cronología de ejecución**: Validación causal estricta por `execution_sequence` vs. fallback a índices de array JSON. | Usar índices de array oculta desorden temporal y asume orden de serialización arbitrario. | **Causalidad obligatoria por `execution_sequence`**: Exigir `run_id`, `ordinal` y `previous_evidence_id`; fallo `STRATEGY_SEQUENCE_VIOLATION` sin fallback a array. |
| **Integridad en Replay**: Recomputación de `computeEvidenceId` y `evaluateProvenanceSufficiency` vs. validación sintáctica de schema. | Solo validar JSON schema y candidate_id deja abierta la sustitución de `evidence_id` o degradación de procedencia. | **Recomputación criptográfica y sufficiency**: `validateReplayRecords` recomputa ID y digest de bytes y revalida procedencia, fallando con `GRAPH_DIVERGENCE`. |

### Decision: Segregación física estricta de rawEvidence (UNTRUSTED_CALLER_METADATA)

**Choice**: Rechazar inmediatamente en `normalizeEvidence` cualquier payload `raw` que contenga `role`, `obligation_ids`, `obligation_id` o `evidence_requirements_satisfied` con `reason_code: "UNTRUSTED_CALLER_METADATA"`.
**Alternatives considered**: Filtrar silenciosamente las propiedades semánticas o aceptarlas como sugerencias no vinculantes.
**Rationale**: Una observación física de prueba (`rawEvidence`) proviene de un canal de recolección de ejecución y solo debe contener datos de bytes, procedencia de canal, origen físico, ID de nodo de grafo y secuencia de ejecución. Si un worker o llamador inyecta aserciones semánticas, constituye un intento de evadir la verificación independiente.

### Decision: Derivación autoritativa de satisfacción desde Runner Receipts

**Choice**: `verifyCandidate` deriva `evidence_requirements_satisfied` contrastando los receipts de runner (`receipts` / `runner_receipts`) emitidos por el harness de ejecución. Se prohíbe copiar ciegamente `node.required_evidence`.
**Alternatives considered**: Mantener fallback que copia automáticamente `node.required_evidence` si no se proporcionan tokens en el payload.
**Rationale**: La copia ciega crea falsos positivos en el grafo de aseguramiento. La satisfacción de una obligación crítica (`criticality: "must"`) solo es válida si un runner receipt autoritativo atestigua el resultado exitoso de la ejecución.

### Decision: Cronología causal estricta mediante execution_sequence

**Choice**: Exigir `execution_sequence` (`run_id`, `ordinal` monotónico creciente y `previous_evidence_id`) en `assertRoleOrder` para `strict-tdd`, `bug` y `refactor`. Fallar con `STRATEGY_SEQUENCE_VIOLATION` si falta `execution_sequence` o si el orden causal es inválido (ej. GREEN con ordinal menor a RED).
**Alternatives considered**: Mantener el orden del array JSON de `rawEvidence` como fallback cronológico.
**Rationale**: El orden en un array JSON no provee atestación causal. Un payload puede colocar elementos en orden arbitrario en el array mientras que su ejecución real ocurrió en orden inverso o concurrente. La secuencia de ejecución es la única fuente de verdad temporal.

### Decision: Replay criptográficamente íntegro en Assurance Graph

**Choice**: En `validateReplayRecords`, recomputar `digestRawBytes(bytes)`, recomputar `computeEvidenceId(record, bytes)`, comparar contra `record.evidence_id` y `record.digest`, y evaluar `evaluateProvenanceSufficiency(record)`. Cualquier fallo detona `GRAPH_DIVERGENCE`.
**Alternatives considered**: Confiar en el `record.evidence_id` almacenado siempre que el schema JSON pase.
**Rationale**: La persistencia y el replay deben garantizar que ni los bytes, ni los identificadores canónicos, ni la clase de procedencia hayan sido alterados o degradados con posterioridad.

## Data Flow

```
[Harness / Test Runner]
       │
       ├─► rawEvidence (bytes, origin, node_id, execution_sequence)
       ├─► runner_receipts (node_id, evidence_requirements_satisfied, outcome)
       └─► collector (id, transport)
       │
       ▼
[normalizeEvidence] ──► ¿Contiene role / obligation_ids / satisfied? ──► [FAIL: UNTRUSTED_CALLER_METADATA]
       │ (Válido: extrae solo bytes, digest, node_id, execution_sequence)
       ▼
[verifyCandidate]
       │
       ├─► Resuelve 'role' e 'obligation_ids' desde ExecutionGraph (node.role, obligation.implemented_by)
       ├─► Deriva 'evidence_requirements_satisfied' desde runner_receipts (NUNCA copia node.required_evidence)
       │
       ▼
[evaluateStrategy / assertRoleOrder]
       │
       ├─► ¿Estrategia temporal (strict-tdd, bug, refactor)?
       │      ├─► ¿Falta execution_sequence o viola ordinales/chaining? ──► [FAIL: STRATEGY_SEQUENCE_VIOLATION]
       │      └─► Orden causal validado (RED < GREEN, before < after)
       │
       ▼
[walkMustObligations]
       │
       ├─► ¿required_evidence ⊆ evidence_requirements_satisfied derivados?
       │      └─► No ──► [FAIL: UNFULFILLED_MUST]
       │
       ▼
[emitVerification & projectAssuranceGraph]
       │
       └─► Persistable Records: evidence/v2, assessment/v2, verification/v2, assurance_graph
       │
       ▼
[replayAssuranceGraph / validateReplayRecords]
       │
       ├─► Recomputa digestRawBytes(bytes) === record.digest
       ├─► Recomputa computeEvidenceId(record, bytes) === record.evidence_id
       ├─► Evalúa evaluateProvenanceSufficiency(record)
       └─► Discrepancia o manipulación ──► [FAIL: GRAPH_DIVERGENCE]
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/independent-verifier/evidence.js` | Modify | Validar y rechazar en `normalizeEvidence` cualquier campo semántico del caller con `UNTRUSTED_CALLER_METADATA`. Retornar objeto normalizado libre de metadatos de caller. |
| `scripts/lib/independent-verifier/index.js` | Modify | En `verifyCandidate`, derivar `role` y `obligation_ids` desde el Execution Graph, y derivar `evidence_requirements_satisfied` exclusivamente desde `input.receipts` / `input.runner_receipts`, eliminando la copia ciega de `node.required_evidence`. |
| `scripts/lib/independent-verifier/strategy-policy.js` | Modify | Actualizar `assertRoleOrder` para exigir `execution_sequence` en estrategias temporales (`strict-tdd`, `bug`, `refactor`), eliminando el fallback a índices de array y fallando con `STRATEGY_SEQUENCE_VIOLATION`. |
| `scripts/lib/assurance-graph/index.js` | Modify | Extender `validateReplayRecords` para recomputar `digestRawBytes`, `computeEvidenceId` y evaluar `evaluateProvenanceSufficiency` sobre cada registro de evidencia, fallando con `GRAPH_DIVERGENCE`. |
| `scripts/lib/independent-verifier/index.test.js` | Modify | Actualizar fixtures de test para segregar `rawEvidence` y proveer `runner_receipts` y `execution_sequence`. Agregar suites de prueba para rechazo de caller metadata, ausencia de blind copy y violaciones causales. |
| `scripts/lib/independent-verifier/evidence.test.js` | Modify / Create | Tests unitarios para `normalizeEvidence` validando el rechazo `UNTRUSTED_CALLER_METADATA` ante `role`, `obligation_ids`, `obligation_id` y `evidence_requirements_satisfied`. |
| `scripts/lib/assurance-graph/index.test.js` | Modify | Tests para `validateReplayRecords` y `replayAssuranceGraph` verificando detección de tampering en `evidence_id`, mismatch de bytes y procedencia insuficiente. |

## Interfaces / Contracts

### 1. `rawEvidence` Input Payload Segregation

```javascript
/**
 * Observation Payload (physical properties only).
 * Untrusted caller metadata fields are STRICTLY FORBIDDEN.
 */
// @typedef {Object} RawEvidenceObservation
// @property {string|Buffer} [bytes] - Raw observation bytes
// @property {string|Buffer} [rawBytes] - Alias for raw observation bytes
// @property {string} [provenance] - Claimed provenance (must match collector channel)
// @property {string} origin - Origin identification (e.g. role:acceptance, test-runner)
// @property {string} node_id - Graph node ID
// @property {ExecutionSequence} [execution_sequence] - Causal execution metadata
// @property {string} [candidate_id] - Optional verification subject binding
// @property {string} [digest] - Optional declared digest
// @property {string} [evidence_id] - Optional declared evidence ID
//
// FORBIDDEN PROPERTIES (Throws UNTRUSTED_CALLER_METADATA):
// - role
// - obligation_ids
// - obligation_id
// - evidence_requirements_satisfied
```

### 2. Execution Sequence Interface

```javascript
/**
 * Causal execution sequence tracking.
 * @typedef {Object} ExecutionSequence
 * @property {string} run_id - Unique execution run identifier
 * @property {number} ordinal - Monotonically increasing execution sequence integer (0, 1, 2...)
 * @property {string} [previous_evidence_id] - Explicit cryptographic chaining link to predecessor evidence
 */
```

### 3. Runner Receipt Interface

```javascript
/**
 * Trusted execution receipt from runner/harness.
 * @typedef {Object} RunnerReceipt
 * @property {string} [node_id] - Target graph node ID
 * @property {string} [evidence_id] - Associated evidence ID
 * @property {string} [receipt_id] - Receipt identifier
 * @property {string} [outcome] - Execution outcome ("success", "passed", etc.)
 * @property {string[]} [evidence_requirements_satisfied] - Requirements attested as satisfied
 * @property {string[]} [satisfied_tokens] - Alias for satisfied requirements
 * @property {string} [role] - Attested role (optional)
 */
```

### 4. Normalized Evidence Output

```javascript
/**
 * Return type of normalizeEvidence.
 * @returns {{ ok: true, evidence: EvidenceV2Record, execution_sequence: ExecutionSequence|null, raw: Object } | { ok: false, reason_code: string, error?: string }}
 */
```

### 5. `validateReplayRecords` Evidence Verification Contract

```javascript
// Replay validation step for each evidence item:
// 1. Schema check against evidence/v2.schema.json
// 2. candidate_id match against graph.candidate_id
// 3. Recomputed digest: digestRawBytes(bytes) === record.digest
// 4. Recomputed ID: computeEvidenceId(record, bytes) === record.evidence_id
// 5. Provenance sufficiency: evaluateProvenanceSufficiency(record).ok === true
// 6. Verdict property absence: !record.verdict
// Any failure => fail closed with reason_code: "GRAPH_DIVERGENCE"
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (`evidence.test.js`) | Rechazo inmediato de `role`, `obligation_ids`, `obligation_id` y `evidence_requirements_satisfied` con `UNTRUSTED_CALLER_METADATA`. | Pasar payloads con cada campo prohibido de forma individual y combinada; verificar `reason_code === "UNTRUSTED_CALLER_METADATA"`. |
| Unit (`strategy-policy.js`) | Cronología causal en `assertRoleOrder` para `strict-tdd`, `bug` y `refactor`. | Probar arrays con elementos en orden sintáctico pero sin `execution_sequence` (debe fallar `STRATEGY_SEQUENCE_VIOLATION`); probar ordinals contradictorios (GREEN < RED); probar ordinales válidos con enlace `previous_evidence_id`. |
| Unit / Integration (`obligation-coverage.js` + `index.js`) | Erradicación de blind copying y derivación desde runner receipts. | Probar nodo con `required_evidence: ["ev:test-pass"]` y raw observation sin receipt (falla `UNFULFILLED_MUST`). Probar con `runner_receipts` conteniendo `evidence_requirements_satisfied: ["ev:test-pass"]` (pasa `PASS`). |
| Integration (`index.test.js`) | Verificación completa de `verifyCandidate` con segregación de rawEvidence y runner receipts. | Adaptar suite completa de `independent-verifier/index.test.js` asegurando compatibilidad con todas las estrategias y gates. |
| Integration (`assurance-graph/index.test.js`) | Replay exhaustivo con recomputación de `computeEvidenceId` y `evaluateProvenanceSufficiency`. | Probar replay con registro con `evidence_id` modificado, bytes discrepantes o procedencia débil (`model-reported`) contra un grafo que requiere runtime; verificar fallo con `GRAPH_DIVERGENCE`. |

## Migration / Rollout

- **No schema migration required**: Los esquemas kernel `evidence/v2`, `assessment/v2`, `verification/v2` y `assurance-graph/v1` se preservan íntegros.
- **Actualización de Harness y Fixtures de Test**:
  - Los generadores de fixtures en tests unitarios e integraciones (`index.test.js`) que construían `rawEvidence` con campos semánticos inyectados (`role`, `obligation_ids`, `evidence_requirements_satisfied`) se refactorizan para generar observaciones físicas puras y proporcionar `runner_receipts` explícitos en las llamadas a `verifyCandidate`.
  - Las fixtures de estrategias temporales se dotan de `execution_sequence` canónicos (`run_id`, `ordinal: 1`, `ordinal: 2`, etc.).

## Open Questions

- None (todas las decisiones y requisitos técnicos están resueltos y alineados con las especificaciones).
