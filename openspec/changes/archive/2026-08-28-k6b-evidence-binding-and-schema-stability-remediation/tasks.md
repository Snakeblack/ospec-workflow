# Tasks: K6b Evidence Binding and Schema Stability Remediation

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-kernel-contract-schemas-027: Valid assessment v2 fixture passes | MUST | `schemas/kernel/assessment/v2.schema.json`, `schemas/kernel/assessment/fixtures/valid/v2-complete.json` | covered-by-design | Publicación canónica de `assessment/v2` con `minItems: 1` |
| REQ-kernel-contract-schemas-027: Cross-family substitution and verdict fail closed | MUST | `schemas/kernel/assessment/v2.schema.json`, `fixtures/invalid/v2-with-verdict.json` | covered-by-design | Enforzar `additionalProperties: false` y prohibición de `verdict` |
| REQ-kernel-contract-schemas-027: Four-role assessments remain distinct under the schema | MUST | `schemas/kernel/assessment/v2.schema.json`, `fixtures/valid/v2-four-roles.json` | covered-by-design | Distinción determinista de tuplas `(evidence_id, role, obligation_id)` |
| REQ-kernel-contract-schemas-027: Assessment v2 fixture with missing or empty evidence_requirements_satisfied fails closed | MUST | `schemas/kernel/assessment/v2.schema.json`, `fixtures/invalid/v2-empty-coverage.json`, `fixtures/invalid/v2-missing-coverage.json` | covered-by-design | `minItems: 1` y propiedad requerida obligatoria |
| REQ-kernel-contract-schemas-027: Evidence v2, verification v2, and K1 v1 pins remain frozen | MUST | `scripts/lib/k6b-schema-fixtures.test.js`, `scripts/lib/lifecycle-kernel/k1-compat.js` | covered-by-design | Verificación de hashes SHA-256 inmutables |
| REQ-kernel-contract-schemas-027: Assessment v1 backward compatibility is preserved | MUST | `schemas/kernel/assessment/v1.schema.json`, `schemas/kernel/assessment/fixtures/` | covered-by-design | Restaurar contrato v2.51.0 intacto |
| REQ-kernel-contract-schemas-027: Manifest and contract-claims register assessment v2 | MUST | `schemas/kernel/manifest.json`, `schemas/kernel/contract-claims.json` | covered-by-design | Registro de familias `assessment-v2` y `assessment` v1 |
| REQ-independent-verification-003: Runtime-observed evidence satisfies a test obligation | MUST | `scripts/lib/independent-verifier/collector-provenance.js`, `evidence.js` | covered-by-design | Verificación de procedencia confiable |
| REQ-independent-verification-003: Model-reported tests-passed is insufficient | MUST | `scripts/lib/independent-verifier/collector-provenance.js`, `evidence.js` | covered-by-design | Falla fail-closed ante worker narrative |
| REQ-independent-verification-003: Stale, foreign, or fabricated evidence is rejected | MUST | `scripts/lib/independent-verifier/evidence.js`, `index.js` | covered-by-design | Validación de hash de bytes y `candidate_id` |
| REQ-independent-verification-003: Payload-claimed strong provenance without trusted collector fails closed | MUST | `scripts/lib/independent-verifier/collector-provenance.js` | covered-by-design | Rechazo de claims de procedencia no respaldados por colector |
| REQ-independent-verification-003: Verifier derives trusted evidence metadata from Execution Graph and receipts | MUST | `scripts/lib/independent-verifier/evidence.js`, `assessment.js`, `index.js` | covered-by-design | Desacoplamiento de `rawEvidence` y derivación autoritativa |
| REQ-independent-verification-003: Untrusted caller metadata overrides are rejected | MUST | `scripts/lib/independent-verifier/evidence.js`, `assessment.js` | covered-by-design | Ignorar y rechazar sobreescrituras semánticas del llamador |
| REQ-independent-verification-005: MUST without admissible evidence fails closed | MUST | `scripts/lib/independent-verifier/obligation-coverage.js` | covered-by-design | Validación de cobertura de tokens de `required_evidence` |
| REQ-independent-verification-005: Nonexistent obligation_id fails closed | MUST | `scripts/lib/independent-verifier/obligation-coverage.js` | covered-by-design | Validación contra el Obligation Manifest |
| REQ-independent-verification-005: Evidence bound to the wrong implementing node fails closed | MUST | `scripts/lib/independent-verifier/obligation-coverage.js` | covered-by-design | Chequeo de pertenencia en `implemented_by` |
| REQ-independent-verification-005: Partial required_evidence coverage fails closed | MUST | `scripts/lib/independent-verifier/obligation-coverage.js` | covered-by-design | `required_evidence` ⊆ `evidence_requirements_satisfied` |
| REQ-independent-verification-005: Empty evidence_requirements_satisfied cannot claim satisfaction | MUST | `scripts/lib/independent-verifier/obligation-coverage.js`, `assessment.js` | covered-by-design | `minItems: 1` requerido para satisfacer obligaciones |
| REQ-independent-verification-006: Same EvidenceId as RED and GREEN fails closed | MUST | `scripts/lib/independent-verifier/strategy-policy.js` | covered-by-design | Matriz de incompatibilidad de roles (`red` ↔ `green`) |
| REQ-independent-verification-006: GREEN before RED fails closed | MUST | `scripts/lib/independent-verifier/strategy-policy.js` | covered-by-design | Validación de precedencia cronológica TDD |
| REQ-independent-verification-006: RED after PATCH fails closed | MUST | `scripts/lib/independent-verifier/strategy-policy.js` | covered-by-design | Validación de secuencia temporal TDD |
| REQ-independent-verification-006: Distinct tuples yield distinct assessment identities | MUST | `scripts/lib/independent-verifier/assessment.js` | covered-by-design | `assessment_id` único por `(evidence_id, role, obligation_id)` |
| REQ-independent-verification-006: Characterization-after before characterization-before fails closed | MUST | `scripts/lib/independent-verifier/strategy-policy.js` | covered-by-design | Validación cronológica vía `execution_sequence` en refactor |
| REQ-independent-verification-006: Negative and acceptance sharing same EvidenceId fails closed | MUST | `scripts/lib/independent-verifier/strategy-policy.js` | covered-by-design | Matriz de incompatibilidad (`negative` ↔ `acceptance`) |
| REQ-independent-verification-006: Non-conflicting shared evidence passes validation | MUST | `scripts/lib/independent-verifier/strategy-policy.js` | covered-by-design | Permitir reuso no conflictivo (`integration` + `acceptance`) |
| REQ-assurance-graph-002: Same inputs yield the same digest and edges | MUST | `scripts/lib/assurance-graph/projector.js` | covered-by-design | Proyección y hashing canónico determinista |
| REQ-assurance-graph-002: Forbidden later-slice relations are rejected | MUST | `schemas/kernel/assurance-graph/v1.schema.json`, `projector.js` | covered-by-design | Validación estricta de relaciones de aristas K6b |
| REQ-assurance-graph-002: Canonical input change yields a distinct graph_id | MUST | `scripts/lib/assurance-graph/projector.js` | covered-by-design | Inclusión de todos los canonical inputs en preimage |
| REQ-assurance-graph-002: Conditional projection of satisfies edge requires non-empty satisfaction | MUST | `scripts/lib/assurance-graph/projector.js` | covered-by-design | Emisión de arista `satisfies` solo con `length > 0` |
| REQ-assurance-graph-002: Empty or missing evidence_requirements_satisfied omits satisfies edge | MUST | `scripts/lib/assurance-graph/projector.js` | covered-by-design | Omitir arista `satisfies` si array está vacío o ausente |
| REQ-assurance-graph-006: Replay from persisted outputs yields the same graph | MUST | `scripts/lib/assurance-graph/index.js` | covered-by-design | Reconstrucción idéntica de `graph_id` y aristas |
| REQ-assurance-graph-006: Tampered assessment_id fails replay | MUST | `scripts/lib/assurance-graph/index.js` | covered-by-design | Revalidación de `assessment_id` recomputado |
| REQ-assurance-graph-006: Assessment fails schema, candidate, or policy revalidation | MUST | `scripts/lib/assurance-graph/index.js` | covered-by-design | Revalidación integral de esquema y bindings en replay |
| REQ-assurance-graph-006: Assessment bound to missing evidence or non-implementing node fails replay | MUST | `scripts/lib/assurance-graph/index.js` | covered-by-design | Chequeo de existencia de `evidence_id` y `node_id` |
| REQ-assurance-graph-006: Evidence v2 digest mismatch or invalid candidate binding fails replay | MUST | `scripts/lib/assurance-graph/index.js` | covered-by-design | Revalidación de `evidence/v2` (digest y `candidate_id`) |
| REQ-assurance-graph-006: Verification v2 referencing non-existent evidence_id fails replay | MUST | `scripts/lib/assurance-graph/index.js` | covered-by-design | Chequeo de subconjunto de `evidence_ids` en `verification/v2` |
| REQ-assurance-graph-007: Graph contract contradicts canonicalInputs | MUST | `scripts/lib/assurance-graph/projector.js` | covered-by-design | Chequeo fail-closed con `GRAPH_DIVERGENCE` |
| REQ-assurance-graph-007: Null required canonical digest is not fingerprinted | MUST | `scripts/lib/assurance-graph/projector.js` | covered-by-design | Prohibición de digests nulos en preimage |
| REQ-assurance-graph-007: OpenSpec input digest mismatch in resolveCanonicalInputDigests fails closed | MUST | `scripts/lib/assurance-graph/projector.js` | covered-by-design | Recomputación autoritativa de `openspec_input_digest` |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 280-350 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Remediación integral de enlace de evidencia, estabilidad de esquemas assessment v2/v1, validación de digest canónico, matriz de roles y replay | Single PR | Entrega autónoma con schemas, lib runtime, suite de tests y compatibilidad histórica |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Schemas and Contract Foundation

