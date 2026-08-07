# Tasks: Remediación de Identidades de Ejecución y Candidate Freeze K3

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| `REQ-kernel-contract-schemas-012` | MUST | `schemas/kernel/candidate/v2.schema.json`, `schemas/kernel/work-order/v2.schema.json`, `scripts/lib/lifecycle-kernel/k1-compat.js` | covered-by-design | Schemas v2 con kind explícito y baseline K1 inmutable |
| `REQ-execution-identities-003` | MUST | `scripts/lib/execution-identities/index.js` (`computeWorkOrderId`, `validateWorkOrderBinding`, `validateWorkResultBinding`) | covered-by-design | Payloads canónicos completos con dependencies/ownership y bindings fail-closed |
| `REQ-execution-identities-004` | MUST | `scripts/lib/execution-identities/index.js` (`freezeCandidate`, `computeCandidateId`) | covered-by-design | Constructor exclusivo v2, proyecciones workspace/staged y desambiguación diffText/diff_hash |
| `REQ-execution-identities-005` | MUST | `scripts/lib/execution-identities/index.js` (`evaluateCandidateRelation`) | covered-by-design | Recálculo determinista de candidate_id y detección de `DECLARED_ID_MISMATCH` |
| `REQ-execution-identities-006` | MUST | `scripts/lib/execution-identities/index.js` (`validateIdentityKind`) | covered-by-design | Discriminación cerrada de kind y regla positiva `sha256:<64 hex>` para attestations/delivery |
| `REQ-execution-identities-007` | MUST | `scripts/lib/execution-identities/index.js` (`compute*` functions) | covered-by-design | Validación estricta de parámetros obligatorios y formato digest `sha256:<64 hex>` |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350-450 líneas |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Remediación completa de identidades K3 y suite de pruebas adversariales | Main PR | Entrega atómica de schemas v2, funciones de compute/freeze/binding/relation y 14 tests adversariales |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Baseline K1 & Schemas v2 (Restauración e Inmutabilidad)

- [x] 1.1 Restaurar y verificar baseline pins K1 en `scripts/lib/lifecycle-kernel/k1-compat.js`, asegurando que `candidate/v1.schema.json` y `work-order/v1.schema.json` permanezcan inalterados [REQ-kernel-contract-schemas-012]
- [x] 1.2 Crear `schemas/kernel/candidate/v2.schema.json` (`$id: "ospec://schemas/kernel/candidate/v2"`) imponiendo `kind: "candidate/v2"`, regex `^sha256:[a-f0-9]{64}$` y propiedades requeridas de freeze [REQ-kernel-contract-schemas-012]
- [x] 1.3 Crear `schemas/kernel/work-order/v2.schema.json` (`$id: "ospec://schemas/kernel/work-order/v2"`) imponiendo `kind: "work-order/v2"`, regex `^sha256:[a-f0-9]{64}$`, `dependencies`, `ownership` y `required_evidence` [REQ-kernel-contract-schemas-012]
- [x] 1.4 Agregar fixtures unitarias positivas y negativas (non-aliasing) para esquemas v2 en `scripts/lib/execution-identities/index.test.js` [REQ-kernel-contract-schemas-012]

## Phase 2: Actualización de Funciones `compute*` y Payloads Canónicos

- [x] 2.1 Actualizar `computeSourceSnapshotId` en `scripts/lib/execution-identities/index.js` para exigir inputs requeridos y validar formato `sha256:<64 hex>` en digests referenciados [REQ-execution-identities-007]
- [x] 2.2 Actualizar `computeWorkOrderId` en `scripts/lib/execution-identities/index.js` para digerir canónicamente `dependencies`, `ownership` y `required_evidence`, y validar `source_snapshot_id` con formato `sha256:<64 hex>` [REQ-execution-identities-003, REQ-execution-identities-007]
- [x] 2.3 Actualizar `computeWorkResultId` en `scripts/lib/execution-identities/index.js` validando presencia e integridad de `work_order_id` y `source_snapshot_id` [REQ-execution-identities-003, REQ-execution-identities-007]
- [x] 2.4 Actualizar `computeCandidateId` en `scripts/lib/execution-identities/index.js` exigiendo propiedades obligatorias (`base_tree`, `projection`) y validando el formato `sha256:<64 hex>` en todos los digests [REQ-execution-identities-004, REQ-execution-identities-007]

