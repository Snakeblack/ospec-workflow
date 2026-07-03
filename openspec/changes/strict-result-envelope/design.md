# Design: Strict Result Envelope (C5)

## Technical Approach

Turn the §D Result Contract into a machine-validatable artifact without removing its
prose. Phases append one ```` ```json:result-envelope ```` fence carrying the §D fields as
strict JSON (skills spec `REQ-skills-001`). A new dependency-free CommonJS validator
(`scripts/lib/result-envelope.js`), mirrored in Go, checks required fields, enums, and the
Assumption Entry schema and returns `{valid, errors}` — never throws. `SubagentStop` extracts
the fence (reusing the §5.2 field-search order), validates it, and — when valid — persists
`summary`/`key_decisions` into the active change's `state.yaml` before its existing
`skill_resolution` logic (hooks spec `REQ-hooks-001`). All steps are fail-safe: an
absent/malformed fence degrades to today's behavior with `{"continue":true}`. The Go mirror
(`internal/hooks/subagentstop.go` + a new validator package + a `yamllite` writer) and shared
golden fixtures enforce parity (E1 pattern). This maps directly to the proposal's additive,
fail-safe strategy and hardens C1 (the Phase Summary Block stops depending on the LLM).

## Architecture Decisions

### Decision: Concurrency / merge strategy for the state.yaml summary write

**Choice**: Non-destructive **fill-gap merge** — the hook reads `state.yaml`, and writes
`phases.{phase}.summary`/`key_decisions` **only when the current `summary` is empty/absent**;
a non-empty summary is left untouched. The read-modify-write is an atomic temp+rename replace
and is wrapped in the existing advisory file-lock primitive (`withAppendLock` generalized to
`withFileLock`, mirrored by Go `withLock`).

| Option | Trade-off | Verdict |
|--------|-----------|---------|
| Fill-gap merge + atomic write + advisory lock | Hook never clobbers an agent-written summary; lock serializes hook-vs-hook; agent writes are ordered *before* the hook fires (SubagentStop runs after the subagent turn ends) so the residual lost-update window is negligible | **Chosen** |
| Atomic last-writer-wins | Simpler, but a stale hook snapshot could overwrite a richer agent summary → violates the fixed invariant | Rejected |
| Full three-way / CRDT merge | No YAML library available (dep-free constraint); overkill for two same-source writers | Rejected |

**Rationale**: The invariant is "no already-written summary is lost." The hook's summary and
the agent's summary derive from the **same envelope**, so the hook is a safety net, not a
competing author. Guarding on a non-empty summary makes the write idempotent in the common case
and a pure gap-fill when the LLM forgot — which is the entire point of C5. The advisory lock
plus platform ordering (hook fires post-turn) close the practical race without a YAML round-trip
that would reformat the file and defeat surgical parity.

### Decision: Envelope emission as a `json:result-envelope` fenced block

**Choice**: One fence per phase return, info-string `json:result-envelope`, directly
`JSON.parse`-able, additive to the prose `executive_summary`. Optional fields omitted (never
`null`).

**Alternatives considered**: (a) replace prose with JSON — rejected, humans lose readability and
the spec forbids it; (b) a bare ```` ```json ```` fence — rejected, not disambiguable from other
JSON blocks in the return; (c) HTML comment sentinel — rejected, not a standard fence and harder
to validate.

**Rationale**: The tagged info-string gives an unambiguous, regex-cheap extraction anchor shared
by the hook and the orchestrator, with zero LLM re-interpretation.

### Decision: Shared dep-free validator, mirrored in Go, one canonical schema

**Choice**: `scripts/lib/result-envelope.js` exports `extractEnvelope(text)` and
`validateEnvelope(obj) → {valid, errors}`; a new `internal/resultenvelope` Go package mirrors it.
The single canonical schema is the existing §D field table + Assumption Entry + Blocking Question
schemas — not redefined here.

**Alternatives considered**: JSON Schema + ajv (rejected — external dep, violates the Node-22
CommonJS-no-deps constraint); inline validation inside the hook (rejected — not reusable by the
orchestrator, harder to unit-test and to mirror).

**Rationale**: A standalone module is independently testable, reusable by both the hook and any
future consumer, and gives a clean parity boundary against the Go port.

## Data Flow

    Phase agent                SubagentStop hook                        state.yaml
    ───────────                ─────────────────                        ──────────
    compose return             stdin payload
    + ```json:result-envelope  ──► extractEnvelope() (§5.2 field order)
      { status, summary, ... }      │
                                    ▼
                                validateEnvelope() ──► {valid:false} ─► skip persist ─┐
                                    │ valid                                            │
                                    ▼                                                  │
                                findActiveChanges() ─► phase key = agent − "sdd-"      │
                                    │                                                  │
                                    ▼  withFileLock + atomic replace                   │
                                fill-gap merge (summary empty? → write) ──────────────►│ phases.{phase}
                                    │                                                   .summary
                                    ▼                                                  │ .key_decisions
                                existing skill_resolution logic  ◄─────────────────────┘
                                    │
                                    ▼
                                stdout: {"continue":true[,systemMessage]}

    Orchestrator: reads the same fence as PRIMARY source; falls back to prose parse if
    the fence is absent/invalid (agents spec REQ-agents-001) — silent, non-blocking.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/result-envelope.js` | Create | `extractEnvelope` (fence regex + `JSON.parse`) + `validateEnvelope` returning `{valid, errors}`; never throws |
