# Design: Make Clarify Truly Conditional

## Technical Approach

Treat the successful `sdd-spec` envelope as the single input to the post-spec gate. Extend the canonical envelope validators with phase context, require and type-check the four ambiguity signals only for `sdd-spec` + `success`, and keep generic validation behavior unchanged for every other phase/status. The orchestrator then fails closed on an invalid successful spec envelope and delegates the valid skip/run decision to the existing clarify handler.

The clarify handler owns one pure predicate: skip only for `false` plus three empty arrays; otherwise run the existing handler. This keeps the orchestrator below its 500-line guard, retains its anchored `residual_ambiguity` string, and leaves clarify outside route phase lists and `validate-phase.js`.

## Requirement Allocation

| Requirement / scenario | Component and contract | Verification target |
|---|---|---|
| `REQ-skills-003`: successful spec emits four typed fields | `skills/sdd-spec/SKILL.md` emission instructions and `skills/_shared/sdd-phase-common.md` canonical schema | `scripts/clarify-signal-contract.test.js` |
| Well-defined spec emits skip signal | `sdd-spec` result template requires `false` and empty arrays when no gaps remain | Contract assertions over both prose and strict fence guidance |
| Any ambiguity category triggers | Pure predicate documented in `skills/_shared/clarify-routing.md` | Truth-table cases for flag and each array |
| Missing/malformed signals rejected | Phase-aware JS/Go validator entry points | `scripts/lib/result-envelope.test.js`, `internal/resultenvelope/resultenvelope_test.go` |
| `REQ-agents-011`: skip standard clarify | Post-spec dispatch in `agents/sdd-orchestrator.agent.md`; handler writes `skipped` | Contract test plus generated-target integration |
| Positive signal runs existing handler without phase validation | Handler run branch; orchestrator continues to treat clarify as a gate | Contract assertions excluding `validate-phase.js` from clarify dispatch |
| Invalid successful spec halts | Orchestrator fail-closed branch writes blocked remediation state and dispatches neither downstream phase | Contract assertions for halt language and no fallback |
| All targets preserve decision | Existing configure pipeline transforms canonical agent/shared-skill sources | `scripts/configure/real-repo.test.js` across five profiles |

## Architecture Decisions

### Decision: Use phase-aware validation without changing the generic envelope contract

**Choice**: Add optional phase context to JavaScript validation and a parity Go entry point (for example, `ValidateForPhase`), while preserving the existing generic functions for callers that have no phase context. Present ambiguity fields are always type-checked; all four become required only for `phase == sdd-spec` and `status == success`.

**Alternatives considered**: Require the fields on every envelope, which breaks unrelated phases; infer phase from the envelope, which has no canonical phase field; validate only in prose, which cannot guarantee JS/Go parity.

**Rationale**: Hook callers already resolve the agent/phase, so context is available without expanding the public envelope. Backward-compatible entry points limit blast radius while satisfying the phase-specific contract. This public-contract decision is mirrored in `decisions/adr-001.md`.

### Decision: Keep the clarify decision in the extracted handler

**Choice**: Move both skip and run evaluation into `skills/_shared/clarify-routing.md`, expressed as a deterministic truth table/predicate; keep only the post-spec validation and handler pointer in the orchestrator.

**Alternatives considered**: Inline the truth table in the orchestrator; add clarify to route phases; create a runtime JavaScript router that the prompt cannot directly execute.

**Rationale**: The existing handler already owns clarify bookkeeping, and the current test explicitly prevents handler sentinels from returning to the orchestrator body.

### Decision: Fail closed before either downstream dispatch

**Choice**: A successful `sdd-spec` response with absent or malformed signals sets the change to blocked for `sdd-spec` contract remediation; it never treats clarify as a fallback.

**Alternatives considered**: Run clarify defensively or silently apply empty defaults.

**Rationale**: This preserves the distinction between a broken machine contract and genuine requirements ambiguity, matching approval `architecture-002`.

## Data Flow

