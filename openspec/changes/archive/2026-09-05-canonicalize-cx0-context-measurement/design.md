# Design: Canonicalize CX0 Context Measurement and Envelope Persistence

## Technical Approach

This design resolves follow-up finding `F-c1cf060d0008ff4f` by extending canonical agent identity resolution to all remaining SubagentStop hook evaluation paths across Node.js (`scripts/hooks/subagent-stop.js`) and Go (`internal/hooks/subagentstop.go`).

Currently, `persistPhaseCost` canonicalizes host-prefixed agent names (such as `plugin-host:sdd-spec` or `host:review-runtime`) via the shared `agent-identity` authority (`resolveCanonicalAgent` in JS, `agentidentity.ResolveCanonicalAgent` in Go). However, raw names are still consumed by:
1. `persistContextMeasurement` in JS (`scripts/hooks/subagent-stop.js`).
2. `persistResultEnvelope` in both JS and Go (`internal/hooks/subagentstop.go`).
3. `resolveDispatchStatus` in both JS and Go.

Because `derivePhaseKey` and envelope validation operate on bare `sdd-*` prefixes or specific phase names (e.g. `sdd-spec`), host-prefixed dispatches fail `derivePhaseKey` (yielding `""`), which silently skips CX0 context measurement and result envelope persistence in `state.yaml`, and bypasses the `sdd-spec` fail-closed validation guard in `resolveDispatchStatus`.

Under this technical approach:
- Consumers call `resolveCanonicalAgent` / `agentidentity.ResolveCanonicalAgent` immediately following `resolveAgentName(input)` before evaluating phase keys or envelope validation.
- `validateEnvelope(..., { phase: canonicalAgent })` (JS) and `resultenvelope.ValidateForPhase(envelope, canonicalAgent)` (Go) receive the canonical agent identifier, enforcing phase-specific requirements (e.g., ambiguity signals for `sdd-spec`) even when dispatched with host prefixes.
- In `resolveDispatchStatus`, the fail-closed check (`canonicalAgent === "sdd-spec"` and `envelope.status === "success"`) triggers on canonical identity, returning `"blocked"` on invalid envelopes.
- Fail-safe semantics are preserved: unrecognized or foreign agents resolve to `unresolved`, yielding an empty phase key `""`, which cleanly skips persistence and telemetry without throwing, panicking, or altering hook stdout (`continue: true`).

## Architecture Decisions

| Option | Tradeoffs | Decision |
|--------|-----------|----------|
| **1. Canonicalization point**: Wrap `resolveAgentName(input)` at each consumer call site (`persistContextMeasurement`, `persistResultEnvelope`, `resolveDispatchStatus`) vs. canonicalizing inside `resolveAgentName` | Canonicalizing inside `resolveAgentName` would alter `runSubagentStop`'s runtime event telemetry (`refresh-registry-next-delegation`), where logging the raw registered host name is desirable for host diagnostics. | **Wrap at consumer call sites**: keeps `resolveAgentName` as raw extraction, while telemetry, envelope, and cost consumers uniformly canonicalize. |
| **2. Shared authority consumption**: Use existing `agent-identity` (`scripts/lib/agent-identity.js` / `internal/agentidentity`) vs. ad-hoc regex/prefix stripping in hooks | Ad-hoc stripping introduces duplication, risks regex drift between Go and JS, and violates REQ-agent-identity-002. | **Consume shared authority**: zero duplicate prefix logic, guaranteed parity between runtimes. |
| **3. Envelope phase context parameter**: Pass `canonicalAgent` as `{ phase: canonicalAgent }` / `ValidateForPhase(envelope, canonicalAgent)` vs. passing derived `statePhaseKey` (e.g. `"spec"`) | `validateEnvelope` and `ValidateForPhase` test against `phase === "sdd-spec"`, matching the canonical agent name convention. Passing `"spec"` would break existing validation rules. | **Pass canonical agent**: `canonicalAgent` (`sdd-spec`) matches the exact contract expected by `result-envelope` validators. |
| **4. Dispatch status fail-closed comparison**: Compare `canonicalAgent === "sdd-spec"` vs. checking `statePhaseKey === "spec"` in `resolveDispatchStatus` | Comparing `statePhaseKey === "spec"` requires calling `derivePhaseKey` inside status resolution (which currently does not derive phase keys). | **Compare `canonicalAgent === "sdd-spec"`**: direct, explicit, and preserves existing code structure in both runtimes. |

