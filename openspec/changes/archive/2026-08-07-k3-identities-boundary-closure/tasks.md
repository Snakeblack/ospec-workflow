# Tasks: K3 Identities Boundary Closure

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-execution-identities-005 / Non-frozen candidate rejected | MUST | `index.js` `evaluateCandidateRelation` + `validateCandidateV2` | covered-by-design | Gate before digest compare |
| REQ-execution-identities-005 / DECLARED_ID_MISMATCH | MUST | `index.js` `evaluateCandidateRelation` | covered-by-design | Preserve existing GO path |
| REQ-execution-identities-008 / Missing kind fails closed | MUST | `index.js` `EXPECTED_KINDS`, `validateIdentityKind` | covered-by-design | Positive table replaces blacklist |
| REQ-execution-identities-008 / Attestation rejects SourceSnapshot disguise | MUST | `index.js` `validateIdentityKind` EvaluationAttestation surface | covered-by-design | ADR-005 provisional kinds |
| REQ-execution-identities-003 / Crypto binding recompute | MUST | `index.js` `validateWorkOrderBinding(sourceSnapshot, workOrder)`, `validateWorkResultBinding` | covered-by-design | ADR-002 two-arg signature |
| REQ-execution-identities-004 / freezeCandidate schema-valid v2 | MUST | `index.js` `freezeCandidate`, `validateCandidateV2` | covered-by-design | `repository_id` minLength 1; digest or null |
| REQ-execution-identities-007 / Strict compute* throws | MUST | `index.js` `compute*` functions | covered-by-design | Remove `\|\| []` and silent defaults |
| REQ-execution-identities-009 / work-order/v2 domain | MUST | `index.js` `computeWorkOrderId` dual-domain dispatch | covered-by-design | ADR-004; Candidate stays candidate/v1 |
| REQ-kernel-contract-schemas-013 / Canonical v2 paths + registry | MUST | `schemas/kernel/candidate/v2.schema.json`, `work-order/v2.schema.json`, manifest, claims | covered-by-design | ADR-001 relocate + delete `*-v2/` |
| REQ-kernel-contract-schemas-014 / K1 restore @02e97a5 | MUST | v1 schemas, `k1-compat.js` `K1_SCHEMA_BASELINE` | covered-by-design | ADR-003 file+pin restore |
| REQ-kernel-contract-schemas-012 / Fixtures + v2 kind discriminator | MUST | fixture moves, `k3-schema-fixtures.test.js` | covered-by-design | v2- prefix under canonical trees |
| GO preservation / deps/ownership/evidence | MUST | existing tests in `index.test.js` | covered-by-design | Non-regression only |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: Attestation kind strings provisional until K8/K10 (assumption `sdd-design-001`)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 650–850 (additions + deletions) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Single PR under `size-exception` (maintainer approved) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Schema publication + K1 v1 restore + registry | PR único | Foundation; unblock `validateCandidateV2` schema load |
| 2 | Runtime closures + ~12 adversarial TDD | PR único (mismo) | Depends on Unit 1 schema paths; same apply batch |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Schema Publication & K1 Foundation

- [x] 1.1 Crear rama `fix/k3-identities-boundary-closure` desde `main` antes de editar
- [x] 1.2 Relocate `schemas/kernel/candidate-v2/v2.schema.json` → `schemas/kernel/candidate/v2.schema.json`; fijar `$id` `ospec://schemas/kernel/candidate/v2`; añadir `repository_id` a `required` [REQ-kernel-contract-schemas-013, REQ-kernel-contract-schemas-012]
- [x] 1.3 Relocate `schemas/kernel/work-order-v2/v2.schema.json` → `schemas/kernel/work-order/v2.schema.json`; fijar `$id` `ospec://schemas/kernel/work-order/v2` [REQ-kernel-contract-schemas-013]
- [x] 1.4 Mover fixtures v2 a `schemas/kernel/candidate/fixtures/{valid,invalid}/v2-*.json` y `schemas/kernel/work-order/fixtures/{valid,invalid}/v2-*.json`; eliminar árboles `candidate-v2/` y `work-order-v2/` [REQ-kernel-contract-schemas-013, REQ-kernel-contract-schemas-012]
- [x] 1.5 Registrar familias `candidate-v2` / `work-order-v2` en `schemas/kernel/manifest.json` y `schemas/kernel/contract-claims.json` apuntando a paths canónicos [REQ-kernel-contract-schemas-013]
- [x] 1.6 Restaurar bytes de `candidate/v1.schema.json` y `work-order/v1.schema.json` desde `git show 02e97a5b49aa06e38c493d0221b2bda6ed3e062e:…` [REQ-kernel-contract-schemas-014]
- [x] 1.7 Actualizar `scripts/lib/lifecycle-kernel/k1-compat.js`: pins `K1_SCHEMA_BASELINE` a digests era `02e97a5` (`752c7a70…` / `a8204e0f…`); retarget `K21_FAMILY_PREFIXES` para excluir paths v2 canónicos, no dirs viejos [REQ-kernel-contract-schemas-014]

