# Tasks: k6c-policy-selected-challenges

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-kernel-contract-schemas-001: Every required family has $id and version | MUST | `schemas/kernel/manifest.json`, `schemas/kernel/contract-claims.json`, `scripts/lib/k6c-schema-fixtures.test.js` | covered-by-design | Extiende el inventario con `challenge-plan` y `challenge-result` versión 1 |
| REQ-kernel-contract-schemas-001: Consumer can pin a schema version | MUST | `schemas/kernel/manifest.json`, `scripts/lib/kernel-schema-validator.js` | covered-by-design | Pinned via `$id` canonical resolution |
| REQ-kernel-contract-schemas-001: K1/K2/K3/K4/K5/K6a/K6b families preserved byte-identical | MUST | `scripts/lib/k6c-schema-fixtures.test.js` | covered-by-design | `K1_SCHEMA_BASELINE` y esquemas K6b permanecen inmutables |
| REQ-kernel-contract-schemas-001: Challenge-plan and challenge-result families in required set | MUST | `schemas/kernel/manifest.json`, `schemas/kernel/contract-claims.json` | covered-by-design | Registradas ambas familias como schema_version 1 |
| REQ-kernel-contract-schemas-029: Valid challenge-plan v1 payload passes validation | MUST | `schemas/kernel/challenge-plan/v1.schema.json`, `fixtures/valid/basic-plan.json` | covered-by-design | Valida campos requeridos: `plan_id`, `candidate_id`, `policy_snapshot_id`, `selected`, `skipped`, `budget` |
| REQ-kernel-contract-schemas-029: Challenge-plan missing required fields or unknown type fails closed | MUST | `schemas/kernel/challenge-plan/fixtures/invalid/missing-budget.json`, `invalid/unknown-type.json` | covered-by-design | Schema rechaza campos faltantes y enum no reconocido |
| REQ-kernel-contract-schemas-029: Valid challenge-result v1 payload passes validation | MUST | `schemas/kernel/challenge-result/v1.schema.json`, `fixtures/valid/passed-result.json`, `fixtures/valid/failed-result.json` | covered-by-design | Valida `result_id`, `plan_id`, `candidate_id`, `challenge_type`, `outcome`, `details` |
| REQ-kernel-contract-schemas-029: Challenge-result with invalid outcome fails closed | MUST | `schemas/kernel/challenge-result/fixtures/invalid/invalid-outcome.json` | covered-by-design | Enum estricto `passed \| failed \| error` |
| REQ-kernel-contract-schemas-029: Cross-family substitution fails closed | MUST | `scripts/lib/k6c-schema-fixtures.test.js` | covered-by-design | Fails closed si se valida como `evidence/v2` o `verification/v2` |
| REQ-kernel-contract-schemas-029: Manifest and contract-claims register challenge families | MUST | `schemas/kernel/manifest.json`, `schemas/kernel/contract-claims.json` | covered-by-design | Mapeo canónico a `$id` y propiedades requeridas |
| REQ-adversarial-challenges-001: Known challenge types validate successfully | MUST | `scripts/lib/adversarial-challenges/catalog.js` | covered-by-design | Catálogo cerrado de 9 tipos tipados con objetivos |
| REQ-adversarial-challenges-001: Unsupported challenge type fails closed | MUST | `scripts/lib/adversarial-challenges/catalog.js`, `catalog.test.js` | covered-by-design | `validateChallengeType` retorna `UNSUPPORTED_CHALLENGE_TYPE` |
| REQ-adversarial-challenges-001: Challenge execution does not mutate frozen candidate | MUST | `scripts/lib/adversarial-challenges/mutator.js`, `runner.js` | covered-by-design | Operaciones aisladas en copias de workspace efímeras |
| REQ-adversarial-challenges-002: Proportional plan generated for bugfix strategy | MUST | `scripts/lib/adversarial-challenges/planner.js` (`STRATEGY_CHALLENGE_SELECTION.bug`) | covered-by-design | Selecciona `revert`, `regression-acceptance` y omite el resto con razones explícitas |
| REQ-adversarial-challenges-002: Proportional plan generated for refactor strategy | MUST | `scripts/lib/adversarial-challenges/planner.js` (`STRATEGY_CHALLENGE_SELECTION.refactor`) | covered-by-design | Selecciona `behavior-equivalence`, `focal-mutation` |
| REQ-adversarial-challenges-002: Proportional plan generated for migration strategy | MUST | `scripts/lib/adversarial-challenges/planner.js` (`STRATEGY_CHALLENGE_SELECTION.migration`) | covered-by-design | Selecciona `rollback`, `compatibility-acceptance` |
| REQ-adversarial-challenges-002: Identical inputs yield deterministic ChallengePlan | MUST | `scripts/lib/adversarial-challenges/planner.js` (`createChallengePlan`) | covered-by-design | Hash determinista SHA-256 sobre payload canónico |
| REQ-adversarial-challenges-003: Monotonic budget consumption during challenge execution | MUST | `scripts/lib/adversarial-challenges/budget.js` (`createChallengeBudgetTracker`) | covered-by-design | Decrementos atómicos de cuotas de challenges, mutaciones y tiempo |
| REQ-adversarial-challenges-003: Budget exhaustion triggers causal failure transition | MUST | `scripts/lib/adversarial-challenges/budget.js`, `runner.js` | covered-by-design | Emite `causal-failure/v1` con `CHALLENGE_BUDGET_EXHAUSTED` y categoría `validation_gap` |
| REQ-adversarial-challenges-004: Focal mutation detects seeded defect and challenge passes | MUST | `scripts/lib/adversarial-challenges/mutator.js`, `runner.js` | covered-by-design | Mutación de operadores en líneas diff; test fallido confirma detección |
| REQ-adversarial-challenges-004: Complacent test suite passes on seeded defect and challenge fails | MUST | `scripts/lib/adversarial-challenges/runner.js` | covered-by-design | Emite `outcome: "failed"` con razón `COMPLACENT_TEST_DETECTED` |
| REQ-adversarial-challenges-004: Test inspection detects tautological assertion | MUST | `scripts/lib/adversarial-challenges/runner.js` | covered-by-design | Emite `outcome: "failed"` con razón `TAUTOLOGICAL_TEST_DETECTED` |
| REQ-independent-verification-010: Successful challenge results satisfy complementary verification | MUST | `scripts/lib/independent-verifier/index.js` (`verifyCandidate`) | covered-by-design | Consume `challengePlan` y `challengeResults`, acepta si todos `passed` |
| REQ-independent-verification-010: Failed challenge result fails verification closed | MUST | `scripts/lib/independent-verifier/index.js` | covered-by-design | Retorna `CHALLENGE_VERIFICATION_FAILED` o `CHALLENGE_BUDGET_EXHAUSTED` |
| REQ-independent-verification-010: Challenge results alone cannot grant PASS without strategy minimums | MUST | `scripts/lib/independent-verifier/index.js` | covered-by-design | Verificación de estrategia y MUST obligations precede a challenge results |
| REQ-harness-authority-canon-011: K6c challenge and projection surfaces tagged implemented | MUST | `scripts/lib/roadmap-boundary.test.js` | covered-by-design | K6c etiquetado como implemented sin invadir K7/K8 |
| REQ-harness-authority-canon-011: Graph authority, review authority, and later slices stay non-implemented | MUST | `scripts/lib/roadmap-boundary.test.js` | covered-by-design | K7 review y K8 attestation permanecen target/experimental |
| REQ-harness-authority-canon-012: Challenge outputs consumed as complementary evidence only | MUST | `scripts/lib/adversarial-challenges/index.js`, `scripts/lib/independent-verifier/index.js` | covered-by-design | No concede autoridad de entrega autónoma |
| REQ-harness-authority-canon-012: Attempt to grant delivery authority from challenge results fails closed | MUST | `scripts/lib/adversarial-challenges/index.js` (`rejectDeliveryAuthorityMisuse`) | covered-by-design | Rechazo fail-closed con `CHALLENGE_AUTHORITY_MISUSE` |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~650 lines (incl. schemas, fixtures, modules & unit/integration tests) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR (size-exception approved) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Kernel contract schemas, fixtures, catalog, planner, budget tracker, runner, independent verifier integration and boundary tests | PR 1 | Base branch main; monolithic deliverable under maintainer approved size-exception |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Kernel Contract Schemas and Canonical Fixtures

