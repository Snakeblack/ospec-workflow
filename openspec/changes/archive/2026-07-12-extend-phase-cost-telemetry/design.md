# Design: Per-dispatch Phase Cost Telemetry (O1)

## Technical Approach

Use `SubagentStop` as the single writer for a complete, best-effort JSONL record per `sdd-*` dispatch. JS and Go normalize raw host input into the same internal dispatch context, derive tier from bundled `models.yaml`, and append under one advisory-lock transaction. This extends C3 without migration: readers accept its `est_tokens` as legacy output tokens.

`sdd-archive` remains a consumer of session data. Its Cost block parses what it can, aggregates only observed phases, and never affects archive close gates. This allocates every MUST scenario in `hooks` REQ-hooks-001/E1 and `agents` REQ-agents-001.

## Architecture Decisions

### Decision: Normalize into one runtime-owned dispatch context

**Choice**: Both runtimes construct the same `DispatchCostContext` before creating a record. Per category, valid host integers win; otherwise use `ceil(utf8Bytes(segment)/4)`; missing or invalid input is zero. Context aliases are resolved in this order:

| Canonical value | Integer sources (first valid wins) | Segment sources for heuristic |
|---|---|---|
| prompt | `telemetry.estimated_prompt_tokens`, `estimated_prompt_tokens`, `usage.prompt_tokens` | `telemetry.prompt`, `prompt` |
| artifact | `telemetry.estimated_artifact_tokens`, `estimated_artifact_tokens`, `usage.artifact_tokens` | `telemetry.artifact`, `artifact` |
| tool output | `telemetry.estimated_tool_output_tokens`, `estimated_tool_output_tokens`, `usage.tool_output_tokens` | `telemetry.tool_output`, `tool_output` |
| output | `telemetry.estimated_output_tokens`, `estimated_output_tokens`, `usage.output_tokens` | `telemetry.output`, then existing `RESULT_FIELDS` resolution |

`duration_ms` is the first valid non-negative integer from `telemetry.duration_ms` then `duration_ms`; otherwise zero. The normalizer accepts only finite integers >= 0. New rows always use the four heuristic `estimated_*` fields, never C3 `est_tokens`.

**Alternatives considered**: Count the complete raw hook payload as one output value; or require a writer per host.

**Rationale**: This keeps host aliases at the boundary, preserves the existing result-payload fallback, and gives JS/Go one testable semantic contract without exact tokenization or target-specific branches.

### Decision: The phase-cost writer owns relaunch classification atomically

**Choice**: Change `appendPhaseCost` / `Store.AppendPhaseCost` so their locked callback reads existing JSONL rows for the requested phase, sets `relaunch` on the supplied normalized record, then appends before releasing the existing advisory lock. A parseable earlier record with the same `phase` makes the new row a relaunch; malformed lines are ignored. An append error leaves no consumed first position.

**Alternatives considered**: Calculate relaunch before calling the writer; or infer it only during archive.

**Rationale**: Counting before the append races concurrent dispatches. Keeping read/classify/append in the lock boundary satisfies clarify-002 while retaining the repository's current advisory-lock convention.

### Decision: Resolve model tier from a runtime-bundled model configuration

**Choice**: Ship `models.yaml` with generated targets. The launcher supplies its plugin root to the Go binary through `OSPEC_PLUGIN_ROOT`; Node derives the same root from its hook location. Small JS/Go readers resolve `models.agents[agent]`, then `_default`, and accept a tier only when it exists under `tiers`; any load, parse, or lookup failure is `"unknown"`.

**Alternatives considered**: Trust a host-provided tier; embed tier maps in both runtimes; or use the generator-only model resolver.

**Rationale**: `models.yaml` is authoritative but is not currently included in the runtime tree, and generator modules are deliberately excluded from it. Bundling the source file plus a minimal reader maintains one source of truth for Node fallback and the Go path.

## Data Flow

```text
raw host SubagentStop input
          |
          +--> persistResultEnvelope (unchanged, fail-safe)
          |
          v
normalize DispatchCostContext ----> tier reader (models.yaml)
          |                                      |
          +-------------- complete normalized record
                                               |
                                               v
  phase-costs.jsonl advisory lock: read same-phase rows -> set relaunch -> append
                                               |
                                               v
              .ospec/session/{change}/phase-costs.jsonl
                                               |
                                               v
        sdd-archive parses rows + state.gates.*.questions_asked
                                               |
                                               v
                        archive-report.md ## Cost
```

The hook runs this after envelope persistence and before existing skill-resolution logic. The telemetry branch stays inside its current fail-safe boundary: no active change, malformed context, model lookup failure, lock/read/append failure, or timestamp failure changes stdout or `continue: true`.

New JSONL contract (member order is not contractual):

