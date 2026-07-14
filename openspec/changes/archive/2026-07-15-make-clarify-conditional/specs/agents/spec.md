# Delta for Agents

## ADDED Requirements

### Requirement: Signal-Driven Clarify Gate Dispatch {#REQ-agents-011}

After a successful `sdd-spec` return, the orchestrator MUST evaluate the four
ambiguity signals defined by `REQ-skills-003`. It MUST mark the clarify gate
`skipped` and dispatch `sdd-design` when `residual_ambiguity` is `false` and all
three arrays are empty. It MUST run the existing clarify handler when the boolean
is `true` or any array is non-empty, independent of route or classification.

`sdd-clarify` MUST remain a gate between spec and design, MUST NOT be added to a
route's phase list, and MUST NOT be passed through `validate-phase.js`. Existing
clarify success, blocked-question, user-skip, and state-bookkeeping behavior MUST
remain unchanged once the handler runs. Generated targets MUST preserve this
predicate and behavior.

If any ambiguity signal is missing or malformed on an otherwise successful
`sdd-spec` return, the orchestrator MUST halt before dispatching either
`sdd-clarify` or `sdd-design`. It MUST record the change as blocked for
`sdd-spec` contract remediation and MUST NOT treat `clarify` as a fallback.

#### Scenario: Standard change skips clarify

- GIVEN a standard-route `sdd-spec` return has `residual_ambiguity: false` and three empty arrays
- WHEN the orchestrator evaluates the clarify gate
- THEN it MUST set the clarify gate status to `skipped`
- AND it MUST dispatch `sdd-design` without invoking `sdd-clarify`

#### Scenario: Non-empty signal runs clarify

- GIVEN a successful `sdd-spec` return contains a non-empty `public_contract_questions` array
- WHEN the orchestrator evaluates the clarify gate
- THEN it MUST run the existing clarify handler
- AND it MUST NOT invoke `validate-phase.js` for `sdd-clarify`

#### Scenario: Invalid signals halt before downstream dispatch

- GIVEN an otherwise successful `sdd-spec` return omits or maltypes any ambiguity signal
- WHEN the orchestrator processes the return
- THEN it MUST block the change for `sdd-spec` contract remediation
- AND it MUST dispatch neither `sdd-clarify` nor `sdd-design`

#### Scenario: Generated targets preserve the gate decision

- GIVEN identical valid ambiguity signals in each supported generated target
- WHEN each orchestrator evaluates the post-spec gate
- THEN every target MUST produce the same skip-or-run decision and state outcome

## MODIFIED Requirements

### 6.1a Orchestrator Consumes Structured Envelope Fields

The orchestrator's Result Contract MUST extract phase-return field values from the
sub-agent's ```` ```json:result-envelope ```` fenced block (skills domain,
`sdd-phase-common.md` §D strict emission format) as the primary, authoritative source
— `status`, `executive_summary`, `artifacts`, `next_recommended`, `risks`,
`skill_resolution`, and any present optional or phase-specific fields.

When the fence is absent, malformed, or fails schema validation, the orchestrator MUST
degrade to its pre-existing plain-prose parsing behavior without blocking dispatch,
EXCEPT when an otherwise successful `sdd-spec` result lacks or maltypes any field from
`REQ-skills-003`. That exception MUST halt orchestration for `sdd-spec` contract
remediation before clarify or design. It MUST NOT fall back to clarify.

(Previously: every absent, malformed, or schema-invalid fenced envelope silently fell
back to prose parsing without any phase-specific fail-closed exception.)

#### Scenario: Fenced envelope present — orchestrator parses fields directly

- GIVEN a phase agent's return includes a valid ```` ```json:result-envelope ```` fence
- WHEN the orchestrator processes the return
- THEN it extracts `status`, `artifacts`, `next_recommended`, and other fields directly from the parsed JSON object

#### Scenario: Fence absent or invalid — fallback to prose parsing

- GIVEN a non-`sdd-spec` phase return has no fence or fails schema validation
- WHEN the orchestrator processes the return
- THEN it falls back to parsing the plain-prose envelope exactly as before
- AND dispatch MUST NOT fail because of the missing or invalid fence

#### Scenario: Invalid successful sdd-spec signals override fallback

- GIVEN a successful `sdd-spec` result has missing or malformed ambiguity signals in its structured or prose envelope
- WHEN the orchestrator processes the result
- THEN it MUST halt for contract remediation
- AND it MUST NOT dispatch clarify or design through the generic fallback path