### Decision: Ingress Canonicalization Across SubagentStop Consumers

**Choice**: Canonicalize the output of `resolveAgentName(input)` using `resolveCanonicalAgent` (JS) and `agentidentity.ResolveCanonicalAgent` (Go) at the entry of `persistContextMeasurement`, `persistResultEnvelope`, and `resolveDispatchStatus`.

**Alternatives considered**:
- *Strip prefix in `derivePhaseKey`*: Rejected because `derivePhaseKey` takes a canonical agent name and outputs the phase string (e.g. `"spec"`), but `validateEnvelope` and `resolveDispatchStatus` need the canonical agent name (`"sdd-spec"`), not the phase string.
- *Local prefix replacement (e.g. `raw.replace(/^[^:]+:/, '')`)*: Rejected because it duplicates the prefix grammar and misses closed-set validation rules (single colon, non-empty sides, allowlist validation).

**Rationale**: Adheres to the Single Shared Authority pattern established in REQ-agent-identity-002 and ensures that all downstream consumers observe identical agent identities across both runtimes.

### Decision: Bind Phase-Specific Envelope Validation to Canonical Identity

**Choice**: Provide the resolved canonical agent name to `validateEnvelope` (`{ phase: canonicalAgent }`) and `resultenvelope.ValidateForPhase(envelope, canonicalAgent)`. In `resolveDispatchStatus`, evaluate `canonicalAgent === "sdd-spec"`.

**Alternatives considered**:
- *Broaden `result-envelope` to accept prefixed names*: Rejected because `result-envelope` validates envelope schema contracts and must not be coupled with host-specific prefix parsing.
- *Keep raw name in status resolution*: Rejected because prefixed `sdd-spec` dispatches with invalid envelopes would bypass the `"blocked"` fail-closed requirement, creating an integrity hole.

**Rationale**: Enforces the contract integrity guarantee (REQ-hooks-015) that invalid spec envelopes cannot be reported as successful outcomes, regardless of host-applied prefixing.

## Data Flow

```
                     SubagentStop Hook Input (input)
                                    │
                                    ▼
                         resolveAgentName(input)
                                    │
                                    ▼
                           Raw Agent String
                    (e.g., "plugin-host:sdd-spec")
                                    │
                                    ▼
                 resolveCanonicalAgent / ResolveCanonicalAgent
                                    │
               ┌────────────────────┴────────────────────┐
               │                                         │
        [Harness Agent]                            [UNRESOLVED]
     ("sdd-spec", "review-*")                      ("unresolved")
               │                                         │
     ┌─────────┼─────────┐                               ▼
     │         │         │                     derivePhaseKey -> ""
     ▼         ▼         ▼                               │
persist    resolve    persist                            ▼
Result     Dispatch   Context                 Graceful Fail-Safe Exit:
Envelope   Status     Measurement             - persistResultEnvelope: no-op
(JS / Go)  (JS / Go)  (JS)                    - resolveDispatchStatus: fallback
     │         │         │                    - persistContextMeasurement:
     ▼         ▼         ▼                      status "skipped"
derivePhase  validate  derivePhase              reason "unsupported-agent"
Key -> key  Envelope   Key -> phase
     │      { phase }    │
     ▼         │         ▼
state.yaml     ▼       context-
(fill-gap)   blocked / measurements.
             status    jsonl
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/hooks/subagent-stop.js` | Modify | In `persistResultEnvelope`, `resolveDispatchStatus`, and `persistContextMeasurement`, resolve canonical agent via `resolveCanonicalAgent(resolveAgentName(input))`. Pass `canonicalAgent` to `validateEnvelope({ phase: canonicalAgent })` and check `canonicalAgent === "sdd-spec"` in `resolveDispatchStatus`. |
| `internal/hooks/subagentstop.go` | Modify | In `persistResultEnvelope` and `resolveDispatchStatus`, resolve canonical agent via `agentidentity.ResolveCanonicalAgent(resolveAgentName(input))`. Pass canonical agent to `resultenvelope.ValidateForPhase(envelope, canonicalAgent)` and check `canonicalAgent == "sdd-spec"` in `resolveDispatchStatus`. |
| `scripts/hooks/subagent-stop.test.js` | Modify | Add regression and unit tests for prefixed dispatches in `persistContextMeasurement` (`plugin-host:sdd-spec`), `persistResultEnvelope` (`plugin-host:sdd-design`), and `resolveDispatchStatus` (`plugin-host:sdd-spec` fail-closed to `"blocked"`). |
| `internal/hooks/subagentstop_test.go` | Modify | Add Go unit tests for prefixed dispatches in `persistResultEnvelope` and `resolveDispatchStatus`, verifying parity with JS behavior. |

