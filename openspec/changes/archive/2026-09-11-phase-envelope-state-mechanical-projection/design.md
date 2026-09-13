# Design: Phase Envelope and State Mechanical Projection (CX1)

## Technical Approach

Eliminate output duplication and state divergence across SDD phases by establishing a versioned execution envelope (`result-envelope/v1`), a decoupled human markdown renderer, a legacy envelope adapter, and a runtime-owned `PhaseCompletionReducer`. SDD phase agents currently emit duplicate representations (prose and fenced JSON) while executing error-prone ad-hoc mutations against `state.yaml`. 

This design shifts state projection into a deterministic, mechanical kernel responsibility. Phase agents emit machine-parseable JSON payloads conforming strictly to `schemas/kernel/result-envelope/v1/envelope.schema.json`. A decoupled pure renderer (`renderEnvelopeToMarkdown` in `scripts/lib/result-envelope.js`) transforms structured envelopes into human prose for terminal/chat presentation without payload mutation. A legacy adapter normalizes unversioned fences and prose-adjacent outputs into canonical v1 payloads. The runtime `PhaseCompletionReducer` (`scripts/lib/lifecycle-kernel/phase-completion-reducer.js`) computes pure state transitions, advancing lifecycle nodes, phase summaries, and artifacts without filesystem I/O or model inference of approvals, decisions, or gate passes. State commits enforce Compare-And-Swap (CAS) revision checks under advisory file locking (`withFileLock`) and atomic writes (`writeFileAtomic`), guaranteeing replay idempotency.

## Architecture Decisions

| Decision | Option chosen | Alternatives considered | Tradeoff & Rationale | Evidence & Consequences |
|---|---|---|---|---|
| **ADR-001**: Versioned Envelope & Decoupled Renderer | Strict JSON `result-envelope/v1` schema with pure `renderEnvelopeToMarkdown` | Dual-output prompts (prose + JSON fence), markdown parser extracting state | Dual prompts cause semantic drift between prose and JSON; markdown scraping is brittle. JSON source of truth with pure renderer guarantees 0% drift. | REQ-skills-018, REQ-skills-019. Cost: agents must emit valid JSON; easier: deterministic parsing in JS and Go. Reversible via adapter. |
| **ADR-002**: Runtime-Owned Pure PhaseCompletionReducer | Pure state transition reducer in `lifecycle-kernel` mapping envelopes to state deltas | Phase agents mutating `state.yaml` directly; orchestrator parsing state via LLM reasoning | LLM file mutations corrupt YAML indentation, drop approvals, and hallucinate gate passes. Pure reducer isolates state logic from I/O and models. | REQ-lifecycle-kernel-028, REQ-agents-029. Enforces zero model inference of approvals; simplifies testing via pure state inputs/outputs. |
| **ADR-003**: CAS Revision Checks & Replay Idempotency | Advisory locking (`withFileLock`), CAS revision verification, and payload hash matching | Unsynchronized last-writer-wins, optimistic concurrency without locking | Concurrent subagents or hook retries overwrite state heads or append duplicate records. CAS + payload hashing detects replays and aborts stale writes. | REQ-lifecycle-kernel-029, REQ-hooks-023. Eliminates race conditions in `SubagentStop`; replay produces zero-delta convergence. |
| **ADR-004**: Strict Authority Boundary for Approvals & Gates | Fail-closed reducer rejecting model-asserted approvals and synthetic gate passes | Trusting agent-reported approval updates, optimistic gate advancement | LLM agents must never possess authority to approve their own work or bypass gates. Authority rests solely in human approvals and verifier records. | REQ-agents-029, REQ-lifecycle-kernel-028 §Scenario 3. Preserves trust invariants; unauthorized claims halt route fail-closed. |

### Decision: Versioned Result Envelope v1 and Decoupled Human Renderer

