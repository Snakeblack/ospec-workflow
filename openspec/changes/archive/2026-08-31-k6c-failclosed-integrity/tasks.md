# Tasks: K6c Fail-Closed Integrity

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
| --- | --- | --- | --- | --- |
| REQ-010 success / failed COMPLACENT / missing strategy minimums / missing-duplicate-foreign set | MUST | Existing `challenge-evidence.js` + `index.js`; thread `selectStrategy()` only | covered-by-design | Do not self-compare `plan.evidence_strategy`. |
| REQ-010 selected strategy mismatch (`feature` vs canonical `bug` plan) | MUST | `index.js` → `evaluateChallengeEvidence` → `assertEvidenceStrategyBinding`; `index.test.js` | covered-by-design | `CHALLENGE_INTEGRITY_INVALID`; no PASS. |
| REQ-002 undeclared/unknown verifier strategy still Strict TDD | MUST | Do not modify `strategy-policy.js`; pin in `index.test.js` | covered-by-design | Planner MUST NOT perform this fallback. |
| REQ-adversarial-challenges-002 proportional bug/refactor/migration; identical inputs; changed node/policy identity | MUST | Unchanged selection table + existing `planner.test.js` | covered-by-design | No catalog edits. |
| REQ-adversarial-challenges-002 unknown/omitted/empty planner strategy | MUST | `createChallengePlan` TypeError; `planner.test.js` | covered-by-design | ADR-001: `requires` vs `rejects unknown` messages. |
| REQ-004 focal pass, COMPLACENT, tautology, capability/timeout, foreign scope | MUST | Unchanged runner paths | covered-by-design | COMPLACENT only after real byte change. |
| REQ-004 missing tests | MUST | `runIsolatedMutation` + `runner.test.js` workspace without `*.test.js` | covered-by-design | `outcome: "error"`, `MISSING_TESTS`. |
| REQ-004 `mutations_tested===0` / no-op revert or mutation | MUST | Pre/post byte compare + empty `context.mutations`; `runner.test.js` | covered-by-design | `NO_MUTATION_APPLIED` / `CHALLENGE_NOOP`; never `passed`. |
| REQ-009 reproducible project/replay; duplicate/foreign; mandatory plan absent | MUST | Existing projector/replay; add `evidenceStrategy` to K6c input/persistable | covered-by-design | Replay uses `persistable.evidenceStrategy`. |
| REQ-009 wrong-strategy canonical plan | MUST | Gate with selected strategy; `GRAPH_DIVERGENCE`; no graph | covered-by-design | Same `feature`+`bug` pair as verifier. |
| REQ-029 valid/invalid plan/result, cross-family, cross-bound pair, manifest/claims | MUST | `k6c-schema-fixtures.test.js`; unique claims list | covered-by-design | Pass `evidenceStrategy` on set checks so pair rejection is not omitted-binding. |
| REQ-029 unique `required`; duplicate `required` fails metaschema; published schemas pass | MUST | Schema fix + `validateSchemaDocument` + K1 checker + validator/k6c tests | covered-by-design | Fixture schema must not live under `fixtures/invalid/`. ADR-004: no Ajv. |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
| --- | --- |
| Estimated changed lines | 600–800 (binding thread, runner no-evidence, metaschema walk, negatives) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Single PR under size-exception (delivery strategy already approved) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
| --- | --- | --- | --- |
| 1 | Integrity require-binding + verifier `selectStrategy()` thread + `feature`/`bug` adversarial + REQ-002 pin | Single PR | Tests/docs with code; `strategy-policy.js` untouched. |
| 2 | Projector + replay same binding (`GRAPH_DIVERGENCE`) | Same PR | After unit 1 gate; persistable carries verifier `strategy`. |
| 3 | Planner TypeError + runner `MISSING_TESTS` / `NO_MUTATION_APPLIED` / `CHALLENGE_NOOP` | Same PR | Independent of 1–2; ships together via size-exception. |
| 4 | Unique `required` + `validateSchemaDocument` uniqueItems + claims/k6c pins | Same PR | Uniqueness-only; K1/K6b schema bytes frozen. |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Integrity binding (RED → GREEN)

- [x] 1.1 RED: in `scripts/lib/adversarial-challenges/integrity.test.js`, assert `validateChallengeResultSet` without `bindings.evidenceStrategy` is `CHALLENGE_INTEGRITY_INVALID`; identity-only `validateChallengePlan(plan)` still ok; mismatch vs `plan.evidence_strategy` fails; binding must not equal a self-copied plan field in the test setup [REQ-independent-verification-010]
- [x] 1.2 GREEN: add `assertEvidenceStrategyBinding` in `scripts/lib/adversarial-challenges/integrity.js`; require non-empty equality on every result-set and on `validateChallengePlan` when any evaluation key is present; replace the truthy skip; update this file's success callers to pass a matching selected strategy [REQ-independent-verification-010]

## Phase 2: Verifier selected strategy (RED → GREEN)

