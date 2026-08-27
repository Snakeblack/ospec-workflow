# Tasks: k6b Semantic Integrity Remediation

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-independent-verification-008 / contract digest mismatch | MUST | `scripts/lib/independent-verifier/bindings.js`, ordered facade in `index.js`; adversarial verifier test | covered-by-design | Gate runs before strategy and emits no verdict. |
| REQ-independent-verification-005 / MUST token subset, unknown obligation, wrong node, partial coverage | MUST | `evidence.js`, `obligation-coverage.js`, `assessment.js`; coverage tests | covered-by-design | `required_evidence` is checked against sorted persisted satisfied tokens per binding. |
| REQ-independent-verification-006 / distinct assessment bindings, no role aliasing, temporal order | MUST | `strategy-policy.js`, `assessment.js`, facade; strategy/identity tests | covered-by-design | Raw evidence order is authoritative; evidence/v2 remains unchanged. |
| REQ-kernel-contract-schemas-027 / additive schema, coverage, closed family, frozen pins | MUST | `schemas/kernel/assessment/v1.schema.json`, `contract-claims.json`, fixtures and schema tests | covered-by-design | Includes complete, omitted-field, verdict/cross-family, four-role and pin checks. |
| REQ-assurance-graph-007 / contradictory or null canonical inputs | MUST | `scripts/lib/assurance-graph/projector.js`; projector tests | covered-by-design | Required SHA-256 digests are validated before graph-id construction. |
| REQ-assurance-graph-006 / replay assessment revalidation | MUST | `assessment.js`, `scripts/lib/assurance-graph/index.js`; replay integration tests | covered-by-design | Revalidates schema, identity, candidate/policy, evidence, obligation and node bindings. |
| REQ-assurance-graph-008 / complete stored-payload reconciliation | MUST | `scripts/lib/assurance-graph/index.js`; reconcile tamper tests | covered-by-design | Recomputes stored graph id and compares nodes, canonical inputs and identity fields. |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 970–1,370 (incremental remediation: 120–220) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Single maintainer-approved PR with explicit `size:exception`; implement in dependency-ordered work units. |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

## Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Extend assessment contract and canonical identity | PR 1 (size exception) | Schema, claims, assessment id/validation, fixtures; verify frozen pins. |
| 2 | Enforce verifier binding, strategy order and MUST token coverage | PR 1 (size exception) | RED tests first, then implementation and refactor; depends on Unit 1. |
| 3 | Harden projector, replay and reconcile | PR 1 (size exception) | Canonical-input validation and full stored-payload checks; depends on Units 1–2. |
| 4 | Integrate adversarial/e2e tests and roadmap status | PR 1 (size exception) | Run full `npm test`; docs remain within K6b scope. |
| 5 | Close verify evidence gaps with persistent runtime tests | PR 1 (size exception) | Depends on existing verifier and Assurance Graph behavior; no production-code or contract changes. |

## Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Assessment Contract and Fixtures

- [x] 1.1 Update `schemas/kernel/assessment/v1.schema.json` with required closed-array `evidence_requirements_satisfied`, preserving `additionalProperties: false` and excluding `verdict` [REQ-kernel-contract-schemas-027]
- [x] 1.2 Add the additive assessment claim to `schemas/kernel/contract-claims.json` without changing its manifest `$id` or frozen K1 claims [REQ-kernel-contract-schemas-027]
- [x] 1.3 Update/create `schemas/kernel/assessment/fixtures/valid/*.json` and `invalid/*.json` for complete coverage, omitted coverage, verdict/cross-family substitution, and four distinct roles [REQ-kernel-contract-schemas-027]
- [x] 1.4 Write RED tests in `scripts/lib/k6b-schema-fixtures.test.js` for schema identity, required coverage, pairwise assessment ids, and unchanged evidence/v2, verification/v2, and K1 pins [REQ-kernel-contract-schemas-027]
- [x] 1.5 Implement canonical assessment validation and `computeAssessmentId` coverage sorting/deduplication in `scripts/lib/independent-verifier/assessment.js`; GREEN then REFACTOR the tests from 1.4 [REQ-independent-verification-006, REQ-kernel-contract-schemas-027]

## Phase 2: Verifier Semantics and Coverage

