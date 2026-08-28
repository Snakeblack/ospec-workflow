# Tasks: K6b Trusted Evidence and Replay Closure

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-independent-verification-003 / Runtime-observed evidence satisfies a test obligation | MUST | `scripts/lib/independent-verifier/evidence.js`, `scripts/lib/independent-verifier/index.js` | covered-by-design | Observaciones físicas con procedencia runtime derivada de collector trusted |
| REQ-independent-verification-003 / Model-reported tests-passed is insufficient | MUST | `scripts/lib/independent-verifier/evidence.js` (`evaluateProvenanceSufficiency`) | covered-by-design | Falla closed ante procedencia model-reported |
| REQ-independent-verification-003 / Stale, foreign, or fabricated evidence is rejected | MUST | `scripts/lib/independent-verifier/index.js` (`rejectStaleEvidence`) | covered-by-design | Rechazo por hash digest, candidate_id mismatch o invalidates |
| REQ-independent-verification-003 / Payload-claimed strong provenance without trusted collector fails closed | MUST | `scripts/lib/independent-verifier/collector-provenance.js`, `evidence.js` | covered-by-design | Fail-closed si falta collector metadata |
| REQ-independent-verification-003 / Verifier derives trusted evidence metadata from Execution Graph and receipts | MUST | `scripts/lib/independent-verifier/index.js` (`verifyCandidate`) | covered-by-design | Inferencia autoritativa de roles y cobertura desde receipts |
| REQ-independent-verification-003 / Untrusted caller metadata is rejected with UNTRUSTED_CALLER_METADATA | MUST | `scripts/lib/independent-verifier/evidence.js` (`normalizeEvidence`) | covered-by-design | Rechazo inmediato si raw payload contiene `role`, `obligation_ids`, etc. |
| REQ-independent-verification-005 / MUST without admissible evidence fails closed | MUST | `scripts/lib/independent-verifier/obligation-coverage.js` (`walkMustObligations`) | covered-by-design | Falla closed con `UNFULFILLED_MUST` |
| REQ-independent-verification-005 / Nonexistent obligation_id fails closed | MUST | `scripts/lib/independent-verifier/obligation-coverage.js` (`walkMustObligations`) | covered-by-design | Falla closed con `UNKNOWN_OBLIGATION_ID` |
| REQ-independent-verification-005 / Evidence bound to the wrong implementing node fails closed | MUST | `scripts/lib/independent-verifier/obligation-coverage.js` (`walkMustObligations`) | covered-by-design | Falla closed con `WRONG_IMPLEMENTING_NODE` |
| REQ-independent-verification-005 / Partial required_evidence coverage fails closed | MUST | `scripts/lib/independent-verifier/obligation-coverage.js` (`walkMustObligations`) | covered-by-design | Falla closed con `UNFULFILLED_MUST` identificando tokens faltantes |
| REQ-independent-verification-005 / Empty evidence_requirements_satisfied cannot claim satisfaction | MUST | `scripts/lib/independent-verifier/obligation-coverage.js` (`walkMustObligations`) | covered-by-design | Tokens vacíos no satisfacen obligaciones MUST |
| REQ-independent-verification-005 / Blind copying of node required_evidence is forbidden and ungrounded satisfaction fails closed | MUST | `scripts/lib/independent-verifier/index.js` (`verifyCandidate`) | covered-by-design | Eliminación de copia ciega; satisfacción exclusivamente desde receipts |
| REQ-independent-verification-006 / Same EvidenceId as RED and GREEN fails closed | MUST | `scripts/lib/independent-verifier/strategy-policy.js` (`assertCompatibleRoleSharing`) | covered-by-design | Falla closed con `STRATEGY_EVIDENCE_ALIAS` |
| REQ-independent-verification-006 / GREEN before RED fails closed | MUST | `scripts/lib/independent-verifier/strategy-policy.js` (`assertRoleOrder`) | covered-by-design | Validación causal por `execution_sequence.ordinal` |
| REQ-independent-verification-006 / RED after PATCH fails closed | MUST | `scripts/lib/independent-verifier/strategy-policy.js` (`assertRoleOrder`) | covered-by-design | Orden causal estricto en estrategia bug |
| REQ-independent-verification-006 / Distinct tuples yield distinct assessment identities | MUST | `scripts/lib/independent-verifier/assessment.js` (`computeAssessmentId`) | covered-by-design | Tuplas `(evidence_id, role, obligation_id)` generan IDs únicos |
| REQ-independent-verification-006 / Characterization-after before characterization-before fails closed | MUST | `scripts/lib/independent-verifier/strategy-policy.js` (`assertRoleOrder`) | covered-by-design | Validación ordinal y `previous_evidence_id` en refactor |
| REQ-independent-verification-006 / Fallback to JSON array position without execution_sequence fails closed | MUST | `scripts/lib/independent-verifier/strategy-policy.js` (`assertRoleOrder`) | covered-by-design | Prohibición de fallback a índices de array |
| REQ-independent-verification-006 / Negative and acceptance sharing same EvidenceId fails closed | MUST | `scripts/lib/independent-verifier/strategy-policy.js` (`assertCompatibleRoleSharing`) | covered-by-design | Matriz de incompatibilidad de roles |
| REQ-independent-verification-006 / Non-conflicting shared evidence passes validation | MUST | `scripts/lib/independent-verifier/strategy-policy.js` (`assertCompatibleRoleSharing`) | covered-by-design | Permite compartir evidencia en roles no conflictivos |
| REQ-assurance-graph-006 / Replay from persisted outputs yields the same graph | MUST | `scripts/lib/assurance-graph/index.js` (`replayAssuranceGraph`) | covered-by-design | Replay idéntico recomputando grafos |
| REQ-assurance-graph-006 / Tampered assessment_id fails replay | MUST | `scripts/lib/assurance-graph/index.js` (`validateReplayRecords`) | covered-by-design | Revalidación estricta de IDs de assessment |
| REQ-assurance-graph-006 / Assessment fails schema, candidate, or policy revalidation | MUST | `scripts/lib/assurance-graph/index.js` (`validateReplayRecords`) | covered-by-design | Falla closed con `GRAPH_DIVERGENCE` |
| REQ-assurance-graph-006 / Assessment bound to missing evidence or non-implementing node fails replay | MUST | `scripts/lib/assurance-graph/index.js` (`validateReplayRecords`) | covered-by-design | Falla closed con `GRAPH_DIVERGENCE` |
| REQ-assurance-graph-006 / Evidence v2 digest mismatch or invalid candidate binding fails replay | MUST | `scripts/lib/assurance-graph/index.js` (`validateReplayRecords`) | covered-by-design | Recomputación con `digestRawBytes` |
| REQ-assurance-graph-006 / Tampered evidence_id or failed computeEvidenceId fails replay | MUST | `scripts/lib/assurance-graph/index.js` (`validateReplayRecords`) | covered-by-design | Recomputación con `computeEvidenceId` |
| REQ-assurance-graph-006 / Insufficient provenance during evidence replay fails replay | MUST | `scripts/lib/assurance-graph/index.js` (`validateReplayRecords`) | covered-by-design | Revalidación con `evaluateProvenanceSufficiency` |
| REQ-assurance-graph-006 / Verification v2 referencing non-existent evidence_id fails replay | MUST | `scripts/lib/assurance-graph/index.js` (`validateReplayRecords`) | covered-by-design | Falla closed con `GRAPH_DIVERGENCE` |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~200-250 líneas |
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
| 1 | Cierre de integridad de evidencias, derivación autoritativa, causalidad y replay | Single PR | Entrega atómica autocontenida con suites unitarias y e2e integradas |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Physical Observation Segregation