**Choice**: Define `result-envelope/v1` JSON Schema in `schemas/kernel/` and implement strict validation and `renderEnvelopeToMarkdown` in `scripts/lib/result-envelope.js`.
**Alternatives considered**: Retaining dual-output prompts where agents write human prose followed by a fenced JSON block; or deprecating JSON fences and using regex over human markdown.
**Rationale**: Dual emission forces LLMs to write redundant content, causing semantic conflicts when prose states success but JSON omits required fields. Defining a versioned JSON contract as canonical source-of-truth and generating prose via a deterministic renderer guarantees consistency and enables JSON-only agent returns.
**Evidence and consequences**: Cites REQ-skills-018, REQ-skills-019. Enables terminal and host adapters to format outputs cleanly. Requires legacy envelope adapter for backward compatibility.

### Decision: Pure PhaseCompletionReducer State Projection

**Choice**: Implement `reducePhaseCompletion(currentState, envelopePayload, options)` as a pure function in `scripts/lib/lifecycle-kernel/phase-completion-reducer.js`.
**Alternatives considered**: Allowing phase agents to continue directly updating `state.yaml` via ad-hoc file writes; or having the orchestrator infer next state using LLM reasoning.
**Rationale**: Direct writes by agents cause indentation corruption, drop comments, or lose existing approval records. LLM state inference is non-deterministic and can fabricate approvals. A pure reducer takes `(state, payload)` and deterministically returns `(nextState, effects, events, outcome)`.
**Evidence and consequences**: Cites REQ-lifecycle-kernel-028, REQ-agents-029. Eliminates state corruption bugs; guarantees reproducible replay; centralizes state advancement rules in the lifecycle kernel.

### Decision: CAS Revision Checks and Replay Determinism

**Choice**: Enforce Compare-And-Swap (CAS) revision matching and advisory file locking (`withFileLock`) in `scripts/lib/ospec-state.js` (`projectPhaseCompletion`), using payload hashing for idempotent replay.
**Alternatives considered**: Unlocked file writes (`fs.writeFile`), or unconditional overwrite (`last-writer-wins`).
**Rationale**: Multiple subagents terminating concurrently or hook retries could interleave writes or overwrite newer state revisions. CAS ensures that an update only commits if the expected head revision matches storage. Payload hashing ensures replaying an identical envelope returns the converged state without advancing revisions or duplicating journal records.
**Evidence and consequences**: Cites REQ-lifecycle-kernel-029, REQ-hooks-023. Backed by `atomic-write.js` (`writeFileAtomic`, `recoverOrphanBak`). Prevents data loss during interrupted writes.

### Decision: Fail-Closed Authority Boundary on Approvals and Gates

**Choice**: Reducer rejects uncommitted gate passes and self-attested approvals; orchestrator verifies authoritative records in `state.yaml` before dispatching downstream phases.
**Alternatives considered**: Permitting agents to emit `approval_updates` that the reducer directly applies to `approvals[]`.
**Rationale**: Model agents have zero authority to approve gates (e.g. `intent-briefing`, `quality-review-gate`). Accepting model-asserted approvals breaks the trust model of SDD.
**Evidence and consequences**: Cites REQ-agents-029, REQ-lifecycle-kernel-028. Unverified assertions halt progression; state projection preserves human and verifier ownership.

## Data Flow

