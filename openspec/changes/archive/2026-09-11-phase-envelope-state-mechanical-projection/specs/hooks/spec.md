# Delta for hooks

## ADDED Requirements

### Requirement: SubagentStop Mechanical Projection via PhaseCompletionReducer {#REQ-hooks-023}

`SubagentStop` (in `scripts/hooks/subagent-stop.js` and `internal/hooks/subagentstop.go`) MUST invoke `PhaseCompletionReducer` to project validated result envelope payloads into `state.yaml` and runtime state. The hook MUST NOT perform manual ad-hoc string manipulations or custom YAML edits on `state.yaml` outside the reducer. State projection MUST be executed under advisory file locking (`withFileLock`) and atomic write mechanisms (`writeFileAtomic`), ensuring Compare-And-Swap (CAS) integrity and replay idempotency. Any internal projection failure MUST be logged and handled fail-safely without altering the hook's stdout (`continue: true`) or causing a non-zero exit.

#### Scenario: SubagentStop projects valid envelope via PhaseCompletionReducer

- GIVEN a finished subagent returning a valid `result-envelope/v1` payload
- WHEN `SubagentStop` runs
- THEN it extracts and validates the envelope
- AND invokes `PhaseCompletionReducer` to update `state.yaml` mechanically under file lock

#### Scenario: Replay of SubagentStop projection is idempotent

- GIVEN a subagent completion that has already been projected by `SubagentStop`
- WHEN `SubagentStop` is re-executed with the identical payload
- THEN `PhaseCompletionReducer` MUST detect the replay
- AND MUST NOT create duplicate journal records or advance state revisions spuriously

#### Scenario: Reducer execution failure remains fail-safe

- GIVEN an unhandled error or corrupted state file during reducer execution in `SubagentStop`
- WHEN the hook catches the exception
- THEN the error MUST be logged fail-safely
- AND the hook MUST emit `{"continue":true}` without blocking the subagent's turn

## MODIFIED Requirements

### Requirement: SubagentStop Phase-Aware Envelope And Spec Contract Fail-Closed {#REQ-hooks-015}

When persisting a result envelope or resolving dispatch status, `SubagentStop` (in `scripts/hooks/subagent-stop.js` and the Go mirror `internal/hooks/subagentstop.go`) MUST resolve the registered agent name through the shared canonical agent resolution authority (`agent-identity`) before deriving the state phase key or validating envelope contents. Envelope persistence MUST derive the state phase key from the resolved canonical agent and skip persistence fail-safely when unsupported or unresolved; only then validate the envelope. Both runtimes MUST pass the resolved canonical agent name as the phase context (`{ phase }` in JS, `phase` string in Go `ValidateForPhase`) to envelope validation so phase-specific constraints apply to host-prefixed dispatches. Validated envelope payloads MUST be delegated to `PhaseCompletionReducer` for mechanical state projection into `state.yaml`. For an `sdd-spec` dispatch (including host-prefixed dispatches such as `plugin-host:sdd-spec`) whose envelope claims `status: "success"` but fails phase-aware validation, `resolveDispatchStatus` MUST return `"blocked"` rather than accepting the success string. Root-transcript identity comparison (`sameFileIdentity`) MUST treat either side's `dev === 0` as a matching device when inode and size match.
(Previously: persistResultEnvelope directly read and updated state.yaml using setPhaseSummary instead of delegating state projection to PhaseCompletionReducer.)

#### Scenario: Invalid successful sdd-spec envelope becomes blocked status

- GIVEN SubagentStop receives an `sdd-spec` result with `status: "success"` that fails phase-aware envelope validation
- WHEN dispatch status is resolved in JS or Go
- THEN the resolved status MUST be `"blocked"`
- AND the hook MUST NOT treat the invalid success as a successful phase outcome

#### Scenario: Prefixed sdd-spec dispatch enforces fail-closed validation

- GIVEN SubagentStop receives a result with `status: "success"` that fails phase-aware validation for registered agent `plugin-host:sdd-spec`
- WHEN `resolveDispatchStatus` evaluates the dispatch in JS or Go
- THEN canonical resolution MUST resolve the agent to `sdd-spec`
- AND the resolved status MUST be `"blocked"`

#### Scenario: Valid envelope from prefixed dispatch projects state via PhaseCompletionReducer

- GIVEN an active change and a subagent result containing a valid result envelope for registered agent `plugin-host:sdd-design`
- WHEN `persistResultEnvelope` executes in JS or Go
- THEN canonical resolution MUST resolve the agent to `sdd-design` and phase key `design`
- AND `SubagentStop` MUST invoke `PhaseCompletionReducer` to project `state.yaml` and lifecycle state mechanically

#### Scenario: Unresolvable or foreign agent skips envelope persistence fail-safely

- GIVEN a subagent result payload for an unregistered or foreign agent name (e.g. `host:review-invented` or `foreign-worker`)
- WHEN `persistResultEnvelope` runs in JS or Go
- THEN canonical resolution MUST return `unresolved`
- AND envelope persistence MUST be skipped without throwing or altering hook stdout

#### Scenario: Zero device id still matches transcript identity

- GIVEN two file identity snapshots share `ino` and `size` and at least one reports `dev === 0`
- WHEN `sameFileIdentity` compares them
- THEN it MUST return true
