# Proposal: Canonicalize CX0 Context Measurement and Envelope Persistence

## Intent

In `SubagentStop`, host-prefixed agent names (e.g. `plugin-host:sdd-*`, `host:review-*`) are canonicalized for phase-cost emission (`appendPhaseCost`), but raw names are still consumed by `persistContextMeasurement` (JS), `persistResultEnvelope` (JS and Go), and `resolveDispatchStatus` (JS and Go). Consequently, prefixed dispatches fail `derivePhaseKey`, silently skipping CX0 context measurement and result envelope persistence into `state.yaml`. This change resolves follow-up finding F-c1cf060d0008ff4f by extending canonical agent identity resolution across all these sites with strict Go/JS parity.

## Scope

### In Scope
- Canonicalize agent names in `persistContextMeasurement` (`scripts/hooks/subagent-stop.js`) via `resolveCanonicalAgent` before phase key derivation.
- Canonicalize agent names in `persistResultEnvelope` and `resolveDispatchStatus` in both JS (`scripts/hooks/subagent-stop.js`) and Go (`internal/hooks/subagentstop.go`).
- Pass canonical agent name as `{ phase }` context in `validateEnvelope` / `ValidateForPhase` so phase-specific envelope constraints (e.g. `sdd-spec`) apply to prefixed dispatches.
- Unit and integration regression tests in JS (`scripts/hooks/subagent-stop.test.js`) and Go (`internal/hooks/subagentstop_test.go`).

### Out of Scope
- Go implementation of CX0 context measurement (CX0 is currently a JS-only pipeline; Go parity covers envelope persistence and status resolution).
- Modifying `agent-identity` prefix grammar, allowlists, or regex patterns.
- Changing CX0 metric definitions, formulas, or schemas.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `hooks`: REQ-hooks-015 and REQ-hooks-017 updated to explicitly require canonical agent resolution before envelope persistence, dispatch status resolution, and CX0 context measurement emission across JS and the Go mirror.
- `agent-identity`: REQ-agent-identity-002 updated to include `persistContextMeasurement` and `persistResultEnvelope` (JS and Go mirror) as consumers of the shared canonical resolution authority.

## Approach

Leverage the consolidated `agent-identity` authority (`scripts/lib/agent-identity.js` and `internal/agentidentity/agentidentity.go`):
1. In `scripts/hooks/subagent-stop.js`: wrap `resolveAgentName(input)` with `resolveCanonicalAgent(...)` in `persistContextMeasurement`, `persistResultEnvelope`, and `resolveDispatchStatus`.
2. In `internal/hooks/subagentstop.go`: wrap `resolveAgentName(input)` with `agentidentity.ResolveCanonicalAgent(...)` in `persistResultEnvelope` and `resolveDispatchStatus`.
3. Preserve existing fail-safe behavior: unresolvable or foreign names return `unresolved` / empty phase key and fail closed without throwing or altering hook stdout (`continue: true`).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/hooks/subagent-stop.js` | Modified | Canonicalize agent in `persistContextMeasurement`, `persistResultEnvelope`, `resolveDispatchStatus` |
| `internal/hooks/subagentstop.go` | Modified | Canonicalize agent in `persistResultEnvelope`, `resolveDispatchStatus` |
| `scripts/hooks/subagent-stop.test.js` | Modified | Tests for prefixed dispatch CX0 measurement and envelope persistence |
| `internal/hooks/subagentstop_test.go` | Modified | Tests for Go prefixed dispatch envelope persistence |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Regressions on unprefixed agent dispatches | Low | `resolveCanonicalAgent` acts as identity for valid bare names; full existing test suite validates backward compatibility |
| Go/JS parity divergence | Low | Both runtimes consume the mirrored `agentidentity` authority; parallel tests in JS and Go assert parity |
| Failures on malformed agent names | Low | `resolveCanonicalAgent` fails closed to `unresolved` without throwing, triggering existing graceful skips |

## Rollback Plan

Revert changes in `scripts/hooks/subagent-stop.js` and `internal/hooks/subagentstop.go` via git. No persisted state migration or database rollback required.

## Dependencies

- Existing `agent-identity` specification and modules (`scripts/lib/agent-identity.js`, `internal/agentidentity/agentidentity.go`).

## Success Criteria

- [ ] A host-prefixed dispatch (e.g. `plugin-host:sdd-spec`) emits a valid CX0 record in `.ospec/session/{change}/context-measurements.jsonl`.
- [ ] A host-prefixed dispatch persists envelope summary and key decisions into `state.yaml` in both JS and Go.
- [ ] A host-prefixed `sdd-spec` dispatch with an invalid envelope fails closed to `status: "blocked"` in both JS and Go.
- [ ] All tests in `scripts/hooks/subagent-stop.test.js` and `internal/hooks/subagentstop_test.go` pass.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/canonicalize-cx0-context-measurement main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