- [x] 1.1 Publicar `schemas/kernel/assessment/v2.schema.json` (`$id: "ospec://schemas/kernel/assessment/v2"`, `schema_version: 2`) requiriendo `evidence_requirements_satisfied` con `minItems: 1`, catálogo de roles canónicos y prohibiendo `verdict` [REQ-kernel-contract-schemas-027]
- [x] 1.2 Restaurar `schemas/kernel/assessment/v1.schema.json` al contrato retrocompatible v2.51.0 y verificar inmutabilidad de esquemas y pines de `evidence/v2`, `verification/v2` y K1 [REQ-kernel-contract-schemas-027]
- [x] 1.3 Crear fixtures válidas e inválidas para `assessment/v2` en `schemas/kernel/assessment/fixtures/` (`v2-complete.json`, `v2-four-roles.json`, `v2-empty-coverage.json`, `v2-with-verdict.json`, `v2-missing-coverage.json`) y ajustar fixtures v1 [REQ-kernel-contract-schemas-027]
- [x] 1.4 Registrar la familia `assessment-v2` y preservar `assessment` v1 en `schemas/kernel/manifest.json` y `schemas/kernel/contract-claims.json` [REQ-kernel-contract-schemas-027]

## Phase 2: Independent Verification & Evidence Binding