```
   ┌─────────────────────────────────────────────────────────────┐
   │ Subagent Execution Turn (sdd-spec, sdd-design, sdd-apply...) │
   └──────────────────────────────┬──────────────────────────────┘
                                  │ Emits result-envelope/v1 (or legacy fence)
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ scripts/lib/result-envelope.js                              │
   │  ├─ adaptLegacyEnvelope()     ── Normalizes unversioned/prose│
   │  ├─ validateEnvelope()         ── Strict schema & phase check│
   │  └─ renderEnvelopeToMarkdown() ── Pure read-only presentation│
   └──────────────────────────────┬──────────────────────────────┘
                                  │ Validated envelope payload
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ SubagentStop Hook (scripts/hooks/subagent-stop.js)          │
   │  ├─ resolveCanonicalAgent()   ── Resolves host-prefixed name │
   │  ├─ resolveDispatchStatus()   ── Fail-closed spec validation │
   │  └─ projectPhaseCompletion()  ── Invokes mechanical runtime  │
   └──────────────────────────────┬──────────────────────────────┘
                                  │ Holds withFileLock(state.yaml)
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ PhaseCompletionReducer (scripts/lib/lifecycle-kernel/)      │
   │  ├─ Check Replay Hash        ── Matches previous payload?   │
   │  │                              ├─ Yes: Return noop-replay  │
   │  ├─ Check CAS Revision       ── Head revision matches R?    │
   │  │                              ├─ No: CAS Conflict Error   │
   │  ├─ Pure State Reduction     ── Maps summary, artifacts,    │
   │  │                              phase status, top-level     │
   │  └─ Reject Model Approvals   ── Drops uncommitted approvals │
   └──────────────────────────────┬──────────────────────────────┘
                                  │ Writes next state atomically
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Durable State Persistence (scripts/lib/atomic-write.js)     │
   │  ├─ writeFileAtomic()         ── Write .tmp -> rename       │
   │  └─ recoverOrphanBak()        ── Rollback recovery if crash  │
   └─────────────────────────────────────────────────────────────┘
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `schemas/kernel/result-envelope/v1/envelope.schema.json` | Create | Pinned JSON Schema defining `result-envelope/v1` (`$id: "https://openspec.io/schemas/kernel/result-envelope/v1.schema.json"`). |
| `schemas/kernel/result-envelope/v1/fixtures/valid-success.json` | Create | Valid success envelope fixture with required and optional fields. |
| `schemas/kernel/result-envelope/v1/fixtures/valid-blocked.json` | Create | Valid blocked envelope fixture with structured `question_gate` and `blocker_type`. |
| `schemas/kernel/result-envelope/v1/fixtures/valid-spec-signals.json` | Create | Valid `sdd-spec` success fixture with canonical ambiguity signals. |
| `schemas/kernel/result-envelope/v1/fixtures/invalid-missing-field.json` | Create | Negative fixture missing required `status` and `executive_summary`. |
| `schemas/kernel/result-envelope/v1/fixtures/invalid-bad-status.json` | Create | Negative fixture exercising unsupported status enum values. |
| `schemas/kernel/manifest.json` | Modify | Register `result-envelope` family pin at version 1. |
| `schemas/kernel/contract-claims.json` | Modify | Register family claims, required fields, and enums for `result-envelope`. |
| `scripts/lib/result-envelope.js` | Modify | Add schema version validation, `renderEnvelopeToMarkdown`, and `adaptLegacyEnvelope`. |
| `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` | Create | Pure state transition reducer mapping envelopes to `state.yaml` and lifecycle nodes with replay detection. |
| `scripts/lib/lifecycle-kernel/reducer.js` | Modify | Re-export `reducePhaseCompletion` and wire phase completion operations. |
| `scripts/lib/ospec-state.js` | Modify | Implement `projectPhaseCompletion` with `withFileLock`, CAS check, and `writeFileAtomic`; retain `setPhaseSummary` for backward compatibility. |
| `scripts/hooks/subagent-stop.js` | Modify | Delegate state persistence to `projectPhaseCompletion`, ensuring fail-closed spec validation and fail-safe error handling. |
| `skills/_shared/sdd-phase-common.md` | Modify | Update §C and §D instructions: prohibit direct agent `state.yaml` writes and mandate `result-envelope/v1` emission. |
| `scripts/lib/result-envelope.test.js` | Modify | Unit tests for v1 validation, `renderEnvelopeToMarkdown`, and `adaptLegacyEnvelope`. |
| `scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js` | Create | Unit tests for pure state reduction, CAS conflicts, replay idempotency, and approval rejection. |
| `scripts/lib/ospec-state.test.js` | Modify | Unit tests for locked `projectPhaseCompletion`, CAS matching, and crash recovery. |
| `scripts/hooks/subagent-stop.test.js` | Modify | Integration tests for SubagentStop delegating to `PhaseCompletionReducer` with prefixed agents. |

## Interfaces / Contracts

### 1. Versioned Result Envelope v1 Payload (`schemas/kernel/result-envelope/v1/envelope.schema.json`)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://openspec.io/schemas/kernel/result-envelope/v1.schema.json",
  "title": "ResultEnvelopeV1",
  "type": "object",
  "required": [
    "schema_version",
    "status",
    "executive_summary",
    "artifacts",
    "next_recommended",
    "risks",
    "skill_resolution"
  ],
  "properties": {
    "schema_version": { "type": "integer", "const": 1 },
    "status": { "type": "string", "enum": ["success", "partial", "blocked"] },
    "executive_summary": { "type": "string", "minLength": 1 },
    "detailed_report": { "type": "string" },
    "artifacts": {
      "oneOf": [
        { "type": "string", "const": "inline" },
        { "type": "array", "items": { "type": "string" } }
      ]
    },
    "next_recommended": { "type": "string", "minLength": 1 },
    "risks": {
      "oneOf": [
        { "type": "string", "minLength": 1 },
        { "type": "array", "items": { "type": "string" } }
      ]
    },
    "skill_resolution": {
      "type": "string",
      "enum": ["injected", "fallback-registry", "fallback-path", "none"]
    },
    "key_decisions": {
      "type": "array",
      "maxItems": 3,
      "items": { "type": "string", "minLength": 1 }
    },
    "assumptions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "phase", "statement", "reversibility", "basis"],
        "properties": {
          "id": { "type": "string" },
          "phase": { "type": "string" },
          "statement": { "type": "string" },
          "reversibility": { "type": "string", "enum": ["low", "high"] },
          "basis": { "type": "string" }
        }
      }
    },
    "blocker_type": {
      "type": "string",
      "enum": [
        "needs_user_decision",
        "design-mismatch",
        "spec-change-required",
        "workload-escalation"
      ]
    },
    "question_gate": {
      "type": "object",
      "required": ["reason", "questions"],
      "properties": {
        "reason": { "type": "string" },
        "questions": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["header", "question", "options"],
            "properties": {
              "header": { "type": "string" },
              "question": { "type": "string" },
              "options": {
                "type": "array",
                "items": {
                  "type": "object",
                  "required": ["label"],
                  "properties": {
                    "label": { "type": "string" },
                    "description": { "type": "string" },
                    "recommended": { "type": "boolean" }
                  }
                }
              },
              "multiSelect": { "type": "boolean" },
              "allowFreeformInput": { "type": "boolean" }
            }
          }
        }
      }
    },
    "residual_ambiguity": { "type": "boolean" },
    "public_contract_questions": { "type": "array", "items": { "type": "string" } },
    "conflicting_requirements": { "type": "array", "items": { "type": "string" } },
    "missing_acceptance_criteria": { "type": "array", "items": { "type": "string" } }
  },
  "additionalProperties": true
}
```