- [x] 1.1 RED: Write tests for `challenge-plan/v1` and `challenge-result/v1` schemas and canonical fixtures in `scripts/lib/k6c-schema-fixtures.test.js` validating schema pinning, valid/invalid fixture checks, cross-family rejection, and byte-identity of K1/K6b schemas [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-029]
- [x] 1.2 GREEN: Create `schemas/kernel/challenge-plan/v1.schema.json` with required properties (`schema_version`, `kind`, `plan_id`, `candidate_id`, `policy_snapshot_id`, `evidence_strategy`, `selected`, `skipped`, `reasons`, `budget`) and `additionalProperties: false` [REQ-kernel-contract-schemas-029]
- [x] 1.3 GREEN: Create canonical fixtures for `challenge-plan/v1`: `schemas/kernel/challenge-plan/fixtures/valid/basic-plan.json`, `schemas/kernel/challenge-plan/fixtures/invalid/missing-budget.json`, and `schemas/kernel/challenge-plan/fixtures/invalid/unknown-type.json` [REQ-kernel-contract-schemas-029]
- [x] 1.4 GREEN: Create `schemas/kernel/challenge-result/v1.schema.json` with required properties (`schema_version`, `kind`, `result_id`, `plan_id`, `candidate_id`, `challenge_type`, `outcome`, `node_id`, `evidence_ids`, `details`) and `additionalProperties: false` [REQ-kernel-contract-schemas-029]
- [x] 1.5 GREEN: Create canonical fixtures for `challenge-result/v1`: `schemas/kernel/challenge-result/fixtures/valid/passed-result.json`, `schemas/kernel/challenge-result/fixtures/valid/failed-result.json`, and `schemas/kernel/challenge-result/fixtures/invalid/invalid-outcome.json` [REQ-kernel-contract-schemas-029]
- [x] 1.6 GREEN: Register `challenge-plan` and `challenge-result` families in `schemas/kernel/manifest.json` and `schemas/kernel/contract-claims.json` [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-029]
- [x] 1.7 REFACTOR: Verify `k6c-schema-fixtures.test.js` passes cleanly and verify zero drift on `K1_SCHEMA_BASELINE` and K6b schema baseline pins [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-029]

