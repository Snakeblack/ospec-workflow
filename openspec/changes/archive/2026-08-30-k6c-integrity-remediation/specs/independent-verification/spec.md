# Delta for Independent Verification

## MODIFIED Requirements

### Requirement: Challenge Evidence Consumption And Fail-Closed Integration {#REQ-independent-verification-010}

The verifier MAY consume schema-valid `challenge-result/v1` and `challenge-plan/v1` records bound to the frozen CandidateId as complementary verification evidence. When policy or strategy mandates challenge verification, exactly one canonical ChallengePlan MUST be present; its identity, schema, Candidate, node, strategy, and PolicySnapshot bindings MUST be recomputed before any result is considered.

When challenge verification is mandatory:
1. The verifier MUST require exactly one result for every `selected` challenge and no result for a skipped, duplicate, unknown, or foreign challenge.
2. Every result MUST match the canonical plan's `plan_id`, Candidate, node, strategy, and PolicySnapshot and have a recomputed valid identity.
3. Any absent plan, missing or duplicate result, foreign result, schema/hash failure, failed/error outcome, or budget exhaustion MUST fail closed with `CHALLENGE_INTEGRITY_INVALID`, `CHALLENGE_VERIFICATION_FAILED`, or `CHALLENGE_BUDGET_EXHAUSTED` and MUST NOT emit `PASS` or `PASS WITH WARNINGS`.

Challenge results MUST remain complementary evidence only. They MUST NOT substitute for declared strategy minimums, bypass MUST-walk obligation coverage, grant delivery or lifecycle authorization, or allow K6d to begin. K6d MUST remain blocked until terminal verification has accepted the complete canonical challenge set.

(Previously: verification accepted bound plan/results but did not require mandatory-plan presence, exact cardinality, canonical result bindings, or the K6d terminal gate.)

#### Scenario: Successful challenge results satisfy complementary verification

- GIVEN a frozen Candidate with strategy minimums and MUST obligations satisfied
- AND one canonical required plan with one passed bound result for every selected challenge
- WHEN the verifier evaluates candidate evidence
- THEN it MAY emit `PASS` or `PASS WITH WARNINGS`

#### Scenario: Failed challenge result fails verification closed

- GIVEN a canonical plan with a result failed due to `COMPLACENT_TEST_DETECTED`
- WHEN the verifier evaluates candidate evidence
- THEN verification MUST fail closed with `CHALLENGE_VERIFICATION_FAILED`
- AND MUST NOT emit an approving verdict

#### Scenario: Challenge results alone cannot grant PASS without strategy minimums

- GIVEN all selected challenge results are passed
- AND strategy minimum evidence or MUST obligations are missing
- WHEN the verifier evaluates candidate evidence
- THEN verification MUST fail closed
- AND challenge results MUST NOT override missing strategy evidence

#### Scenario: Missing, duplicate, or foreign plan result is rejected

- GIVEN mandatory challenge verification with no plan, duplicate results, or a result bound to another Candidate, node, strategy, or PolicySnapshot
- WHEN the verifier evaluates the set
- THEN it MUST fail closed with `CHALLENGE_INTEGRITY_INVALID`
- AND K6d MUST remain blocked
