# Delta for hooks

## MODIFIED Requirements

### Requirement: SubagentStop Phase-Aware Envelope And Spec Contract Fail-Closed {#REQ-hooks-015}

When persisting a result envelope or resolving dispatch status, `SubagentStop` (in `scripts/hooks/subagent-stop.js` and the Go mirror `internal/hooks/subagentstop.go`) MUST resolve the registered agent name through the shared canonical agent resolution authority (`agent-identity`) before deriving the state phase key or validating envelope contents.

In `persistResultEnvelope`, the hook MUST first search for a canonical fenced `json:result-envelope` block in input result fields or subagent transcripts. If no canonical fence is detected, `SubagentStop` MUST deliver raw result text or transcript content to `adaptLegacyEnvelope()`. When `adaptLegacyEnvelope()` produces a normalized candidate (or when an unversioned envelope is extracted), `SubagentStop` MUST validate the candidate with phase-aware validation, passing the canonical agent name (`{ phase }` in JS, `phase` string in Go `ValidateForPhase`). Only upon successful validation, `SubagentStop` MUST delegate the normalized payload to `PhaseCompletionReducer` for mechanical state projection into `state.yaml`.

Envelope persistence MUST derive the state phase key from the resolved canonical agent and skip persistence fail-safely when unsupported or unresolved. For an `sdd-spec` dispatch (including host-prefixed dispatches such as `plugin-host:sdd-spec`) whose envelope (canonical or legacy-adapted) claims `status: "success"` but fails phase-aware validation due to missing or invalid ambiguity signals, persistence MUST NOT proceed and `resolveDispatchStatus` MUST return `"blocked"` rather than accepting the success string. Root-transcript identity comparison (`sameFileIdentity`) MUST treat either side's `dev === 0` as a matching device when inode and size match.

(Previously: SubagentStop only processed envelopes with canonical json:result-envelope fences and bypassed adaptLegacyEnvelope on raw text or transcript fallbacks.)

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

#### Scenario: Legacy envelope without canonical fence is adapted and projected

- GIVEN a subagent result for `sdd-design` lacking a `json:result-envelope` fence but containing valid legacy prose or unversioned envelope text
- WHEN `persistResultEnvelope` executes in JS or Go
- THEN it MUST deliver the raw text or transcript to `adaptLegacyEnvelope()`
- AND pass the normalized candidate to `PhaseCompletionReducer` for mechanical state projection

#### Scenario: Legacy sdd-spec success without ambiguity signals fails closed

- GIVEN a subagent result for `sdd-spec` returning legacy prose claiming success without ambiguity signals
- WHEN `persistResultEnvelope` or `resolveDispatchStatus` runs in JS or Go
- THEN phase-aware validation MUST reject the adapted candidate
- AND `persistResultEnvelope` MUST NOT project phase completion
- AND `resolveDispatchStatus` MUST return `"blocked"`