```json
{
  "phase": "design",
  "agent": "sdd-design",
  "estimated_prompt_tokens": 120,
  "estimated_artifact_tokens": 80,
  "estimated_tool_output_tokens": 30,
  "estimated_output_tokens": 240,
  "duration_ms": 18000,
  "model_tier": "premium",
  "status": "success",
  "relaunch": false,
  "ts": "2026-07-11T13:20:53.000Z"
}
```

`status` remains valid result-envelope status, then non-blank dispatch `status`, then `"unknown"`. Each runtime emits ISO-8601 UTC `ts`; parity compares every other field semantically and ignores JSON member order.

For archive, parse only JSON objects with a non-empty `phase`. Sort observed phase names and distinct tier/status sets for deterministic rendering. Sum valid non-negative integer new fields; if `estimated_output_tokens` is absent or invalid, use legacy `est_tokens` once. Missing duration is zero, tier/status is `unknown`, and relaunch is false. Sum numeric `gates.*.questions_asked`. If no parseable phase rows remain, render `no-data` with the question total and no invented rows. Cost-data errors are report-only.

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/hooks/subagent-stop.js` | Modify | Normalize context, resolve tier, write the complete record while preserving fail-safe ordering. |
| `internal/hooks/subagentstop.go` | Modify | Semantic Go mirror of normalization, tier resolution, and record contract. |
| `scripts/lib/ospec-state.js` | Modify | Make phase-cost read/classify/append one advisory-lock operation. |
| `internal/store/store.go` | Modify | Provide the equivalent locked phase-cost append operation. |
| `scripts/lib/artifact-store.js` | Modify | Forward the revised phase-cost writer surface. |
| `scripts/hooks/ospec-hooks-launch.js` | Modify | Pass plugin root to compiled hooks for model-config resolution. |
| `scripts/hooks/lib/model-tier.js` | Create | Minimal runtime Node `models.yaml` reader and agent-tier resolver. |
| `internal/modelconfig/models.go` | Create | Minimal Go mirror for `models.yaml` tier resolution. |
| `scripts/configure/cli.js` | Modify | Include `models.yaml` in every generated runtime tree. |
| `skills/sdd-archive/SKILL.md` | Modify | Replace C3 Cost instructions with O1 aggregation/rendering. |
| `scripts/hooks/subagent-stop.test.js`, `scripts/lib/ospec-state.test.js` | Modify | JS RED/GREEN coverage for normalization, lock atomicity, and fallbacks. |
| `internal/hooks/subagentstop_test.go`, `internal/store/store_test.go`, `internal/modelconfig/models_test.go` | Modify/Create | Go mirror and model-config tests. |
| `scripts/hooks/parity-contract.test.js`, `internal/hooks/subagentstop_test.go`, `internal/testdata/parity/subagent-stop-phase-cost-active-change.json` | Modify | Compare persisted normalized fields (except `ts`) and exercise UTF-8. |
| `scripts/configure/cli.test.js` | Modify | Prove generated trees include `models.yaml`. |
| `scripts/cost-block-contract.test.js` | Modify | Pin expanded Cost instructions and `gates.*.questions_asked`. |

## Interfaces / Contracts

The writer accepts a fully normalized record but assigns `relaunch` while locked:

```text
appendPhaseCost(workspace, changeName, normalizedRecord)
  lock phase-costs.jsonl
  parse existing lines for normalizedRecord.phase
  normalizedRecord.relaunch = priorParseableSamePhaseExists
  append JSON(normalizedRecord) + "\n"
```

The archive Cost table contains phase, invocations, re-launches, summed duration, observed tiers, observed statuses, and one independently labelled `estimated` total for each token category, followed by total questions. It is additive; no archive policy or close gate consumes these values.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| JS unit | Precedence, UTF-8 ceiling, status fallback, tier resolution, complete zero/unknown row | Add focused failing tests before helpers; run `npm test`. |
| Go unit | Same normalizer/tier/status vectors and UTC timestamp validity | Add table-driven tests first; run `go test ./...`. |
| Store concurrency | Parallel same-phase appends yield one `false`, later rows `true`; failed append does not reserve first | JS Promise and Go goroutine tests with temp session files. |
| Cross-runtime parity | Active fixture has deterministic UTF-8 context and compares persisted fields; `ts` validates as UTC | Run both fixture harnesses; parse JSON rather than compare order. |
| Archive contract | Populated O1, legacy C3/incomplete, malformed-only, and missing-file Cost instructions | Update static contract test; retain the non-gating procedure. |
| Packaging | Generated target has `models.yaml`; launcher exposes plugin root to Go | Generator and launcher unit tests. |

Strict TDD applies: each helper and lock-semantic change starts with a failing JS and/or Go test, then GREEN/refactor evidence is recorded in `apply-progress.md`.

## Migration / Rollout

No migration or feature flag. Existing `.ospec/session/*/phase-costs.jsonl` stays readable: C3 `est_tokens` maps to O1 output estimate during archive, and absent O1 fields use zero/`unknown`/false fallbacks. Rollback reverts the writer, model reader/shipping, and Cost instructions; disposable session files need no cleanup.

## Open Questions

- None.