- [x] 1.1 In `scripts/lib/independent-verifier/evidence.js`, update `normalizeEvidence` to validate that raw evidence object contains no semantic properties (`role`, `obligation_ids`, `obligation_id`, `evidence_requirements_satisfied`); immediately fail closed with `{ ok: false, reason_code: "UNTRUSTED_CALLER_METADATA" }` if any are present. [REQ-independent-verification-003]
- [x] 1.2 In `scripts/lib/independent-verifier/evidence.js`, ensure `normalizeEvidence` returns physical observation record without untrusted caller semantic attributes, retaining only physical observation properties (`evidence`, `execution_sequence`, `raw`). [REQ-independent-verification-003]
- [x] 1.3 Create unit test suite in `scripts/lib/independent-verifier/evidence.test.js` validating fail-closed rejection with `UNTRUSTED_CALLER_METADATA` when payload contains `role`, `obligation_id`, `obligation_ids`, or `evidence_requirements_satisfied` individually and in combination. [REQ-independent-verification-003]

## Phase 2: Authoritative Derivation from Receipts

- [x] 2.1 In `scripts/lib/independent-verifier/index.js`, update `verifyCandidate` to resolve evidence `role` strictly from Execution Graph (`node.role`) and `obligation_ids` from graph obligations (`obligation.implemented_by.includes(node.node_id)`). [REQ-independent-verification-003, REQ-independent-verification-005]
- [x] 2.2 In `scripts/lib/independent-verifier/index.js`, update `verifyCandidate` to derive `evidence_requirements_satisfied` strictly from trusted execution receipts (`input.receipts` or `input.runner_receipts`) matching `node_id` or `evidence_id`, eliminating blind copying of `node.required_evidence` and setting `[]` when no receipt confirms satisfaction. [REQ-independent-verification-003, REQ-independent-verification-005]
- [x] 2.3 In `scripts/lib/independent-verifier/obligation-coverage.js`, verify `walkMustObligations` enforces subset satisfaction strictly on derived receipt tokens, rejecting ungrounded MUST obligations or empty satisfaction arrays with `UNFULFILLED_MUST`. [REQ-independent-verification-005]
- [x] 2.4 In `scripts/lib/independent-verifier/obligation-coverage.test.js`, add unit test scenarios verifying that absence of receipts causes `UNFULFILLED_MUST` even if `node.required_evidence` is declared, and that blind copying is eliminated. [REQ-independent-verification-005]

