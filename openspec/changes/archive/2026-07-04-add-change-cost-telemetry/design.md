# Design: Per-change cost telemetry (C3)

## Technical Approach

Mirror the C5 `persistResultEnvelope` pattern exactly. Add one new pure side-effect
step, `persistPhaseCost`, to `runSubagentStop` in **both** runtimes, ordered *after*
`persistResultEnvelope` and *before* the existing `skill_resolution` evaluation. The step
resolves the active change (`findActiveChanges`), estimates tokens from the dispatch
result payload with the ~4-chars/token heuristic, derives the phase key by stripping the
`sdd-` prefix, and appends one JSONL record to `.ospec/session/{change}/phase-costs.jsonl`
under the existing advisory-lock convention. It is wrapped in a total fail-safe boundary
(`try/catch` in JS, `defer recover()` in Go) so it can never alter stdout or the exit
contract (REQ-hooks-001, §5 scenarios). `sdd-archive` reads and aggregates that file plus
`state.yaml` into a Markdown "Cost" block in the archive report (REQ-agents-001).

Two runtimes are kept in lockstep by a new parity fixture family
(`subagent-stop-phase-cost-*`) with the user-approved floor bump 2 → 4
(`clarify-fixture-floor-001`).

## Architecture Decisions

### Decision: Estimate over UTF-8 byte length, not code-unit length

**Choice**: `est_tokens = round(utf8ByteLength(payload) / 4)`. JS uses
`Math.round(Buffer.byteLength(str,"utf8")/4)`; Go uses `(len(str)+2)/4` (integer form of
`Math.round(b/4)` with .5 rounding up).
**Alternatives considered**: JS `String.length` (UTF-16 code units) vs. Go `len()` (bytes)
— the naïve reading of "~4 chars/token".
**Rationale**: `estimateTokens` in `pre-tool-use.js` already uses `bytes/4` for code files.
Using byte length in both runtimes makes `est_tokens` *identical* cross-runtime for any
payload (even non-ASCII), removing a silent parity hazard even though the fixture contract
does not assert JSONL content. Code-unit length would diverge on any non-ASCII result.

### Decision: Derive re-launch counts from `phase-costs.jsonl`; user-question counts from `state.yaml` (deferred decision — RESOLVED)

**Choice**:
- **Tokens per phase** (spec-fixed): group records by `phase`, sum `est_tokens`.
- **Re-launches per phase**: `count(records for phase) - 1`, floored at 0 — derived purely
  from `phase-costs.jsonl` (one record == one dispatch).
- **User questions**: sum of integer `phases.*.questions_asked` fields in `state.yaml`
  (missing → 0).
**Alternatives considered**: (a) a dedicated re-launch counter field in `state.yaml`;
(b) emitting a synthetic "question" event into `phase-costs.jsonl` from the hook.
**Rationale**: `phase-costs.jsonl` already holds exactly one row per dispatch, so re-launch
is *definitionally* the row-count-minus-one for a phase — no new field, single source of
truth, computed in the same pass as tokens. Questions, by contrast, are asked by the
**orchestrator**, never inside a subagent dispatch; the `SubagentStop` hook has zero
visibility into them, so recording them in `phase-costs.jsonl` would require a fabricated
event and widen the hook's scope. `state.yaml` is where the orchestrator already records
`questions_asked` (e.g. `phases.clarify.questions_asked: 1` in this very change). The spec
(REQ-agents-001) explicitly deferred this *mechanism* to design and fixed only the
report's observable content, so this is an internal-only decision — no gate. Promoted to
ADR-001 (cross-cutting: establishes how §9 metrics are derived).

### Decision: Cost block lives in the skill, agent template untouched

**Choice**: Add the Cost block procedure to `skills/sdd-archive/SKILL.md` Step 3 only.
`agents/sdd-archive.agent.md` is a thin pointer ("follow the skill exactly") and needs no
edit.
**Rationale**: Keeps the change out of any orchestrator-adjacent prompt (< 500-line guard),
matching the proposal's mitigation. No `skills/_shared/` extraction needed.

### Decision: Active-change parity fixture uses a dedicated openspec-bearing workspace