| `scripts/lib/result-envelope.test.js` | Create | Unit tests: valid, each missing required field, bad enum, malformed JSON, absent fence, assumptions schema |
| `scripts/lib/ospec-state.js` | Modify | Add `setPhaseSummary(content, phase, {summary, keyDecisions})` surgical YAML writer (fill-gap guard) + generalize `withAppendLock` → `withFileLock`; export both |
| `scripts/lib/ospec-state.test.js` | Modify | Cover `setPhaseSummary`: gap-fill, non-empty-guard no-op, quoting/escaping, key_decisions list |
| `scripts/hooks/subagent-stop.js` | Modify | Before `skill_resolution` logic: extract+validate fence, resolve change+phase, lock+atomic fill-gap write; fully fail-safe |
| `internal/resultenvelope/resultenvelope.go` | Create | Go mirror of extract+validate |
| `internal/resultenvelope/resultenvelope_test.go` | Create | Mirror of the JS validator unit tests |
| `internal/yamllite/yamllite.go` | Modify | Add `SetPhaseSummary` surgical writer mirroring the JS helper |
| `internal/yamllite/yamllite_test.go` | Modify | Cover `SetPhaseSummary` with the same cases as JS |
| `internal/hooks/subagentstop.go` | Modify | Go mirror of extract/validate/persist before resolution logic |
| `internal/hooks/subagentstop_test.go` | Modify | Unit coverage of persist path (mirrors JS) |
| `internal/testdata/parity/subagent-stop-valid-envelope.json` | Create | Golden fixture: valid fence → stable stdout |
| `internal/testdata/parity/subagent-stop-malformed-envelope.json` | Create | Golden fixture: fail-open fence → `continue:true` |
| `internal/testdata/parity/README` | Modify | Document the second hook + fail-open fixture rule |
| `scripts/hooks/parity-contract.test.js` | Modify | Parameterize over the fixture-family table; add `SubagentStop` floor (2) + fail-open handling |
| `skills/_shared/sdd-phase-common.md` (§D) | Modify | Specify the strict emission format + reference the canonical schema |
| `agents/sdd-orchestrator.agent.md` (Result Contract) | Modify | Consume fence fields as primary, prose as fallback |

## Interfaces / Contracts

```js
// scripts/lib/result-envelope.js
function extractEnvelope(text) // → { found: boolean, raw?: string, value?: object }
function validateEnvelope(obj) // → { valid: boolean, errors: string[] }  (never throws)

// scripts/lib/ospec-state.js  — surgical, fill-gap; returns the same content unchanged
// when phases.{phase}.summary is already non-empty (invariant guard).
function setPhaseSummary(content, phase, { summary, keyDecisions })       // → string
```

```go
// internal/resultenvelope/resultenvelope.go
func Extract(text string) (value map[string]any, found bool)
func Validate(v map[string]any) (valid bool, errs []string)
// internal/yamllite/yamllite.go
func SetPhaseSummary(content, phase, summary string, keyDecisions []string) string
```

Fence shape (canonical, exactly one per return):

```json:result-envelope
{ "status": "success", "executive_summary": "…", "artifacts": ["…"],
  "next_recommended": "sdd-tasks", "risks": "None", "skill_resolution": "injected" }
```

Validation rules: `status ∈ {success,partial,blocked}`; `executive_summary` non-empty string;
`artifacts` array or the string `"inline"`; `next_recommended` string; `risks` string or array;
`skill_resolution` non-empty string; `question_gate` object required when `status: blocked`;
`blocker_type` (when present) ∈ the §D enum; each `assumptions[]` entry has all five schema
fields non-empty with `reversibility ∈ {low,high}`. Summary is written to `state.yaml` as a
double-quoted YAML scalar (escape `"`/`\`), truncated to 160 chars per C1.

## Testing Strategy

`strict_tdd: true` — write the failing test first, then the code. Runner: `node --test` (JS),
`go test ./...` (Go).

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (JS) | `validateEnvelope` valid/each-missing-field/bad-enum/malformed; `extractEnvelope` fence present/absent; `setPhaseSummary` gap-fill vs. non-empty-guard vs. escaping | `result-envelope.test.js`, `ospec-state.test.js` |
| Unit (Go) | Byte-identical mirror of the JS validator + `SetPhaseSummary` cases | `resultenvelope_test.go`, `yamllite_test.go` |
| Integration | `subagent-stop.js` persists to a temp-workspace `state.yaml`; missing/malformed fence → no write, stdout unchanged; agent-summary-present → no overwrite | hook unit tests against a scratch `openspec/changes/*` dir |
| Parity (E2E) | Spawn real `subagent-stop.js` per fixture-family row; floor ≥ 2 for `subagent-stop-*`; byte-for-byte stdout except the documented fail-open fixture | `parity-contract.test.js` + Go `TestSubagentStop_ParityFixtures` |

**Fixture floor**: assert `subagent-stop-*.json` count ≥ 2 before running per-fixture tests
(mirrors the existing `pre-tool-use` floor of 4). Fixture `stdin.cwd` MUST point at a workspace
with no active change so persistence is a no-op — this keeps stdout stable and prevents the
parity run from mutating a real `state.yaml`.

## Migration / Rollout

No data migration — `state.yaml` shape is unchanged. Fully additive and fail-safe: partial
rollback (keep emission, disable persistence) is safe, per the proposal's rollback plan.

## Open Questions

- [ ] None. The deferred concurrency decision is resolved above (fill-gap merge + atomic write +
  advisory lock); the fixed invariant "no already-written summary is lost" is satisfied.
