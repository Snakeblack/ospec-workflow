# lifecycle-kernel-runtime Specification

## Purpose

Specify the phase completion reducer (`scripts/lib/lifecycle-kernel/phase-completion-reducer.js`),
the pure projection of phase results into `state.yaml` that `ospec-state` uses.
The K2 lifecycle runtime this domain also described (status derivation,
transitions, permits, budgets and recovery) was retired in E1.5 (v2.97.0).

## Requirements

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
### Requirement: CAS and Replay Determinism for Phase State Projection {#REQ-lifecycle-kernel-029}

State projections produced by `PhaseCompletionReducer` and committed to durable storage MUST enforce Compare-And-Swap (CAS) revision matching under advisory file locking (`withFileLock`). Replaying an identical phase completion payload against an already projected state MUST be idempotent: the kernel runtime MUST detect the replay through payload hashing or journal matching and return the converged state without advancing revision counters or duplicating journal records.

When a durable state record stores a payload hash produced by the v2.67.0–v2.67.3 frozen-key-order serialization of an already committed completion payload, the runtime MUST treat a replay of that same payload as a zero-delta idempotent convergence in both Node and Go only when the envelope's key order matches the frozen contract: `schema_version` first on the top-level envelope, with nested `question_gate` / question / option key orders already pinned by that contract. Recognition of that historical hash form MUST NOT bump `revision`, MUST NOT re-apply state mutations, and MUST NOT append duplicate journal records. The runtime MUST also continue to recognize the current canonical payload hash as an identical zero-delta replay.

A payload that is semantically equal to a prior completion but whose insertion/key order differs from the frozen v2.67.0–v2.67.3 contract MUST NOT be promised as a legacy noop solely by that semantic equality; its hash MUST NOT match the frozen legacy digest unless the frozen order is used. The runtime MUST NOT require preserving original JSON bytes of historical envelopes. A payload whose stored hash matches neither the current canonical form nor the frozen v2.67.0–v2.67.3 key-order form MUST NOT be treated as that prior completion's replay solely on hash equality.

(Previously: Accepted any v2.67.0–v2.67.3 insertion-order `JSON.stringify` hash as a zero-delta noop without limiting the promise to the frozen key order, so a semantically equal envelope with a different insertion order could be treated as compatibility.)

#### Scenario: Concurrent projection conflict triggers CAS conflict rejection

- GIVEN a projection commit attempt with expected revision R
- WHEN storage head revision has advanced to R+1 due to a concurrent write
- THEN the commit MUST fail closed with a CAS conflict
- AND authoritative state MUST remain unchanged

#### Scenario: Replaying identical phase completion payload produces zero-delta idempotent convergence

- GIVEN a change state that already committed completion payload P under the current canonical hash
- WHEN the runtime reconciles or replays payload P
- THEN the runtime MUST recognize the completed operation
- AND MUST NOT re-execute state mutations or append duplicate journal records
- AND MUST NOT advance `revision`

#### Scenario: v2.67 frozen-key-order hash replay is a zero-delta noop in Node and Go

- GIVEN durable state that already committed completion payload P with a stored hash from the v2.67.0–v2.67.3 frozen-key-order form (`schema_version` first; nested `question_gate`/question/option orders pinned)
- WHEN the Node runtime and the Go runtime each reconcile or replay the same payload P in that frozen key order
- THEN both runtimes MUST recognize the completed operation as a zero-delta replay
- AND MUST NOT bump `revision`, re-apply mutations, or append duplicate journal records

#### Scenario: Semantically equal envelope with different key order is not a promised legacy noop

- GIVEN durable state that records the frozen v2.67.0–v2.67.3 key-order hash for payload P
- AND a semantically equal envelope P′ whose top-level or nested key insertion order differs from that frozen contract
- WHEN the runtime evaluates P′ for legacy noop recognition
- THEN it MUST NOT treat P′ as a promised v2.67 legacy zero-delta replay solely because it is semantically equal to P
- AND MUST NOT require that original historical JSON bytes of P be preserved

#### Scenario: Unrelated payload hash is not treated as prior completion replay

- GIVEN durable state that records a completion hash for payload P
- AND a distinct completion payload Q whose hash matches neither the current canonical hash of P nor the frozen v2.67.0–v2.67.3 key-order hash of P
- WHEN the runtime evaluates Q against that stored record
- THEN it MUST NOT treat Q as an idempotent replay of P solely by hash equality

#### Scenario: Recovery from interrupted write restores valid state without corruption

- GIVEN an interrupted write during state projection
- WHEN the runtime initializes or re-executes projection
- THEN it MUST recover from backup (`.bak`) or journal state safely
- AND MUST restore a consistent, non-corrupted state

### Requirement: Legacy Envelope Adapter and Normalization {#REQ-lifecycle-kernel-030}

The lifecycle kernel runtime MUST provide a legacy envelope adapter that normalizes unversioned fenced `json:result-envelope` blocks and legacy prose-adjacent envelopes into canonical `result-envelope/v1` payloads before invocation of `PhaseCompletionReducer`. The adapter MUST map legacy fields (`executive_summary`, `summary`, `key_decisions`, `status`, `next_recommended`) accurately, assign `schema_version: 1`, and fail-safely reject unparseable payloads without corrupting kernel state.

#### Scenario: Adapter normalizes unversioned fenced envelope to v1 payload

- GIVEN a subagent return containing an unversioned `json:result-envelope` fence
- WHEN the legacy envelope adapter processes the input
- THEN it MUST extract field values and produce a valid `result-envelope/v1` structure
- AND assign `schema_version: 1`

#### Scenario: Adapter normalizes legacy prose-adjacent envelope

- GIVEN a phase return lacking a JSON fence but carrying standard plain-prose envelope lines
- WHEN the adapter processes the return
- THEN it MUST extract status, summary, and artifacts into canonical `result-envelope/v1` format
- AND pass the normalized payload to `PhaseCompletionReducer`

#### Scenario: Malformed legacy payload is rejected fail-safely

- GIVEN an unparseable or completely missing envelope payload
- WHEN the adapter attempts normalization
- THEN it MUST return a structured validation error without throwing
- AND the kernel MUST NOT mutate authoritative state