## Phase 2: Challenge Catalog and Deterministic Planner

- [x] 2.1 RED: Write unit tests in `scripts/lib/adversarial-challenges/catalog.test.js` for the 9 supported challenge types, objectives mapping, and fail-closed validation of unsupported types [REQ-adversarial-challenges-001]
- [x] 2.2 GREEN: Implement closed challenge catalog, objectives mapping, and `validateChallengeType` in `scripts/lib/adversarial-challenges/catalog.js` [REQ-adversarial-challenges-001]
- [x] 2.3 RED: Write unit tests in `scripts/lib/adversarial-challenges/planner.test.js` for proportional strategy selection matrix (`bug`, `refactor`, `migration`, `config-docs`, `feature`, `strict-tdd`), deterministic `plan_id` SHA-256 fingerprinting, and explicit reason codes for all skipped challenges [REQ-adversarial-challenges-002]
- [x] 2.4 GREEN: Implement deterministic `createChallengePlan` generator in `scripts/lib/adversarial-challenges/planner.js` binding `CandidateId`, `PolicySnapshot`, and evidence strategy [REQ-adversarial-challenges-002]
- [x] 2.5 REFACTOR: Consolidate catalog and planner helper utilities and verify test coverage on deterministic generation [REQ-adversarial-challenges-001, REQ-adversarial-challenges-002]

## Phase 3: Challenge Budget and Causal Failure Control