## Interfaces / Contracts

### JavaScript Integration Pattern (`scripts/hooks/subagent-stop.js`)

```javascript
// persistResultEnvelope
async function persistResultEnvelope({ input, workspace }) {
  // ... envelope extraction ...
  const canonicalAgent = resolveCanonicalAgent(resolveAgentName(input));
  const statePhaseKey = derivePhaseKey(canonicalAgent);

  if (!statePhaseKey) {
    return;
  }

  const validation = validateEnvelope(envelopeResult.value, {
    phase: canonicalAgent,
  });

  if (!validation.valid) {
    return;
  }
  // ... state.yaml persistence ...
}

// resolveDispatchStatus
async function resolveDispatchStatus(input) {
  // ... envelope extraction ...
  if (envelopeResult.found && envelopeResult.value) {
    const canonicalAgent = resolveCanonicalAgent(resolveAgentName(input));
    const validation = validateEnvelope(envelopeResult.value, {
      phase: canonicalAgent,
    });

    if (validation.valid && typeof envelopeResult.value.status === "string") {
      return envelopeResult.value.status;
    }

    if (
      canonicalAgent === "sdd-spec" &&
      envelopeResult.value.status === "success"
    ) {
      return "blocked";
    }
  }
  // ... fallback to input.status or "unknown" ...
}

// persistContextMeasurement
async function persistContextMeasurement({ input, workspace, append = appendContextMeasurement, env = process.env }) {
  const canonicalAgent = resolveCanonicalAgent(resolveAgentName(input));
  const phase = derivePhaseKey(canonicalAgent);
  try {
    if (!phase) return { status: "skipped", reason: "unsupported-agent" };
    // ... context normalization and append ...
  } catch {
    return { status: "skipped", reason: "fail-safe-error", phase: phase || null };
  }
}
```

### Go Integration Pattern (`internal/hooks/subagentstop.go`)

