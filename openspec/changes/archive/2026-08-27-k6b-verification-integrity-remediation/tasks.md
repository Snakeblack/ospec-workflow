# Tasks: k6b-verification-integrity-remediation

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-independent-verification-005: MUST without evidence fails closed | MUST | `obligation-coverage.js` | covered-by-design | `UNFULFILLED_MUST` after strategy |
| REQ-independent-verification-005: Nonexistent obligation_id fails closed | MUST | `obligation-coverage.js` | covered-by-design | `UNKNOWN_OBLIGATION_ID` |
| REQ-independent-verification-005: Wrong implementing node fails closed | MUST | `obligation-coverage.js` | covered-by-design | `WRONG_IMPLEMENTING_NODE` |
| REQ-independent-verification-006: Four roles → four assessments | MUST | `assessment.js` + `verdict.js` | covered-by-design | Assessment id includes role+obligation |
| REQ-independent-verification-007: Failed projection → ok:false | MUST | `independent-verifier/index.js` | covered-by-design | No PASS without graph |
| REQ-independent-verification-003: Collector-derived runtime-observed | MUST | `collector-provenance.js`, `evidence.js` | covered-by-design | Allowlist fail-closed |
| REQ-independent-verification-003: Model-reported insufficient | MUST | `collector-provenance.js`, `evidence.js` | covered-by-design | `INSUFFICIENT_PROVENANCE` |
| REQ-independent-verification-003: Stale/foreign/fabricated rejected | MUST | `evidence.js` (existing) | covered-by-design | Unchanged gates |
| REQ-independent-verification-003: Payload-only strong fails closed | MUST | `collector-provenance.js` | covered-by-design | `UNTRUSTED_COLLECTOR` |
| REQ-independent-verification-004: PASS requires strategy + MUST coverage | MUST | `index.js`, `verdict.js` | covered-by-design | Both gates required |
| REQ-independent-verification-004: Evidence carrying verdict rejected | MUST | `evidence.js`, schemas (unchanged) | covered-by-design | Existing v2 guard |
| REQ-assurance-graph-005: REQ-add-authorization-header valid | MUST | `projector.js` `rejectForbidden` | covered-by-design | Kind/namespace only |
| REQ-assurance-graph-005: Structured authorization kind rejected | MUST | `projector.js` | covered-by-design | Forbidden kind/namespace |
| REQ-assurance-graph-006: Replay byte-identical from persistable outputs | MUST | `assurance-graph/index.js` | covered-by-design | No ephemeral obligation_ids |
| REQ-assurance-graph-001: Matching inputs project graph | MUST | `projector.js` | covered-by-design | canonicalInputs in preimage |
| REQ-assurance-graph-001: Divergent graph fails closed | MUST | `assurance-graph/index.js` | covered-by-design | `GRAPH_DIVERGENCE` |
| REQ-assurance-graph-001: Contract/policy change → divergence | MUST | `projector.js`, reconcile | covered-by-design | C1→C2 / P1→P2 |
| REQ-assurance-graph-002: Same inputs same digest | MUST | `projector.js` | covered-by-design | Sorted canonical sets |
| REQ-assurance-graph-002: Forbidden relations rejected | MUST | `projector.js`, schema | covered-by-design | Existing + typed reject |
| REQ-assurance-graph-002: Canonical input change → distinct graph_id | MUST | `projector.js` | covered-by-design | contract/policy/exec/openspec digests |
| REQ-kernel-contract-schemas-027: Valid assessment fixture passes | MUST | `assessment/v1.schema.json`, fixtures | covered-by-design | ADR-001 $id |
| REQ-kernel-contract-schemas-027: Cross-family + verdict fail closed | MUST | fixtures + `k6b-schema-fixtures.test.js` | covered-by-design | No evidence/verification alias |
| REQ-kernel-contract-schemas-027: Four-role distinct identities | MUST | `assessment.js`, fixtures | covered-by-design | `v1-four-roles.json` |
| REQ-kernel-contract-schemas-027: v2/K1 pins frozen | MUST | `k6b-schema-fixtures.test.js` | covered-by-design | Byte-identical assert |
| REQ-kernel-contract-schemas-001: Assessment in inventory | MUST | `manifest.json`, `contract-claims.json` | covered-by-design | Additive registration |

### Reconciliation Verdict

