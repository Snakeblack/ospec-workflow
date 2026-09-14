# Delta for lifecycle-kernel-runtime

## MODIFIED Requirements

### Requirement: PhaseCompletionReducer Pure State Reduction {#REQ-lifecycle-kernel-028}

The lifecycle kernel runtime MUST provide a pure `PhaseCompletionReducer` function that computes next change state (`state.yaml` and lifecycle state nodes) from current normalized state and a validated phase completion payload (`result-envelope/v1`). The reducer MUST be deterministic and pure: given identical current state and envelope payload, it MUST return identical projected state, ordered journal entries, and explicit effect intents. The reducer MUST NOT execute filesystem or clock I/O directly, and MUST NOT infer or fabricate uncommitted gate approvals, decisions, or phase advances.

When processing completion payloads for the `verify` phase, the reducer MUST condition advancing top-level `status` to `"verified"` exclusively on the explicit presence of a positive `verify_outcome` (`PASS` or `PASS WITH WARNINGS`). If `phase` is `"verify"` and `verify_outcome` is `"FAIL"`, absent, undefined, or unallowlisted, the reducer MUST NOT set `status: "verified"`; it MUST project top-level `status: "blocked"` and record the verification failure in `blocking_questions`, regardless of whether the outer envelope status is `"success"`.

(Previously: PhaseCompletionReducer defaulted the verify phase to status: verified whenever envelope status was success unless an explicit FAIL outcome was recognized, projecting verified even when verify_outcome was omitted.)

#### Scenario: Reducer computes valid phase advance from success envelope

- GIVEN a valid current change state in phase `design`
- AND a validated `result-envelope/v1` payload with `status: "success"`, summary, and artifacts
- WHEN `PhaseCompletionReducer` executes
- THEN it MUST project `phases.design.status: "done"`, `phases.design.summary`, and `phases.design.artifacts`
- AND MUST advance the lifecycle node without fabricating downstream phase completions

#### Scenario: Reducer projects blocked status with questions and blocker metadata

- GIVEN a current change state in phase `apply`
- AND a validated `result-envelope/v1` payload with `status: "blocked"`, `question_gate`, and `blocker_type`
- WHEN `PhaseCompletionReducer` executes
- THEN top-level state MUST become `status: "blocked"`
- AND `blocking_questions` MUST capture the gate questions without advancing phase status to `done`

#### Scenario: Reducer rejects synthetic gate passes and uncommitted approvals

- GIVEN an envelope payload asserting gate passage or user approvals not present in current state
- WHEN `PhaseCompletionReducer` evaluates the payload
- THEN it MUST reject the unverified approval assertion
- AND MUST NOT commit synthetic gate passes to projected state

#### Scenario: Reducer advances to verified only with positive explicit verify_outcome

- GIVEN a current change state in phase `verify`
- AND a validated envelope with `status: "success"` and `verify_outcome: "PASS"` or `"PASS WITH WARNINGS"`
- WHEN `PhaseCompletionReducer` executes
- THEN `phases.verify.status` MUST be `"done"`
- AND top-level state MUST become `status: "verified"`

#### Scenario: Reducer projects blocked when verify_outcome is FAIL or omitted

- GIVEN a current change state in phase `verify`
- AND an envelope with `status: "success"` where `verify_outcome` is `"FAIL"`, omitted, or invalid
- WHEN `PhaseCompletionReducer` executes
- THEN top-level state MUST become `status: "blocked"`
- AND `blocking_questions` MUST capture the verification failure reason