- [x] 2.1 RED: in `scripts/lib/independent-verifier/index.test.js`, `declaredStrategy: "feature"` plus a canonical `bug` ChallengePlan with internally canonical passed results MUST yield `CHALLENGE_INTEGRITY_INVALID` and no PASS; matching `feature` plan still PASSes [REQ-independent-verification-010]
- [x] 2.2 GREEN: `evaluateChallengeEvidence` in `scripts/lib/independent-verifier/challenge-evidence.js` forwards `opts.evidenceStrategy` into the gate; `verifyCandidate` in `scripts/lib/independent-verifier/index.js` passes `selectStrategy(...)` (never `plan.evidence_strategy`) into eval and `projectAssuranceGraph` [REQ-independent-verification-010]
- [x] 2.3 Pin: keep `scripts/lib/independent-verifier/strategy-policy.js` unmodified; extend `index.test.js` so `selectStrategy(undefined)` and `selectStrategy("not-a-strategy")` still return `strict-tdd` [REQ-independent-verification-002]

## Phase 3: Assurance graph binding (RED → GREEN)

- [x] 3.1 RED: in `scripts/lib/assurance-graph/index.test.js`, project and replay with Candidate strategy `feature` and a canonical `bug` plan MUST be `GRAPH_DIVERGENCE` and emit no graph; replay bundle uses `verified.strategy`, not `plan.evidence_strategy` [REQ-assurance-graph-009]
- [x] 3.2 GREEN: `scripts/lib/assurance-graph/projector.js` passes `input.evidenceStrategy`; `index.js` replay uses `persistable.evidenceStrategy` on the gate and when calling `projectAssuranceGraph`; map integrity failures to `GRAPH_DIVERGENCE` [REQ-assurance-graph-009]

## Phase 4: Planner reject (RED → GREEN)

- [x] 4.1 RED: in `scripts/lib/adversarial-challenges/planner.test.js`, omitted, empty/non-string, and `"not-a-strategy"` throw `TypeError` and emit no plan; `"not-a-strategy"` MUST NOT produce `evidence_strategy: "strict-tdd"`; valid `strict-tdd` still emits [REQ-adversarial-challenges-002]
- [x] 4.2 GREEN: `createChallengePlan` in `scripts/lib/adversarial-challenges/planner.js` throws TypeError (`requires` vs `rejects unknown` per ADR-001); remove `strict-tdd` coercion; do not add a `{ok, reason_code}` envelope [REQ-adversarial-challenges-002]

## Phase 5: Runner no-evidence fail-closed (RED → GREEN)

- [x] 5.1 RED: in `scripts/lib/adversarial-challenges/runner.test.js`, (a) revert/focal workspace with no `*.test.js` → `outcome: "error"`, `details.reason: "MISSING_TESTS"`; (b) `focal-mutation` with empty `context.mutations` → `NO_MUTATION_APPLIED`; (c) revert/focal apply that leaves isolated bytes unchanged → `CHALLENGE_NOOP`; none emit `passed` or `COMPLACENT_TEST_DETECTED` [REQ-adversarial-challenges-004]
- [x] 5.2 GREEN: in `scripts/lib/adversarial-challenges/runner.js` `runIsolatedMutation`, handle `failure_class === "missing_tests"` before the pass/fail branch; snapshot bytes before `revertSourcePatch`/`applyFocalMutation`; count `mutations_tested` only for byte-changing applies; emit `outcome: "error"` with the three reasons; keep COMPLACENT only after a real byte change [REQ-adversarial-challenges-004]

## Phase 6: Unique required + metaschema (RED → GREEN)

- [x] 6.1 RED: in `scripts/lib/kernel-schema-validator.test.js` and `scripts/lib/k6c-schema-fixtures.test.js`, assert `challenge-result` `required` lists each name once; inline fixture schema (not under `schemas/kernel/**/fixtures/invalid/`) with Draft 2020-12 `$schema` and duplicate `required` fails `validateSchemaDocument`; published kernel schemas pass; unique `contract-claims` `challenge-result.required_fields` [REQ-kernel-contract-schemas-029]
- [x] 6.2 GREEN: unique `node_id` in `schemas/kernel/challenge-result/v1.schema.json` and `schemas/kernel/contract-claims.json`; add `validateSchemaDocument` (recursive `uniqueItems` on every `required`) in `scripts/lib/kernel-schema-validator.js`; invoke from `scripts/lib/contract-checkers/k1-schema-compat.js`; uniqueness-only if another family fails the walk; keep K1/K6b/`K1_SCHEMA_BASELINE` byte-identical; pass `evidenceStrategy` on the cross-bound `validateChallengeResultSet` call so it still proves pair rejection [REQ-kernel-contract-schemas-029]

## Phase 7: Cleanup / regression

- [x] 7.1 REFACTOR: no leftover truthy skip; no edits to catalog, selection tables, or `strategy-policy.js`; K6d remains blocked [REQ-independent-verification-002, REQ-independent-verification-010]
- [x] 7.2 Run focal suites then `npm test`; confirm existing planner proportional/determinism tests and runner COMPLACENT/tautology/capability/timeout/scope tests still pass [REQ-adversarial-challenges-002, REQ-adversarial-challenges-004, REQ-assurance-graph-009, REQ-kernel-contract-schemas-029]