## Phase 3: Strict Causal Chronology

- [x] 3.1 In `scripts/lib/independent-verifier/strategy-policy.js`, update `assertRoleOrder` to require valid `execution_sequence` (`run_id`, strictly monotonic increasing `ordinal`, and valid `previous_evidence_id` chaining) for `strict-tdd`, `bug`, and `refactor` strategies, removing fallback to JSON array indices. [REQ-independent-verification-006]
- [x] 3.2 In `scripts/lib/independent-verifier/strategy-policy.js`, enforce causal sequence rules in `assertRoleOrder`: for `bug` and `strict-tdd`, RED must precede GREEN in `execution_sequence` (and RED before PATCH); for `refactor`, `characterization-before` must precede `characterization-after` with monotonic `ordinal` and matching `previous_evidence_id`; fail with `STRATEGY_SEQUENCE_VIOLATION` on any violation. [REQ-independent-verification-006]
- [x] 3.3 Add unit tests in `scripts/lib/independent-verifier/index.test.js` covering missing `execution_sequence`, inverted ordinals (GREEN < RED), corrupted chaining, and verifying that JSON array order alone is rejected with `STRATEGY_SEQUENCE_VIOLATION`. [REQ-independent-verification-006]

## Phase 4: Full Cryptographic Replay

- [x] 4.1 In `scripts/lib/assurance-graph/index.js`, enhance `validateReplayRecords` / `replayAssuranceGraph` to recompute `digestRawBytes` from bytes, recompute `computeEvidenceId(record, bytes)`, and assert byte-exact match against `record.digest` and `record.evidence_id`, failing with `GRAPH_DIVERGENCE` on mismatch. [REQ-assurance-graph-006]
- [x] 4.2 In `scripts/lib/assurance-graph/index.js`, enhance `validateReplayRecords` to evaluate `evaluateProvenanceSufficiency(record, { requireRuntime: true })` on replayed evidence, failing with `GRAPH_DIVERGENCE` if provenance is insufficient or untrusted. [REQ-assurance-graph-006]
- [x] 4.3 In `scripts/lib/assurance-graph/index.test.js`, add comprehensive replay test cases for tampered `evidence_id`, modified raw bytes, mismatched candidate subject, insufficient provenance (`model-reported`), and corrupted verification/assessment bindings. [REQ-assurance-graph-006]

## Phase 5: Harness Fixtures Update, E2E Suite & Adversarials

- [x] 5.1 In `scripts/lib/independent-verifier/index.test.js`, refactor test harness and fixture generators to separate physical `rawEvidence` observations from `runner_receipts`, and populate canonical `execution_sequence` on all strategy test cases. [REQ-independent-verification-003, REQ-independent-verification-005, REQ-independent-verification-006]
- [x] 5.2 Create end-to-end integration and adversarial test suite in `test/e2e/k6b-verifier-assurance-graph-e2e.test.js` validating the full verification, projection, and replay lifecycle with caller injection attacks, causality tampering, and replay tampering. [REQ-independent-verification-003, REQ-independent-verification-005, REQ-independent-verification-006, REQ-assurance-graph-006]
- [x] 5.3 Run all independent verifier, assurance graph, and e2e test suites (`node --test`) to verify complete regression-free validation. [REQ-independent-verification-003, REQ-independent-verification-005, REQ-independent-verification-006, REQ-assurance-graph-006]