### 2. Decoupled Human Renderer Interface (`scripts/lib/result-envelope.js`)

```javascript
/**
 * Renders a validated result-envelope/v1 payload into human-readable markdown.
 * Read-only: never mutates envelope.
 *
 * @param {object} envelope - Validated result-envelope/v1 payload
 * @param {object} [options] - Optional formatting overrides
 * @returns {string} Human-facing Markdown text
 */
function renderEnvelopeToMarkdown(envelope, options = {}) {
  // Deterministic formatting of status, summary, artifacts, next steps, risks,
  // key decisions, assumptions, and question gate (if blocked).
}
```

### 3. Legacy Envelope Adapter (`scripts/lib/result-envelope.js`)

```javascript
/**
 * Normalizes unversioned JSON fences, legacy field names, or prose envelopes
 * into a canonical result-envelope/v1 payload.
 *
 * @param {string|object} rawInput - Text containing envelope or parsed object
 * @returns {{ok: boolean, envelope?: object, errors?: string[]}}
 */
function adaptLegacyEnvelope(rawInput) {
  // 1. If parsed and schema_version === 1 -> return as-is.
  // 2. If unversioned fence -> map summary -> executive_summary, set schema_version = 1.
  // 3. If prose-adjacent lines -> regex extract status, summary, artifacts, etc.
  // 4. Return structured outcome without throwing.
}
```