- [x] 3.1 RED: Write unit tests in `scripts/lib/adversarial-challenges/budget.test.js` for monotonic consumption of challenge, mutation, and time quotas, dimension tracking, and typed causal failure transition [REQ-adversarial-challenges-003]
- [x] 3.2 GREEN: Implement `createChallengeBudgetTracker` in `scripts/lib/adversarial-challenges/budget.js` with monotonic decrements and `CHALLENGE_BUDGET_EXHAUSTED` causal failure builder [REQ-adversarial-challenges-003]
- [x] 3.3 REFACTOR: Refactor budget tracker methods, ensuring boundary protection against negative or zero limits [REQ-adversarial-challenges-003]

## Phase 4: Focal Mutation Injector and Challenge Runner

- [x] 4.1 RED: Write unit tests in `scripts/lib/adversarial-challenges/mutator.test.js` for AST/operator mutations on diff lines and candidate patch revert operations in isolated workspace copies [REQ-adversarial-challenges-004]
- [x] 4.2 GREEN: Implement `mutator.js` in `scripts/lib/adversarial-challenges/mutator.js` with focal operator mutations (arithmetic, equality, boolean) and candidate patch reversal [REQ-adversarial-challenges-004]
- [x] 4.3 RED: Write unit tests in `scripts/lib/adversarial-challenges/runner.test.js` for `executeChallengePlan`, seeded defect detection, and fail-closed outcomes with `COMPLACENT_TEST_DETECTED` and `TAUTOLOGICAL_TEST_DETECTED` reason codes [REQ-adversarial-challenges-004]
- [x] 4.4 GREEN: Implement `executeChallengePlan` and `emitChallengeResult` in `scripts/lib/adversarial-challenges/runner.js` with isolated execution and budget exhaustion handling [REQ-adversarial-challenges-004]
- [x] 4.5 RED: Write integration tests in `scripts/lib/adversarial-challenges/index.test.js` covering public subsystem API and rejection of delivery authority misuse [REQ-adversarial-challenges-004, REQ-harness-authority-canon-012]
- [x] 4.6 GREEN: Implement subsystem entry point `scripts/lib/adversarial-challenges/index.js` exporting catalog, planner, budget, runner, and `rejectDeliveryAuthorityMisuse` guard [REQ-adversarial-challenges-004, REQ-harness-authority-canon-012]
- [x] 4.7 REFACTOR: Polish runner error handling, budget integration, and result emission [REQ-adversarial-challenges-004]

## Phase 5: Independent Verifier Integration and Authority Boundary

- [x] 5.1 RED: Write unit/integration tests in `scripts/lib/independent-verifier/index.test.js` for consuming `challenge-result/v1` as complementary evidence, failing closed on failed challenges or budget exhaustion, and enforcing strategy minimums [REQ-independent-verification-010, REQ-harness-authority-canon-012]
- [x] 5.2 GREEN: Update `verifyCandidate` in `scripts/lib/independent-verifier/index.js` to evaluate optional `challengePlan` and `challengeResults` inputs without granting delivery authority [REQ-independent-verification-010, REQ-harness-authority-canon-012]
- [x] 5.3 RED: Write tests in `scripts/lib/roadmap-boundary.test.js` verifying K6c maturity tagging as `implemented` while keeping K7/K8 un-implemented and asserting zero delivery authority from challenges [REQ-harness-authority-canon-011, REQ-harness-authority-canon-012]
- [x] 5.4 GREEN: Update `scripts/lib/roadmap-boundary.test.js` to assert K6c challenge integration and authority boundary rules [REQ-harness-authority-canon-011, REQ-harness-authority-canon-012]
- [x] 5.5 REFACTOR: Run full test suite across all new and modified components, verifying test suite cleanliness and zero regression [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-029, REQ-adversarial-challenges-001, REQ-adversarial-challenges-002, REQ-adversarial-challenges-003, REQ-adversarial-challenges-004, REQ-independent-verification-010, REQ-harness-authority-canon-011, REQ-harness-authority-canon-012]
