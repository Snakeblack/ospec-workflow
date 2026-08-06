# Tasks: K3 — Execution Identities, Candidate Freeze, and Initial Candidate Relations

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-execution-identities-001 (Distinct digests & 1-byte mutation) | MUST | `scripts/lib/execution-identities/index.js` (`sha256Fingerprint` domain prefix), `index.test.js` | covered-by-design | Prefijos de dominio `source-snapshot/v1`, `work-order/v1`, `work-result/v1`, `candidate/v1` previenen aliasaciones |
| REQ-execution-identities-002 (SourceSnapshot structure & non-authorization) | MUST | `schemas/kernel/source-snapshot/v1.schema.json`, `scripts/lib/execution-identities/index.js` (`computeSourceSnapshotId`) | covered-by-design | Estructura con `repositoryId`, `baseTreeDigest`, `projection`, `dependencyDigests` |
| REQ-execution-identities-003 (WorkOrder & WorkResult binding, freeze requirement) | MUST | `schemas/kernel/work-order/v1.schema.json`, `schemas/kernel/work-result/v1.schema.json`, `scripts/lib/execution-identities/index.js` | covered-by-design | `WorkOrder` vinculado a snapshot; `WorkResult` vinculado a order+snapshot y requiere freeze antes de verify |
| REQ-execution-identities-004 (Candidate Freeze, projections, modes & untracked digests) | MUST | `schemas/kernel/candidate/v1.schema.json`, `scripts/lib/execution-identities/index.js` (`freezeCandidate`, `computeCandidateId`) | covered-by-design | Proyecciones restringidas estrictamente a `workspace` \| `staged`; bits de modo y archivos untracked alteran CandidateId |
| REQ-execution-identities-005 (Fail-closed candidate initial relation evaluation) | MUST | `scripts/lib/execution-identities/index.js` (`evaluateCandidateRelation`), `index.test.js` | covered-by-design | Evalúa `exact`, `changed`, `ambiguous`, `unknown`; la ambigüedad activa `stop`/`decide` |
| REQ-execution-identities-006 (Prohibition of attestations on mutable trees) | MUST | `scripts/lib/execution-identities/index.js` (`validateIdentityKind`), `index.test.js` | covered-by-design | Rechaza referencias a ramas mutables de Git y rutas de working tree sin congelar |
| REQ-kernel-contract-schemas-012 (Execution Identity Schemas & Fixtures) | MUST | `schemas/kernel/{source-snapshot,work-result,candidate,work-order}/`, `manifest.json`, `k3-schema-fixtures.test.js` | covered-by-design | Incluye schemas versionados v1 y fixtures negativos de no-aliasación |
| REQ-kernel-contract-schemas-001 (Versioned Schema Families With Id And Version) | MUST | `schemas/kernel/manifest.json`, `schemas/kernel/*/v1.schema.json` | covered-by-design | Expone `$id` y versión explícita en todas las familias de identidad K3 |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 500-650 lines |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Unit 1 (Schemas & Fixtures) → Unit 2 (Digests, Freeze & Relations) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Schemas & Contract Fixtures | PR 1 | Base `main`; incluye schemas de las 4 identidades, actualización de manifest, fixtures válidos/negativos y `k3-schema-fixtures.test.js`. |
| 2 | Execution Identity Digests, Freeze & Relations | PR 2 | Base `PR 1` (o `main`); incluye `scripts/lib/execution-identities/index.js` y `index.test.js`. |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified

## Phase 1: Schemas and Contract Standardization

- [x] 1.1 Crear JSON Schema para `SourceSnapshot` (`schemas/kernel/source-snapshot/v1.schema.json`) y sus fixtures válidos e inválidos (`schemas/kernel/source-snapshot/fixtures/valid/minimal.json`, `invalid/minimal.json`) [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-012]
- [x] 1.2 Crear JSON Schema para `WorkResult` (`schemas/kernel/work-result/v1.schema.json`) y sus fixtures válidos e inválidos (`schemas/kernel/work-result/fixtures/valid/minimal.json`, `invalid/minimal.json`) [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-012]
- [x] 1.3 Extender el schema `Candidate` (`schemas/kernel/candidate/v1.schema.json`) con campos K3 freeze (`changed_paths_modes_digest`, `intended_untracked_digest`, `repository_id`) y añadir fixtures (`valid/k3-frozen.json`, `invalid/commit-projection.json`, `invalid/work-result-alias.json`) [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-012]
- [x] 1.4 Actualizar el schema `WorkOrder` (`schemas/kernel/work-order/v1.schema.json`) para requerir `source_snapshot_id` y registrar las nuevas familias de identidades en `schemas/kernel/manifest.json` [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-012]

## Phase 2: Execution Identities Digests and Candidate Freeze

- [x] 2.1 Crear `scripts/lib/execution-identities/index.js` implementando digests SHA-256 con prefijo de dominio para `SourceSnapshotId`, `WorkOrderId`, `WorkResultId` y `CandidateId` [REQ-execution-identities-001, REQ-execution-identities-002, REQ-execution-identities-003]
- [x] 2.2 Implementar `freezeCandidate` en `scripts/lib/execution-identities/index.js` restringiendo proyecciones a `workspace` | `staged`, aplicando canonicalización POSIX, `changed_paths_modes_digest` y `intended_untracked_digest` [REQ-execution-identities-004]

## Phase 3: Candidate Relations and Non-Aliasing Type Guards

- [x] 3.1 Implementar `evaluateCandidateRelation` en `scripts/lib/execution-identities/index.js` generando salidas deterministas de 4 valores (`exact`, `changed`, `ambiguous`, `unknown`) con acciones fail-closed `stop`/`decide` [REQ-execution-identities-005]
- [x] 3.2 Implementar `validateIdentityKind` en `scripts/lib/execution-identities/index.js` garantizando la separación estricta de identidades y rechazando referencias a ramas mutables o working trees para atestaciones y autorizaciones [REQ-execution-identities-001, REQ-execution-identities-003, REQ-execution-identities-006]

## Phase 4: Testing and Verification

- [x] 4.1 Crear `scripts/lib/execution-identities/index.test.js` probando estabilidad de digests, sensibilidad a mutaciones de 1 byte, restricción de proyecciones, cambios de modo de archivo, untracked digests y evaluación fail-closed de relaciones [REQ-execution-identities-001, REQ-execution-identities-002, REQ-execution-identities-004, REQ-execution-identities-005]
- [x] 4.2 Crear `scripts/lib/k3-schema-fixtures.test.js` verificando la conformidad de los schemas JSON K3, fixtures negativos de no-aliasación (`WorkResult ≠ Candidate`) y rechazo de targets mutables [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-012, REQ-execution-identities-006]
- [x] 4.3 Ejecutar la suite completa de pruebas (`npm test` o runner equivalente) para verificar que no hay regresiones y que la integridad del manifiesto se mantiene [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-012]

## Phase 5: Documentation and Cleanup

- [x] 5.1 Añadir documentación JSDoc y definiciones de exportación en `scripts/lib/execution-identities/index.js` [REQ-execution-identities-001]