- [x] 2.1 Refactorizar `scripts/lib/independent-verifier/evidence.js` para desacoplar `rawEvidence` (`bytes`, `provenance`, `origin`, `node_id`, `execution_sequence`) de los metadatos de confianza, rechazando sobreescrituras semánticas del invocador [REQ-independent-verification-003]
- [x] 2.2 Implementar en `scripts/lib/independent-verifier/strategy-policy.js` la matriz formal de incompatibilidad de roles (`red` ↔ `green`, `characterization-before` ↔ `characterization-after`, `negative` ↔ `acceptance`) y permitir combinaciones no conflictivas [REQ-independent-verification-006]
- [x] 2.3 Implementar en `scripts/lib/independent-verifier/strategy-policy.js` la validación cronológica de refactor (`characterization-before` precede a `characterization-after` vía `execution_sequence`) y validaciones TDD [REQ-independent-verification-006]
- [x] 2.4 Actualizar `scripts/lib/independent-verifier/obligation-coverage.js` para requerir que cada token de `required_evidence` esté cubierto por `evidence_requirements_satisfied` no vacío (`minItems: 1`) bound al `node_id` [REQ-independent-verification-005]
- [x] 2.5 Adaptar `scripts/lib/independent-verifier/assessment.js` y `scripts/lib/independent-verifier/index.js` para emitir registros `assessment/v2` por defecto derivando autoritativamente roles y obligaciones, preservando compatibilidad v1 [REQ-independent-verification-003, REQ-independent-verification-005, REQ-independent-verification-006]