## Phase 3: Constructor Exclusivo `freezeCandidate()` (v2) y Validadores de Binding

- [x] 3.1 Convertir `freezeCandidate()` en `scripts/lib/execution-identities/index.js` en constructor exclusivo de `candidate/v2`, asignando `kind: "candidate/v2"`, restringiendo proyecciones a `workspace`/`staged` y desambiguando de forma estricta `diffText` (auto-hasheado) vs `diff_hash` (validado) [REQ-execution-identities-004]
- [x] 3.2 Implementar `validateWorkOrderBinding()` en `scripts/lib/execution-identities/index.js` para validar fail-closed la consistencia de `source_snapshot_id` en `WorkOrder` [REQ-execution-identities-003]
- [x] 3.3 Implementar `validateWorkResultBinding()` en `scripts/lib/execution-identities/index.js` para validar fail-closed la desalineación entre `WorkOrder` y `WorkResult` (`work_order_id` y `source_snapshot_id`) [REQ-execution-identities-003]

## Phase 4: Recálculo Estricto en `evaluateCandidateRelation()` y Guardas de Kind

- [x] 4.1 Reescribir `evaluateCandidateRelation()` en `scripts/lib/execution-identities/index.js` para recalcular canónicamente digests de baseline y target ignorando `candidate_id` declarados, devolviendo `DECLARED_ID_MISMATCH` (`relation: "unknown"`, `action: "stop"`) ante discrepancias [REQ-execution-identities-005]
- [x] 4.2 Reemplazar guardas permisivos en `validateIdentityKind()` en `scripts/lib/execution-identities/index.js` por comprobación cerrada de `kind` y regla positiva de `CandidateId` (`sha256:<64 hex>`) para `CandidateEvaluationAttestation` y `DeliveryAuthorization` [REQ-execution-identities-006]

## Phase 5: Suite de Pruebas Adversariales Exhaustiva

- [x] 5.1 Implementar casos adversariales 1 a 4 en `scripts/lib/execution-identities/index.test.js`: suplantación de candidate_id en `evaluateCandidateRelation`, rechazo directo de `WorkResult` como candidate, mismatch de `work_order_id` y mismatch de `source_snapshot_id` [REQ-execution-identities-003, REQ-execution-identities-005, REQ-execution-identities-006]
- [x] 5.2 Implementar casos adversariales 5 a 8 en `scripts/lib/execution-identities/index.test.js`: rechazo de proyección `commit` en freeze, digest malformado en snapshot, omisión de propiedades obligatorias en computeCandidateId, y error en diff_hash sin prefijo sha256 [REQ-execution-identities-004, REQ-execution-identities-007]
- [x] 5.3 Implementar casos adversariales 9 a 11 en `scripts/lib/execution-identities/index.test.js`: rechazo de referencias mutables (`refs/heads/main`), rechazo de target no-sha256 en attestations, y alteración de dependencies/ownership en WorkOrder [REQ-execution-identities-003, REQ-execution-identities-006]
- [x] 5.4 Implementar casos adversariales 12 a 14 en `scripts/lib/execution-identities/index.test.js`: validación fallida de WorkResult contra Schema Candidate v2, Candidate contra Schema WorkOrder v2, y alteración de digest por cambio de modo de archivo (100644 vs 100755) [REQ-kernel-contract-schemas-012, REQ-execution-identities-004]
- [x] 5.5 Ejecutar la suite completa de pruebas unitarias y de integración (`npm test`) garantizando 100% de éxito en la remediación K3 [REQ-kernel-contract-schemas-012, REQ-execution-identities-003, REQ-execution-identities-004, REQ-execution-identities-005, REQ-execution-identities-006, REQ-execution-identities-007]