### 4. Pure PhaseCompletionReducer (`scripts/lib/lifecycle-kernel/phase-completion-reducer.js`)

```javascript
/**
 * Computes next change state and effects from current state and phase completion payload.
 * Pure function: zero I/O, deterministic, no synthetic approvals or gate passes.
 *
 * @param {object} currentState - Current state (parsed state.yaml or lifecycle node graph)
 * @param {object} payload - Validated result-envelope/v1 payload with phase context
 * @param {object} [options] - Options ({ now?: string, expectedRevision?: number })
 * @returns {{
 *   ok: boolean,
 *   state: object,
 *   effects: Array<{ kind: string, payload: object }>,
 *   events: Array<{ kind: string, subject: string, payload: object }>,
 *   outcome: "advanced" | "blocked" | "noop-replay" | "cas-conflict",
 *   code?: string
 * }}
 */
function reducePhaseCompletion(currentState, payload, options = {}) {
  // 1. Verify replay: if payload hash matches prior applied hash, return outcome: "noop-replay".
  // 2. Verify CAS: if expectedRevision is provided and currentState.revision !== expectedRevision,
  //    return outcome: "cas-conflict", code: "cas_conflict".
  // 3. Drop/ignore uncommitted approval claims in payload.
  // 4. Purely project phases.{phase}, top-level status, and blocking_questions.
  // 5. Emit state persist effect and journal events.
}
```

### 5. Mechanical State Projection (`scripts/lib/ospec-state.js`)

```javascript
/**
 * Executes locked, atomic state projection for a phase completion envelope.
 *
 * @param {object} params
 * @param {string} params.changePath - Path to change directory containing state.yaml
 * @param {string} params.phase - Phase key (e.g. "design", "apply")
 * @param {object} params.envelope - Validated result-envelope/v1 payload
 * @param {number} [params.expectedRevision] - Optional revision for CAS verification
 * @returns {Promise<{ ok: boolean, outcome: string, state?: object, error?: string }>}
 */
async function projectPhaseCompletion({ changePath, phase, envelope, expectedRevision }) {
  // withFileLock(statePath) -> recoverOrphanBak() -> readState() ->
  // reducePhaseCompletion() -> writeFileAtomic()
}
```

## Testing Strategy

