# Delta for agents

## ADDED Requirements

### Requirement: Elimination of Model Inferred State Transitions and Approvals {#REQ-agents-029}

The orchestrator MUST NOT derive, infer, or advance change lifecycle state, gate approvals, assumption ledgers, or phase progression through LLM prompting or internal model reasoning. All change state updates MUST be produced mechanically by delegating validated phase completion payloads to the runtime-owned `PhaseCompletionReducer`. When a phase envelope contains claims of user approvals, gate completions, or route alterations, the orchestrator MUST verify authoritative records in `state.yaml` and reject any uncommitted or self-asserted transitions fail-closed.

#### Scenario: Model self-attesting approval is rejected

- GIVEN a subagent return payload asserting an approval or gate pass without a corresponding authoritative record in `state.yaml`
- WHEN the orchestrator processes the return
- THEN it MUST NOT record the approval in `state.yaml`
- AND MUST treat the assertion as non-authoritative

#### Scenario: State advancement strictly follows PhaseCompletionReducer output

- GIVEN a subagent completion envelope
- WHEN the orchestrator executes state advancement
- THEN it MUST invoke `PhaseCompletionReducer` to compute the next change state
- AND MUST NOT apply ad-hoc regex or string replacements to `state.yaml`

#### Scenario: Uncommitted gate verdict halts progression

- GIVEN a phase return indicating completion of a gate that requires human or verifier authorization
- WHEN no valid gate decision is recorded in `state.yaml`
- THEN the orchestrator MUST halt the route
- AND MUST NOT assume or fabricate gate passage

## MODIFIED Requirements

### 6.1a Orchestrator Consumes Structured Envelope Fields

The orchestrator's Result Contract MUST extract phase-return field values from the sub-agent's versioned `result-envelope/v1` payload (or `json:result-envelope` fenced block normalized via the legacy envelope adapter) as the primary, authoritative source — `status`, `executive_summary`, `artifacts`, `next_recommended`, `risks`, `skill_resolution`, `key_decisions`, and any optional phase-specific fields. Upon validating the envelope, the orchestrator MUST delegate state updates to the runtime `PhaseCompletionReducer` rather than mutating `state.yaml` via ad-hoc file writes or inferring state transitions through LLM reasoning.

When the envelope is unversioned or legacy format, the orchestrator MUST route the payload through the legacy envelope adapter before reducer delegation. When the envelope is absent, malformed, or fails schema validation, the orchestrator MUST degrade to legacy adapter parsing without blocking dispatch, EXCEPT when an otherwise successful `sdd-spec` result lacks or maltypes any field from `REQ-skills-003`. That exception MUST halt orchestration for `sdd-spec` contract remediation before clarify or design. It MUST NOT fall back to clarify.
(Previously: the orchestrator parsed fenced fields directly but performed ad-hoc state modifications without delegating to a runtime PhaseCompletionReducer.)

#### Scenario: Versioned envelope delegates state projection to PhaseCompletionReducer

- GIVEN a phase agent's return includes a valid `result-envelope/v1` payload
- WHEN the orchestrator processes the return
- THEN it extracts `status`, `artifacts`, `next_recommended`, and other fields directly from the parsed JSON object
- AND delegates state advancement to `PhaseCompletionReducer` without LLM transition inference

#### Scenario: Fence absent or legacy format — adapter normalization before reducer

- GIVEN a non-`sdd-spec` phase return has an unversioned fence, prose-adjacent format, or schema anomaly
- WHEN the orchestrator processes the return
- THEN it normalizes the payload through the legacy envelope adapter into canonical `result-envelope/v1`
- AND delegates the normalized payload to `PhaseCompletionReducer` without failing dispatch solely due to legacy format

#### Scenario: Invalid successful sdd-spec signals override fallback

- GIVEN a successful `sdd-spec` result has missing or malformed ambiguity signals in its structured or prose envelope
- WHEN the orchestrator processes the result
- THEN it MUST halt for contract remediation
- AND it MUST NOT dispatch clarify or design through the generic fallback path