## Phase 2: Adversarial RED Tests (~12 casos)

- [x] 2.1 RED: `index.test.js` — baseline/target no congelados o sin `kind: candidate/v2` → `INVALID_FROZEN_CANDIDATE`, sin comparación de relación [REQ-execution-identities-005]
- [x] 2.2 RED: `index.test.js` — objeto hand-built `kind: candidate/v2` pero schema-invalid → mismo `INVALID_FROZEN_CANDIDATE` [REQ-execution-identities-005, REQ-execution-identities-004]
- [x] 2.3 RED: `index.test.js` — attestation surface sin `kind` → `validateIdentityKind` fail closed [REQ-execution-identities-008]
- [x] 2.4 RED: `index.test.js` — SourceSnapshot + `attestation_id` sin kind attestation → fail closed [REQ-execution-identities-008]
- [x] 2.5 RED: `index.test.js` — kind compatible en `EXPECTED_KINDS` → pass [REQ-execution-identities-008]
- [x] 2.6 RED: `index.test.js` — binding spoof: IDs declarados string-equal pero payload mutado → `validateWorkOrderBinding` y `validateWorkResultBinding` fail [REQ-execution-identities-003]
- [x] 2.7 RED: `index.test.js` — `validateWorkOrderBinding(sourceSnapshot, workOrder)` exige dos args; migrar callers del test [REQ-execution-identities-003]
- [x] 2.8 RED: `index.test.js` — `dependencies: null` / no-array en WorkOrder → `computeWorkOrderId` throws (no `[]`) [REQ-execution-identities-007]
- [x] 2.9 RED: `index.test.js` — WorkResult sin campo requerido → `computeWorkResultId` throws sin default `exit_code` [REQ-execution-identities-007]
- [x] 2.10 RED: `index.test.js` — `freezeCandidate` rechaza `repository_id` vacío; `intended_untracked_digest` nunca `""` [REQ-execution-identities-004]
- [x] 2.11 RED: `index.test.js` — invariante `validateCandidateV2(freezeCandidate(validInput)) === true` [REQ-execution-identities-004, REQ-execution-identities-005]
- [x] 2.12 RED: `index.test.js` — mismo payload WorkOrder v1 vs v2 → digests distintos; dominio v2 es `work-order/v2` [REQ-execution-identities-009]
- [x] 2.13 RED: `k3-schema-fixtures.test.js` — paths canónicos + `$id` resuelven; `candidate-v2/` no es autoritativo [REQ-kernel-contract-schemas-013, REQ-kernel-contract-schemas-012]
- [x] 2.14 RED: test K1 — archivos v1 + pins coinciden digests era `02e97a5`; escenario pin-only retarget documentado como no compliant [REQ-kernel-contract-schemas-014]

## Phase 3: Runtime GREEN — 8 Closures