**Choice**: Add a second placeholder token `__SUBAGENT_STOP_PHASE_COST_WORKSPACE__`
resolved by both harnesses to a new checked-in workspace
`internal/testdata/parity/subagent-stop-phase-cost-workspace/` that contains an active
change (`openspec/changes/demo/state.yaml`, `status: active`). The no-active-change fixture
reuses the existing openspec-free `__SUBAGENT_STOP_FIXTURE_WORKSPACE__`.
**Alternatives considered**: reuse the shared openspec-free workspace for both (then both
fixtures are identical and the active path is never exercised); point at the repo root
(README forbids it — would mutate this change's own `state.yaml`).
**Rationale**: The hook's write lands in `.ospec/session/demo/phase-costs.jsonl`, which is
git-ignored (`.gitignore` line 4 `.ospec/`), so repeated test runs never pollute git. The
fixture stdin carries **no** valid result-envelope fence, so `persistResultEnvelope`
no-ops and the *tracked* `state.yaml` stays byte-for-byte pristine. Both fixtures still
assert only `{"continue":true}` byte-for-byte; write behavior is proven by unit tests.

## Data Flow

```
subagent result (stdin JSON)
        │
        ▼
runSubagentStop
  ├─ persistResultEnvelope   (C5, unchanged) ──► state.yaml (summary)
  ├─ persistPhaseCost  (NEW) ─────────────────┐
  │     resolveAgentName → require "sdd-"      │
  │     estimateTokens(payload bytes / 4)      │  advisory lock
  │     resolveDispatchStatus                  ▼
  │     appendPhaseCost ──► .ospec/session/{change}/phase-costs.jsonl
  └─ skill_resolution eval   (unchanged) ──► stdout {"continue":true}

                (later, separate run)
sdd-archive Step 3
  read phase-costs.jsonl  ─┐
  read state.yaml         ─┴─► aggregate ──► "Cost" block in archive-report.md
```

`phase-costs.jsonl` record shape (one line per dispatch):

```json
{"phase":"design","agent":"sdd-design","est_tokens":128,"status":"success","ts":"2026-07-04T15:00:00.000Z"}
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/hooks/subagent-stop.js` | Modify | Add `persistPhaseCost`, `estimateResultTokens`, `resolveDispatchStatus`; call after `persistResultEnvelope`; export new fns |
| `internal/hooks/subagentstop.go` | Modify | Port the same three helpers; call in `runSubagentStop` after `persistResultEnvelope` |
| `scripts/lib/ospec-state.js` | Modify | Add `PHASE_COST_FILE_NAME` + `appendPhaseCost({workspace,changeName,record})` (mirrors `appendRuntimeEvent`, but under `session/{change}/`); export both |
| `scripts/lib/artifact-store.js` | Modify | Surface the phase-cost session path resolver in the derived layout (single source of truth) |
| `internal/store/store.go` | Modify | Add `PhaseCostFileName` const, `SessionPhaseCostPath(changeName)`, `AppendPhaseCost(changeName, line)` (advisory-locked append) |
| `internal/testdata/parity/subagent-stop-phase-cost-active-change.json` | Create | Active-change fixture (new workspace token, no envelope fence) |
| `internal/testdata/parity/subagent-stop-phase-cost-no-active-change.json` | Create | No-active-change fixture (reuses openspec-free token) |
| `internal/testdata/parity/subagent-stop-phase-cost-workspace/openspec/changes/demo/state.yaml` (+ `openspec/config.yaml`) | Create | Checked-in workspace with one active change |
| `internal/testdata/parity/README` | Modify | SubagentStop floor 2→4; document phase-cost fixtures + new workspace token |
| `scripts/hooks/parity-contract.test.js` | Modify | SubagentStop `floor: 2→4`; `prepareStdin` substitutes the second token |
| `internal/hooks/subagentstop_test.go` | Modify | Parity floor `< 2`→`< 4`; substitute second token; add `persistPhaseCost` unit tests |
| `scripts/hooks/subagent-stop.test.js` | Modify | Add `persistPhaseCost` unit tests (write on active change, skip on none, fail-safe) |
| `skills/sdd-archive/SKILL.md` | Modify | Step 3: Cost block procedure + aggregation rules + empty-data fallback |

`agents/sdd-archive.agent.md` — **no change** (delegates to the skill).

## Interfaces / Contracts

New writer (JS, `ospec-state.js`):

```js
const PHASE_COST_FILE_NAME = "phase-costs.jsonl";
// Appends one JSONL record under .ospec/session/{changeName}/, advisory-locked.
async function appendPhaseCost({ workspace, changeName, record }) { /* mkdir -p + withFileLock + appendFile */ }
```

New writer (Go, `store.go`):

```go
const PhaseCostFileName = "phase-costs.jsonl"
func (s *Store) SessionPhaseCostPath(changeName string) string
func (s *Store) AppendPhaseCost(changeName string, line []byte) error // mkdir + withLock + O_APPEND
```

Payload/status resolution (both runtimes): payload = first present `RESULT_FIELDS` value
(string as-is, else JSON-serialized); `status` = valid-envelope `status`, else top-level
`input.status`, else `"unknown"`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (JS) | `persistPhaseCost` writes a record for an active change; skips (no file, no `.ospec/`) when none; non-`sdd-` agent ignored; write/estimation error is swallowed (stdout unaffected); byte-length estimate | `subagent-stop.test.js` with `t`-scoped temp workspaces (mirror C5 envelope tests) |
| Unit (Go) | Same matrix, plus `est_tokens` equals the JS integer formula on a known payload | `subagentstop_test.go` with `t.TempDir()` |
| Parity | Two `subagent-stop-phase-cost-*` fixtures produce `{"continue":true}` byte-for-byte in both runtimes; floor ≥ 4 fails fast if the set shrinks | `parity-contract.test.js` (spawns real process) + `TestSubagentStop_ParityFixtures` |
| Integration | Archive Cost block: populated (tokens/phase, 1 re-launch for a twice-dispatched phase, 1 question), and empty-data fallback (block present, "no data") | Manual/agent walkthrough per REQ-agents-001 scenarios; assert block never gates archive |

Strict TDD: write the failing unit test (RED) per helper before implementing; parity
fixtures land with the floor bump so the suite fails until both runtimes emit the fixtures.

## Migration / Rollout

No migration. `phase-costs.jsonl` is a disposable, git-ignored session artifact; the step
is additive and gated on an active change. Rollback = delete `persistPhaseCost` from both
runtimes, remove the fixture family (restore floor to 2), drop the Cost block. `sdd-archive`
tolerates a missing/empty file, so partial-adoption changes archive cleanly.

Changed-line estimate (for `sdd-tasks`): ~5 source files (~180 lines: two hook helpers ×2
runtimes + two store writers), ~4 test files (~180 lines), 3 small fixtures/workspace
(~30 lines), 2 doc edits (~40 lines) → roughly **380–430 changed lines**. At/near the
400-line budget but the delivery strategy is approved `exception-ok` (single PR).

## Open Questions

- None. The deferred aggregation-source decision is resolved above (ADR-001).