| Requirement / quality concern | Trigger and conditions | Expected response | Verification |
|---|---|---|---|
| REQ-skills-018: v1 envelope validation | `validateEnvelope` receives payload with `schema_version: 1` and all required fields | `valid: true`, `errors: []` | Unit tests in `scripts/lib/result-envelope.test.js` |
| REQ-skills-018: Blocked envelope validation | Envelope has `status: "blocked"` and `question_gate` with options | Passes validation; missing `question_gate` rejected | Unit test in `scripts/lib/result-envelope.test.js` |
| REQ-skills-018: Spec ambiguity signals | `sdd-spec` completes with `status: "success"` and ambiguity signals | Passes in canonical order; malformed types rejected | Unit test in `scripts/lib/result-envelope.test.js` |
| REQ-skills-019: Decoupled human renderer | `renderEnvelopeToMarkdown` receives valid success or blocked envelope | Outputs formatted markdown without mutating input payload | Unit tests comparing markdown output and object deep-equality |
| REQ-lifecycle-kernel-030: Legacy adapter | Unversioned JSON fence or prose-adjacent return passed to `adaptLegacyEnvelope` | Normalizes to valid `result-envelope/v1` with `schema_version: 1` | Unit test with fixture returns in `result-envelope.test.js` |
| REQ-lifecycle-kernel-028: Pure state advance | `reducePhaseCompletion` processes valid design success envelope | Projects `phases.design.status: "done"`, `summary`, and `artifacts` | Unit tests in `phase-completion-reducer.test.js` |
| REQ-lifecycle-kernel-028: Blocked reduction | `reducePhaseCompletion` processes `status: "blocked"` with questions | Top-level state becomes `blocked`; phase status not set to `done` | Unit test in `phase-completion-reducer.test.js` |
| REQ-lifecycle-kernel-028: Approval rejection | Envelope claims uncommitted user approval or synthetic gate pass | Reducer drops claim; does not record approval in state | Unit test verifying `state.approvals` is unmutated |
| REQ-lifecycle-kernel-029: CAS conflict | Commit attempt with expected revision $R$ against storage head $R+1$ | Fails closed with CAS conflict; state unmutated | Unit test in `phase-completion-reducer.test.js` and `ospec-state.test.js` |
| REQ-lifecycle-kernel-029: Replay idempotency | Identical phase completion payload replayed against projected state | `outcome: "noop-replay"`, no duplicate journal records, zero delta | Unit test verifying identical state digest |
| REQ-lifecycle-kernel-029: Interrupted write recovery | Interrupted write leaves `state.yaml.bak` orphaned | `recoverOrphanBak` restores original state cleanly | Unit test in `ospec-state.test.js` |
| REQ-hooks-023: SubagentStop projection | Finished subagent emits valid envelope | `SubagentStop` projects `state.yaml` via reducer under lock | Integration test in `scripts/hooks/subagent-stop.test.js` |
| REQ-hooks-023: SubagentStop fail-safe | State file unreadable or reducer throws during `SubagentStop` | Error logged fail-safely; hook emits `{"continue": true}` | Integration test in `scripts/hooks/subagent-stop.test.js` |
| REQ-hooks-015: Host-prefixed fail-closed spec | `plugin-host:sdd-spec` emits success without ambiguity signals | Canonical agent resolves to `sdd-spec`; dispatch status is `"blocked"` | Integration test in `subagent-stop.test.js` |
| REQ-kernel-contract-schemas-031: Schema fixtures | Kernel schema validator tests fixtures against `envelope.schema.json` | Valid fixtures pass; invalid fixtures fail with expected errors | Fixture tests in `scripts/lib/kernel-schema-fixtures.test.js` |

## Migration / Rollout

1. **Step 1: Schema Registration & Pure Libraries**: Register `schemas/kernel/result-envelope/v1/envelope.schema.json` in `manifest.json` and `contract-claims.json`. Implement pure functions in `scripts/lib/result-envelope.js` and `scripts/lib/lifecycle-kernel/phase-completion-reducer.js`.
2. **Step 2: Projection Integration**: Implement `projectPhaseCompletion` in `scripts/lib/ospec-state.js`. Update `scripts/hooks/subagent-stop.js` to route through `projectPhaseCompletion`. Retain `setPhaseSummary` as fallback to ensure legacy calls remain operational.
3. **Step 3: Protocol & Prompt Alignment**: Update `skills/_shared/sdd-phase-common.md` to mandate `result-envelope/v1` emission and prohibit direct agent writes to `state.yaml`.
4. **Rollback Plan**: `adaptLegacyEnvelope` provides 100% backward compatibility. If `projectPhaseCompletion` encounters unexpected issues, fallback toggle to `setPhaseSummary` in `SubagentStop` restores previous behavior without invalidating existing `state.yaml` files.

## Open Questions

None. All interfaces and requirements are strictly allocated across the affected modules.
