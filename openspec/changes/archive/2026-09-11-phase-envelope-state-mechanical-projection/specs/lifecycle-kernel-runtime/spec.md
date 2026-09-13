# Delta for lifecycle-kernel-runtime

## ADDED Requirements

### Requirement: PhaseCompletionReducer Pure State Reduction {#REQ-lifecycle-kernel-028}

The lifecycle kernel runtime MUST provide a pure `PhaseCompletionReducer` function that computes next change state (`state.yaml` and lifecycle state nodes) from current normalized state and a validated phase completion payload (`result-envelope/v1`). The reducer MUST be deterministic and pure: given identical current state and envelope payload, it MUST return identical projected state, ordered journal entries, and explicit effect intents. The reducer MUST NOT execute filesystem or clock I/O directly, and MUST NOT infer or fabricate uncommitted gate approvals, decisions, or phase advances.

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

### Requirement: CAS and Replay Determinism for Phase State Projection {#REQ-lifecycle-kernel-029}

State projections produced by `PhaseCompletionReducer` and committed to durable storage MUST enforce Compare-And-Swap (CAS) revision matching under advisory file locking (`withFileLock`). Replaying an identical phase completion payload against an already projected state MUST be idempotent: the kernel runtime MUST detect the replay through payload hashing or journal matching and return the converged state without advancing revision counters or duplicating journal records.

#### Scenario: Concurrent projection conflict triggers CAS conflict rejection

- GIVEN a projection commit attempt with expected revision R
- WHEN storage head revision has advanced to R+1 due to a concurrent write
- THEN the commit MUST fail closed with a CAS conflict
- AND authoritative state MUST remain unchanged

#### Scenario: Replaying identical phase completion payload produces zero-delta idempotent convergence

- GIVEN a change state that already committed completion payload P
- WHEN the runtime reconciles or replays payload P
- THEN the runtime MUST recognize the completed operation
- AND MUST NOT re-execute state mutations or append duplicate journal records

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