- MUST coverage: complete (12 REQs, 24/24 MUST scenarios covered-by-design).
- SHOULD/MAY gaps: none.
- Ambiguities to track: none.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~900–1200 líneas |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Single PR con `size:exception`; orden: assessment/v1 schema → verifier modules → assurance-graph → adversarial/E2E → roadmap docs |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Publicar `assessment/v1` schema, fixtures y registro aditivo | PR 1 (single) | manifest + contract-claims; v2/K1 pins byte-identical |
| 2 | Módulos verifier: assessment, collector-provenance, obligation-coverage, facade | PR 1 (single) | Strategy → MUST walk → project fail-closed |
| 3 | Assurance Graph: canonical graph_id, rejectForbidden, replay | PR 1 (single) | satisfies desde assessments persistibles |
| 4 | Tests adversariales, E2E replay y roadmap K6b revise / K6c blocked | PR 1 (single) | `k6b-verifier-assurance-graph-e2e.test.js` + harness-evolution docs |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Assessment/v1 Schema Publication

- [x] 1.1 RED: Extender `scripts/lib/k6b-schema-fixtures.test.js` con tests que exigen familia `assessment` en `manifest.json`/`contract-claims.json`, fixtures valid/invalid, cross-family rejection y assert byte-identical de `evidence/v2`, `verification/v2` y pins K1. [REQ-kernel-contract-schemas-027, REQ-kernel-contract-schemas-001]
- [x] 1.2 GREEN: Crear `schemas/kernel/assessment/v1.schema.json` (`$id: ospec://schemas/kernel/assessment/v1`, `kind: assessment/v1`, `additionalProperties: false`, sin `verdict`). [REQ-kernel-contract-schemas-027]
- [x] 1.3 GREEN: Crear fixtures `schemas/kernel/assessment/fixtures/valid/v1-complete.json`, `v1-four-roles.json` e invalid `v1-missing-required.json`, `v1-with-verdict.json`, `v1-evidence-alias.json`. [REQ-kernel-contract-schemas-027]
- [x] 1.4 GREEN: Registrar familia `assessment` en `schemas/kernel/manifest.json` y claims aditivos en `schemas/kernel/contract-claims.json`; ejecutar `node --test scripts/lib/k6b-schema-fixtures.test.js`. [REQ-kernel-contract-schemas-001]
- [x] 1.5 TRIANGULATE: Assert cuatro roles comparten un `evidence_id` pero producen cuatro `assessment_id` distintos en fixtures + test. [REQ-kernel-contract-schemas-027]

## Phase 2: Assessment Identity Module

- [x] 2.1 RED: Crear `scripts/lib/independent-verifier/assessment.test.js` con tests para `computeAssessmentId`, emisión/validación y rechazo de payloads con `verdict`. [REQ-independent-verification-006]
- [x] 2.2 GREEN: Implementar `scripts/lib/independent-verifier/assessment.js` (`computeAssessmentId`, `emitAssessment`, validate contra schema). [REQ-independent-verification-006]
- [x] 2.3 TRIANGULATE: Mismo bytes/provenance/node, cuatro roles → un `evidence_id`, cuatro `assessment_id` distintos. [REQ-independent-verification-006]

## Phase 3: Collector Provenance Allowlist

- [x] 3.1 RED: Tests en `scripts/lib/independent-verifier/index.test.js` para payload `runtime-observed` sin collector → `UNTRUSTED_COLLECTOR`; allowlisted `node-test`+`tool-execution-transport` → `runtime-observed`; worker → `model-reported` insuficiente para obligación runtime. [REQ-independent-verification-003]
- [x] 3.2 GREEN: Crear `scripts/lib/independent-verifier/collector-provenance.js` con tabla allowlist fail-closed (ADR-003). [REQ-independent-verification-003]
- [x] 3.3 GREEN: Modificar `scripts/lib/independent-verifier/evidence.js` para derivar clase desde collector/transport; mantener `computeEvidenceId` observation-only. [REQ-independent-verification-003]
- [x] 3.4 TRIANGULATE: Provenance reclasificada (payload strong vs collector weak) falla cerrado; digest ≠ origen. [REQ-independent-verification-003]

## Phase 4: Obligation Manifest MUST Walk

- [x] 4.1 RED: Tests en `scripts/lib/independent-verifier/obligation-coverage.test.js` (o `index.test.js`): MUST sin evidencia → `UNFULFILLED_MUST`; `obligation_id` alien → `UNKNOWN_OBLIGATION_ID`; nodo B ∉ `implemented_by` → `WRONG_IMPLEMENTING_NODE`; deferral aprobado skip. [REQ-independent-verification-005]
- [x] 4.2 GREEN: Implementar `scripts/lib/independent-verifier/obligation-coverage.js` con walk post-strategy, deferral predicate K4a y emisión de assessments persistibles. [REQ-independent-verification-005]
- [x] 4.3 TRIANGULATE: Strategy satisfecha pero MUST sin binding → FAIL; empty `required_evidence` en MUST no-deferred → FAIL. [REQ-independent-verification-005]