## Phase 3: Assurance Graph Projection & Replay

- [x] 3.1 Actualizar `resolveCanonicalInputDigests()` en `scripts/lib/assurance-graph/projector.js` para recomputar y validar autoritativamente `openspec_input_digest`, fallando con `GRAPH_DIVERGENCE` ante cualquier discordancia [REQ-assurance-graph-002, REQ-assurance-graph-007]
- [x] 3.2 Modificar la proyección de aristas en `scripts/lib/assurance-graph/projector.js` para emitir la relación `satisfies` única y condicionalmente cuando `evidence_requirements_satisfied.length > 0` [REQ-assurance-graph-002]
- [x] 3.3 Implementar en `scripts/lib/assurance-graph/index.js` la revalidación integral en `replayAssuranceGraph` para `evidence/v2` (digest, candidato, procedencia), `verification/v2` (id, candidato, subset) y `assessment/v2` (id, candidato, política, nodo, cobertura > 0) [REQ-assurance-graph-006]

## Phase 4: Test Suite & Verification

- [x] 4.1 Actualizar `scripts/lib/k6b-schema-fixtures.test.js` para validar `assessment/v2`, fixtures v2/v1, registros en manifest/claims y congelamiento de esquemas K1/v2 [REQ-kernel-contract-schemas-027]
- [x] 4.2 Expandir `scripts/lib/independent-verifier/assessment.test.js` y `obligation-coverage.test.js` con tests unitarios y de mutación para `assessment/v2`, arrays vacíos y cobertura MUST [REQ-kernel-contract-schemas-027, REQ-independent-verification-005]
- [x] 4.3 Expandir `scripts/lib/independent-verifier/index.test.js` con pruebas de desacoplamiento de `rawEvidence`, matriz de incompatibilidad de roles y precedencia cronológica de refactor/TDD [REQ-independent-verification-003, REQ-independent-verification-006]
- [x] 4.4 Expandir `scripts/lib/assurance-graph/index.test.js` con casos para fallo `GRAPH_DIVERGENCE` en `openspec_input_digest`, proyección condicional de `satisfies` y replay exhaustivo de `evidence/v2`, `verification/v2` y `assessment/v2` [REQ-assurance-graph-002, REQ-assurance-graph-006, REQ-assurance-graph-007]

## Phase 5: Cleanup & Metadata Normalization

- [x] 5.1 Limpiar comentarios obsoletos y referencias legacy en `scripts/lib/independent-verifier/` y `scripts/lib/assurance-graph/`
- [x] 5.2 Verificar consistencia de metadatos en esquemas, manifiestos y documentación técnica del cambio