```text
sdd-spec return
      |
      v
extract strict envelope -> validate for phase `sdd-spec`
      | invalid                    | valid
      v                            v
block for spec remediation    shouldRunClarify(signals)
      |                         /                 \
 no downstream dispatch    false                 true
                           /                       \
                mark gate skipped          run existing handler
                           \                       /
                            ------> sdd-design <---
```

## File Changes

| File | Action | Description |
|---|---|---|
| `skills/sdd-spec/SKILL.md` | Modify | Require computation and emission of all four fields in successful prose and JSON envelopes. |
| `skills/_shared/sdd-phase-common.md` | Modify | Document phase-specific fields and validation semantics in the canonical result schema. |
| `skills/_shared/clarify-routing.md` | Modify | Own validation handoff, pure skip/run predicate, skipped state, and existing run outcomes. |
| `agents/sdd-orchestrator.agent.md` | Modify | Replace route/classification clarify rules with phase-aware validation and the handler pointer; retain `residual_ambiguity`. |
| `scripts/lib/result-envelope.js` | Modify | Add phase-aware required-field checks and string-array validation while preserving generic validation. |
| `scripts/lib/result-envelope.test.js` | Modify | Add RED/GREEN cases for phase/status scope, missing fields, malformed values, and deterministic errors. |
| `internal/resultenvelope/resultenvelope.go` | Modify | Mirror JavaScript phase-aware validation and error ordering. |
| `internal/resultenvelope/resultenvelope_test.go` | Modify | Mirror the JavaScript cases and validity outcomes. |
| `scripts/hooks/subagent-stop.js` | Modify | Resolve phase before validation and pass it at both envelope call sites. |
| `internal/hooks/subagentstop.go` | Modify | Pass the derived phase to the Go validator at matching call sites. |
| `scripts/clarify-signal-contract.test.js` | Create | Pin prompt/schema landmarks, predicate truth table, fail-closed behavior, and clarify bypass of phase validation. |
| `scripts/configure/real-repo.test.js` | Modify | Generate all five supported targets and assert equivalent predicate/handler landmarks and state outcomes. |

Generated `dist/**` files remain derived and uncommitted; the configure tests generate fresh target trees from canonical sources.

## Interfaces / Contracts

```js
validateEnvelope(envelope, { phase: "sdd-spec" })
// Generic call remains valid: validateEnvelope(envelope)
```

```go
Validate(obj)                         // existing generic behavior
ValidateForPhase(obj, "sdd-spec")    // phase-specific requirements
```

Canonical signal shape:

```json
{
  "residual_ambiguity": false,
  "public_contract_questions": [],
  "conflicting_requirements": [],
  "missing_acceptance_criteria": []
}
```

Errors name the exact field. JavaScript and Go preserve deterministic check ordering: missing required fields first, then flag/array/element type failures in canonical field order.

## Testing Strategy

Strict TDD applies. RED adds the phase-aware validator and contract tests before implementation. GREEN implements the smallest required-field/type helpers and handler text. TRIANGULATE covers `true`, each independently non-empty array, false/empty skip, every malformed type, a non-string element, non-successful `sdd-spec`, and successful non-spec phases. REFACTOR extracts shared string-array validation and deterministic field-order constants without changing messages.

| Layer | What to test | Approach |
|---|---|---|
| Unit | JS/Go validation scope, types, errors, and no-throw behavior | Mirrored table-driven cases in both validator suites |
| Contract | sdd-spec emission, pure predicate, halt branch, state wording, no validate-phase call | New focused Node contract test |
| Integration | Canonical sources survive tool/name transforms in all five profiles | Extend real-repo generation tests |
| Full gate | Runtime and generated parity | `npm test` plus `go test ./...` through the repository verification flow |

## Migration / Rollout

No data migration or feature flag is required. Land canonical contracts, validators, hook callers, and tests atomically. Generate targets only in temporary test outputs, run JS and Go parity suites, then the full repository gate. Rollback reverts the same atomic set and restores the prior route/classification clarify rule.

## Open Questions

None.