## Phase 5: Verifier Facade Integration

- [x] 5.1 RED: Tests en `index.test.js`: orden bindings→strategy→normalize→MUST→project; stub projector failure → `ok: false`, `GRAPH_PROJECTION_FAILED`, sin `assurance_graph` ni PASS; strategy fail short-circuits sin upgrade MUST. [REQ-independent-verification-007, REQ-independent-verification-004]
- [x] 5.2 GREEN: Modificar `scripts/lib/independent-verifier/index.js`: integrar MUST walk, retornar `assessments`, fail-closed si proyección falla; PASS solo con strategy + MUST coverage. [REQ-independent-verification-004, REQ-independent-verification-007]
- [x] 5.3 GREEN: Actualizar tests existentes en `index.test.js` para incluir `collector` en raw evidence que reclama clase fuerte. [REQ-independent-verification-003]
- [x] 5.4 REFACTOR: Verificar `verification.evidence_ids` unique-sort sigue listando un E con cuatro assessments distintos. [REQ-independent-verification-006, REQ-independent-verification-004]

## Phase 6: Assurance Graph Remediation

- [x] 6.1 RED: Tests en `scripts/lib/assurance-graph/index.test.js`: `graph_id` cambia al alterar contract/policy/execution-graph/openspec digest; permutación nodos/edges no cambia digest; `REQ-add-authorization-header` + `kind: requirement` válido; `kind: authorization` rechazado. [REQ-assurance-graph-002, REQ-assurance-graph-005]
- [x] 6.2 GREEN: Modificar `scripts/lib/assurance-graph/projector.js`: preimage canonicalInputs en `graph_id`; `satisfies` desde assessments; exportar `rejectForbidden` por kind/namespace; `GRAPH_PROJECTION_FAILED` para missing-candidate. [REQ-assurance-graph-002, REQ-assurance-graph-005]
- [x] 6.3 GREEN: Modificar `schemas/kernel/assurance-graph/v1.schema.json` con campo opcional `canonical_inputs` persistible. [REQ-assurance-graph-002]
- [x] 6.4 RED: Tests replay: recomputar desde assessments+evidence+verification+canonical_inputs sin ephemeral `obligation_ids` → byte-identical; C1→C2 / P1→P2 → `GRAPH_DIVERGENCE`. [REQ-assurance-graph-006, REQ-assurance-graph-001]
- [x] 6.5 GREEN: Modificar `scripts/lib/assurance-graph/index.js` para replay desde salidas persistibles y reconciliación fail-closed. [REQ-assurance-graph-006]

## Phase 7: Adversarial Tests and E2E

- [x] 7.1 RED: Extender `scripts/k6b-verifier-assurance-graph-e2e.test.js` con persistencia de assessments + `canonical_inputs`, replay equality y contract/policy churn → `GRAPH_DIVERGENCE`. [REQ-assurance-graph-006, REQ-assurance-graph-001]
- [x] 7.2 GREEN: Implementar flujo E2E completo con assessments persistidos y replay byte-identical. [REQ-assurance-graph-006]
- [x] 7.3 TRIANGULATE adversariales en `index.test.js`: un EvidenceId en cuatro roles; MUST sin evidencia; obligation_id inexistente; nodo incorrecto; proyección fallida. [REQ-independent-verification-005, REQ-independent-verification-006, REQ-independent-verification-007]
- [x] 7.4 Ejecutar suites focalizadas (`k6b-schema-fixtures.test.js`, `independent-verifier/*.test.js`, `assurance-graph/index.test.js`, `k6b-verifier-assurance-graph-e2e.test.js`) y registrar evidencia TDD en `apply-progress.md`.

## Phase 8: Roadmap Documentation

- [x] 8.1 Actualizar `docs/roadmaps/harness-evolution.md`: K6b `revise`; K6c `blocked-by-K6b-remediation` hasta archive de este change. [REQ-independent-verification-005 via proposal success criteria]
- [x] 8.2 Actualizar `docs/architecture/harness-evolution.md` con el mismo flip de estado (sin módulos runtime). [REQ-independent-verification-005 via proposal success criteria]