```go
// persistResultEnvelope
func persistResultEnvelope(input map[string]any, workspace string) {
	// ... envelope extraction ...
	canonicalAgent := agentidentity.ResolveCanonicalAgent(resolveAgentName(input))
	statePhaseKey := derivePhaseKey(canonicalAgent)
	if statePhaseKey == "" {
		return
	}

	valid, _ := resultenvelope.ValidateForPhase(envelope, canonicalAgent)
	if !valid {
		return
	}
	// ... state.yaml persistence ...
}

// resolveDispatchStatus
func resolveDispatchStatus(input map[string]any) string {
	// ... envelope extraction ...
	if found && envelope != nil {
		canonicalAgent := agentidentity.ResolveCanonicalAgent(resolveAgentName(input))
		if valid, _ := resultenvelope.ValidateForPhase(envelope, canonicalAgent); valid {
			if s, ok := envelope["status"].(string); ok && s != "" {
				return s
			}
		}
		if status, _ := envelope["status"].(string); canonicalAgent == "sdd-spec" && status == "success" {
			return "blocked"
		}
	}
	// ... fallback to input.status or "unknown" ...
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (JS) | `persistContextMeasurement` with host prefix (`plugin-host:sdd-spec`, `host:sdd-apply`) | Assert returned status is `recorded`, `dimensions.phase` matches derived key, and file `.ospec/session/{change}/context-measurements.jsonl` contains the record. |
| Unit (JS) | `persistResultEnvelope` with host prefix (`plugin-host:sdd-design`) | Assert `state.yaml` `phases.design.summary` and `key_decisions` are updated under file lock. |
| Unit (JS) | `resolveDispatchStatus` with prefixed `plugin-host:sdd-spec` | Assert invalid successful envelope resolves to `"blocked"`; valid spec envelope resolves to `"success"`. |
| Unit (JS) | Foreign/unresolvable agent handling | Assert `persistContextMeasurement` returns `{ status: "skipped", reason: "unsupported-agent" }` and `persistResultEnvelope` leaves `state.yaml` unchanged. |
| Unit (Go) | `persistResultEnvelope` with host prefix in Go (`plugin-host:sdd-design`) | Assert `state.yaml` is updated with summary and key decisions matching JS parity. |
| Unit (Go) | `resolveDispatchStatus` with prefixed `plugin-host:sdd-spec` in Go | Assert invalid successful envelope resolves to `"blocked"`, matching JS parity. |
| Unit (Go) | Foreign/unresolvable agent handling in Go | Assert `state.yaml` remains byte-for-byte intact when non-harness or foreign agents run. |
| Integration | Regression guard on bare unprefixed dispatches (`sdd-*`, `review-*`) | Run existing test suites in `scripts/hooks/subagent-stop.test.js` and `internal/hooks/subagentstop_test.go` to guarantee zero regressions. |

### Requirements Scenario Allocation Matrix

| Spec Requirement & Scenario | Implementation Allocation | Verification Layer |
|-----------------------------|---------------------------|---------------------|
| REQ-hooks-015: Invalid successful sdd-spec envelope becomes blocked status | `resolveDispatchStatus` (JS & Go) | JS `subagent-stop.test.js` / Go `subagentstop_test.go` |
| REQ-hooks-015: Prefixed sdd-spec dispatch enforces fail-closed validation | `resolveDispatchStatus` with `resolveCanonicalAgent` (JS & Go) | JS `subagent-stop.test.js` / Go `subagentstop_test.go` |
| REQ-hooks-015: Valid envelope from prefixed dispatch persists to state.yaml | `persistResultEnvelope` with `resolveCanonicalAgent` (JS & Go) | JS `subagent-stop.test.js` / Go `subagentstop_test.go` |
| REQ-hooks-015: Unresolvable or foreign agent skips envelope persistence fail-safely | `persistResultEnvelope` early exit on empty `statePhaseKey` (JS & Go) | JS `subagent-stop.test.js` / Go `subagentstop_test.go` |
| REQ-hooks-015: Zero device id still matches transcript identity | `sameFileIdentity` in `subagent-stop.js` (preserved existing) | JS `subagent-stop.test.js` |
| REQ-hooks-017: Measurement emission succeeds without changing hook behavior | `persistContextMeasurement` post-O1 fail-safe boundary in `subagent-stop.js` | JS `subagent-stop.test.js` |
| REQ-hooks-017: Host-prefixed sdd dispatch emits CX0 context measurement | `persistContextMeasurement` with `resolveCanonicalAgent` in `subagent-stop.js` | JS `subagent-stop.test.js` |
| REQ-hooks-017: Unresolvable or foreign agent skips CX0 emission fail-safely | `persistContextMeasurement` skip on empty `phase` in `subagent-stop.js` | JS `subagent-stop.test.js` |
| REQ-hooks-017: CX0 collector cannot read a host field | Existing `normalizeContextMeasurement` fallback mapping (preserved) | JS `subagent-stop.test.js` |
| REQ-hooks-017: CX0 durable write fails | Existing try/catch fail-safe boundary in `persistContextMeasurement` (preserved) | JS `subagent-stop.test.js` |
| REQ-agent-identity-002: Emitter and validator agree for the same registered name | Shared `agent-identity` consumed across all telemetry/validator sites | `agent-identity.test.js` / `benchmark.test.js` |
| REQ-agent-identity-002: Prefix-free compatibility with current attestation (O1) | `resolveCanonicalAgent` returns bare names unchanged | JS & Go test suites |
| REQ-agent-identity-002: Envelope persistence and CX0 consumers share canonical resolution | `subagent-stop.js` & `subagentstop.go` consume mirrored authorities | Mirrored test assertions in JS and Go |

## Migration / Rollout

No migration required. The change is strictly additive and internal to the hook execution flow:
- Persisted schema and file structures (`state.yaml`, `context-measurements.jsonl`, `phase-costs.jsonl`) remain unchanged.
- Existing unprefixed dispatches behave identically.
- Reversible by reverting code changes via git.

## Open Questions

None. All interfaces and constraints are resolved by the existing `agent-identity` specification and mirrored implementations.