- [x] 3.1 GREEN: implementar `validateCandidateV2(candidate)` con `validateInstance` contra schema canónico (lazy-cache) en `index.js` [REQ-execution-identities-005, REQ-execution-identities-004]
- [x] 3.2 GREEN: gate en `evaluateCandidateRelation` — `kind === "candidate/v2"`, `schema_version === 2`, `validateCandidateV2` en baseline y target antes de relación; retorno `{ relation: "unknown", action: "stop", reason_code: "INVALID_FROZEN_CANDIDATE" }` [REQ-execution-identities-005]
- [x] 3.3 GREEN: reemplazar `validateIdentityKind` blacklist/optional-kind por tabla cerrada `EXPECTED_KINDS` (ADR-005 kinds provisionales K8/K10) [REQ-execution-identities-008]
- [x] 3.4 GREEN: cambiar `validateWorkOrderBinding(sourceSnapshot, workOrder)` — recomputar `computeSourceSnapshotId` + `computeWorkOrderId` vs declarados; actualizar `validateWorkResultBinding` con recompute completo [REQ-execution-identities-003]
- [x] 3.5 GREEN: eliminar coerción `|| []` y defaults silenciosos en `computeSourceSnapshotId`, `computeWorkOrderId`, `computeWorkResultId`, `computeCandidateId` [REQ-execution-identities-007]
- [x] 3.6 GREEN: `freezeCandidate` — enforce `repository_id` minLength 1; `intended_untracked_digest` `sha256:<hex>` o `null` nunca `""`; único constructor `candidate/v2` [REQ-execution-identities-004]
- [x] 3.7 GREEN: `computeWorkOrderId` dual-domain — `work-order/v2` cuando `kind`/`schema_version` v2; v1 sin cambio; Candidate digest domain permanece `candidate/v1` [REQ-execution-identities-009]
- [x] 3.8 GREEN: exportar `validateCandidateV2` y `EXPECTED_KINDS` desde `index.js` si tests/consumers lo requieren [REQ-execution-identities-005, REQ-execution-identities-008]

## Phase 4: Integration, Regression & Evidence

- [x] 4.1 Actualizar `k3-schema-fixtures.test.js` paths/`$id`/fixture refs tras relocate [REQ-kernel-contract-schemas-012, REQ-kernel-contract-schemas-013]
- [x] 4.2 Verificar tests GO existentes pasan sin debilitar: `DECLARED_ID_MISMATCH`, deps/ownership/required_evidence, diffText/diff_hash [REQ-execution-identities-003, REQ-execution-identities-005]
- [x] 4.3 Ejecutar `npm test` — suite adversarial (~12–14) GREEN; registrar tabla TDD Cycle Evidence en `apply-progress.md` [REQ-execution-identities-005 through 009, REQ-kernel-contract-schemas-013, REQ-kernel-contract-schemas-014]
- [x] 4.4 Commit convencional por unidad lógica (schemas → runtime → tests); sin atribución AI en mensajes

## Phase 5: 4R Advisory WARNING Remediation (architecture-bounded-review-001 / new-scope)

- [x] 5.1 RISK: `evaluateCandidateRelation` — freeze/typed-selector gate BEFORE ambiguous/unknown short-circuit; forged `{ambiguous:true}` → `INVALID_FROZEN_CANDIDATE`; typed `candidate-relation-selector` still decides
- [x] 5.2 RISK: `isWorkOrderV2` fail-closed on kind↔schema_version disagreement (no OR-driven domain desync)
- [x] 5.3 RELIABILITY: `computeWorkOrderId` — throw on null/non-object `ownership`/`budget` (no `|| {}` coercion)
- [x] 5.4 RELIABILITY: `computeWorkResultId` — reject missing `patch`; reject null/non-integer `exit_code`
- [x] 5.5 READABILITY: `validateCandidateV2` — schema-load infrastructure throws (`CANDIDATE_V2_SCHEMA_LOAD_FAILED`); invalid instance returns false
- [x] 5.6 READABILITY: rename `SNAPSHOT_MISMATCH` → `ILL_FORMED_SNAPSHOT_ID` (declared ill-formed) vs `SOURCE_SNAPSHOT_MISMATCH` (recompute mismatch)
- [x] 5.7 READABILITY: comment `FAMILY_PUBLICATION.candidate.fixtureNameFilter` excluding `k3-frozen.json`
- [x] 5.8 SUGGESTION (cheap): document EXPECTED_KINDS EvaluationAttestation alias + isWorkOrderV2 domain docs
- [x] 5.9 Verify: focused identity tests + `npm test` / `node scripts/check.js` PASS