- [x] 2.1 Add RED tests to `scripts/lib/independent-verifier/*.test.js` proving contract C1/C2 mismatch fails before strategy and produces no PASS [REQ-independent-verification-008]
- [x] 2.2 Implement the canonical contract binding gate in `scripts/lib/independent-verifier/bindings.js` and ordered facade in `scripts/lib/independent-verifier/index.js`; GREEN and REFACTOR [REQ-independent-verification-008]
- [x] 2.3 Add RED tests for same EvidenceId across incompatible roles, GREEN-before-RED, RED-after-PATCH, and valid ordered distinct ids [REQ-independent-verification-006]
- [x] 2.4 Implement normalized role identity and temporal policy in `scripts/lib/independent-verifier/strategy-policy.js`, retaining rawEvidence order; GREEN and REFACTOR [REQ-independent-verification-006]
- [x] 2.5 Add RED tests for unknown obligations, non-implementing nodes, no evidence, and `[A,B]` with only A satisfied [REQ-independent-verification-005]
- [x] 2.6 Implement binding coverage normalization in `scripts/lib/independent-verifier/evidence.js` and token-subset MUST walk in `obligation-coverage.js`; persist coverage per assessment and GREEN/REFACTOR [REQ-independent-verification-005]
- [x] 2.7 Update the verifier facade tests to prove gate order (bindings → strategy → MUST walk), distinct tuple assessments, and unchanged `evidence/v2`/`verification/v2` payload shape [REQ-independent-verification-005, REQ-independent-verification-006, REQ-independent-verification-008]
- [x] 2.8 RED: extend `scripts/lib/independent-verifier/assessment.test.js` to vary `evidence_id` and `obligation_id` independently and assert distinct assessment identities for each tuple; GREEN/REFACTOR only if the focused runtime test exposes an implementation gap [REQ-independent-verification-006]

## Phase 3: Assurance Graph Integrity

- [x] 3.1 Add RED projector tests in `scripts/lib/assurance-graph/index.test.js` for contradictory Graph/contract/policy digests and null/absent required canonical digests [REQ-assurance-graph-007]
- [x] 3.2 Implement strict resolved canonical-input validation in `scripts/lib/assurance-graph/projector.js` before graph-id preimage construction; GREEN and REFACTOR [REQ-assurance-graph-007]
- [x] 3.3 Add RED replay cases for malformed/tampered assessment schema, assessment_id, candidate, policy, evidence reference, obligation, node, node_id and coverage [REQ-assurance-graph-006]
- [x] 3.4 Implement persistable assessment revalidation and token-level coverage checks in `scripts/lib/assurance-graph/index.js`, using shared `assessment.js` helpers; GREEN and REFACTOR [REQ-assurance-graph-006]
- [x] 3.5 Add RED reconcile cases for tampered nodes, canonical inputs, candidate_id, kind/schema, declared graph_id and stored payload identity [REQ-assurance-graph-008]
- [x] 3.6 Implement stored-payload graph-id recomputation and full payload comparison in `scripts/lib/assurance-graph/index.js`; GREEN and REFACTOR [REQ-assurance-graph-008]
- [x] 3.7 RED: extend `scripts/lib/assurance-graph/index.test.js` with persistent replay mutations for malformed assessment schema/coverage, candidate/policy mismatch, missing evidence, unknown obligation, non-implementing node, and `node_id` mismatch; GREEN/REFACTOR only if runtime tests expose an implementation gap [REQ-assurance-graph-006]
- [x] 3.8 RED: extend `scripts/lib/assurance-graph/index.test.js` with persistent reconcile mutations for stored `canonical_inputs`, `candidate_id`, and kind/schema divergence, asserting `GRAPH_DIVERGENCE`; GREEN/REFACTOR only if runtime tests expose an implementation gap [REQ-assurance-graph-008]

## Phase 4: Integration, Documentation and Verification

- [x] 4.1 Extend `scripts/k6b-verifier-assurance-graph-e2e.test.js` with a valid token-complete verify/project/replay/reconcile path, deterministic second projection, and stored mutation failures [REQ-independent-verification-005, REQ-independent-verification-006, REQ-assurance-graph-006, REQ-assurance-graph-008]
- [x] 4.2 Update `docs/architecture/harness-evolution.md` and `docs/roadmaps/harness-evolution.md` to mark K6b `revise` and K6c `blocked-by-K6b-remediation` until archive [REQ-assurance-graph-008]
- [x] 4.3 Run `npm test` and inspect the complete native test output; resolve only failures attributable to the scoped B1–B3/H1–H3 remediation, preserving frozen K1 and v2 bytes [REQ-independent-verification-005, REQ-independent-verification-006, REQ-independent-verification-008, REQ-assurance-graph-006, REQ-assurance-graph-007, REQ-assurance-graph-008, REQ-kernel-contract-schemas-027]
- [x] 4.4 Confirm no migration is attempted for legacy partial `assessment/v1` records and record regeneration/rollback behavior in apply progress [REQ-kernel-contract-schemas-027]

## Phase 5: Verify-Gap Runtime Evidence

- [x] 5.1 Run the focused verifier and Assurance Graph suites plus `npm test`; record the new runtime evidence and leave any implementation mismatch for the routed phase [REQ-independent-verification-006, REQ-assurance-graph-006, REQ-assurance-graph-008]
