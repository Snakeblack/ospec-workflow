# Design: CX0 Context Measurement

## Technical Approach

CX0 adds a coverage-aware telemetry lane beside the existing O1 phase-cost lane. A shared CommonJS module owns the versioned measurement contract, normalization, KPI derivation, semantic validation, canonical serialization, cohort aggregation, and advisory hypothesis comparison. `SubagentStop` collects bounded counters and identifiers, emits O1 unchanged, then attempts one independent CX0 append. The evaluation library consumes CX0 records through explicit APIs; existing benchmark scoring remains untouched.

This is `design-after-spec`. The design implements `context-measurement`, `hooks`, and `orchestrator-evals` requirements without changing semantic state, Candidate authority, K6d contracts, dispatch, or release policy.

## Architecture Decisions

### Decision: Persist CX0 beside, not inside, legacy phase costs

**Choice**: Append immutable records to `.ospec/session/{change}/context-measurements.jsonl` through a new locked `appendContextMeasurement` primitive. Keep `phase-costs.jsonl`, its attestation, and all legacy readers byte-compatible.
**Alternatives considered**: Extend every O1 row with CX0 fields; replace O1; write telemetry into `state.yaml`.
**Rationale**: A separate append-only evidence stream prevents unavailable CX0 fields from inheriting O1 zero semantics and keeps observability outside canonical workflow state. See ADR-001.

### Decision: Use a discriminated metric envelope with formula versions

**Choice**: Define `ospec-context-measurement/v1` under `schemas/telemetry/context-measurement/`. Every metric slot is either `available` with bounded `value`, `unit`, `source`, and coverage, or `unavailable` with the expected source, coverage, and a stable `reason_code`. Raw payloads are forbidden. `uncached_input_tokens`, `unique_context`, and `duplicated_context` may be runtime-derived only from compatible covered components. `amplification/v1` is exactly `(unique_context + duplicated_context) / unique_context` and is unavailable unless both token-compatible components are complete and `unique_context > 0`.
**Alternatives considered**: Nullable numbers; zero-filled flat fields; embedding prompt/tool/artifact excerpts.
**Rationale**: The union prevents absence from becoming evidence, preserves provenance per field, and makes formula evolution explicit. See ADR-002.

### Decision: Make aggregation canonical and advisory by construction

**Choice**: Group validated records by the ordered tuple `[phase, classification, profile, host]`; sort cohorts and metric values deterministically; calculate P50/P90 with nearest-rank (`ceil(p*n)-1`); and serialize reports with the existing sorted-key `canonicalJson` pattern. Reports use `cx0-cohort-report/v1`, expose eligible/unavailable counts, source composition, formula versions, and classify each declared hypothesis as `supported`, `contradicted`, or `insufficient-evidence`. Hypothesis descriptors are data inputs to the comparer; its return value is never consumed by benchmark scoring or policy code.
**Alternatives considered**: Host-order aggregation; interpolation percentiles; direct pass/fail assertions against roadmap targets.
**Rationale**: Canonical ordering gives byte-equivalent output while API separation makes the non-authoritative boundary reviewable. See ADR-003.

## Data Flow

```text
SubagentStop input / bounded Codex token event
             |
             v
existing envelope -> existing phase-cost append
             |
             v
CX0 collector -> normalize + derive KPIs -> validate v1
             |             |
             |             `-- unavailable(reason_code) on partial data
             v
locked append: context-measurements.jsonl
             |
             v
read + validate -> canonical cohorts -> P50/P90 + coverage
                                      -> advisory hypothesis outcomes
```

Collection uses existing agent/phase resolution, active-change discovery, safe transcript handling, Codex token parsing, and host binding. Classification comes from the active change state; profile and host use bounded hook/benchmark identifiers with stable `unknown-*` identifiers when unavailable. A syntactically valid observable `candidate_id` may be copied as an optional binding; CX0 never resolves or evaluates a Candidate. Token counts are never inferred from legacy zeroes. Estimated values are admitted only when an actual bounded segment or explicit estimate exists and are labeled `estimated`.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `schemas/telemetry/context-measurement/v1.schema.json` | Create | Closed v1 record schema, metric unions, dimensions, optional Candidate binding, and fallback codes. |
| `schemas/telemetry/context-measurement/hypotheses.v1.json` | Create | Machine-readable advisory projection of every CX0 roadmap hypothesis and its cohort/reference selectors. |
| `schemas/telemetry/context-measurement/fixtures/{valid,invalid}/*.json` | Create | Full, degraded, unknown-source, missing-reason, partial-KPI, and payload-rejection fixtures. |
| `scripts/lib/context-measurement.js` | Create | Normalize/validate records, derive `amplification/v1`, canonicalize, aggregate cohorts, and compare hypotheses. |
| `scripts/lib/context-measurement.test.js` | Create | Schema/fixture, KPI, deterministic aggregation, privacy, and advisory-boundary tests. |
| `scripts/lib/ospec-state.js` | Modify | Add locked append to the separate CX0 JSONL stream without changing `appendPhaseCost`. |
| `scripts/lib/ospec-state.test.js` | Modify | Concurrency, final-newline, immutability, and write-failure coverage. |
| `scripts/hooks/subagent-stop.js` | Modify | Attempt CX0 after legacy persistence inside an independent fail-safe boundary. |
| `scripts/hooks/subagent-stop.test.js` | Modify | Host/degraded/write-failure ordering and unchanged stdout/continuation assertions. |
| `scripts/evals/lib/benchmark.js` | Modify | Read CX0 JSONL and expose deterministic report/comparison functions without scoring integration. |
| `scripts/evals/lib/benchmark.test.js` | Modify | Mixed coverage, invalid rows, P50/P90 reproducibility, and advisory isolation tests. |

No files are deleted. K6d paths are not touched.

## Interfaces / Contracts

The record has closed top-level sections: `schema`, `observed_at`, `dimensions`, optional `candidate_id`, `metrics`, and `fallback`. Required metric keys are `input_tokens`, `cached_input_tokens`, `uncached_input_tokens`, `output_tokens`, `artifact_reads`, `artifact_writes`, `tool_output_tokens`, `unique_context`, `duplicated_context`, and `amplification`. Coverage is `{ state: complete|partial|unavailable, observed, expected, ratio }`; `value` is forbidden for unavailable metrics. `fallback` is a reason-coded diagnostic with affected metric names and is never included in token totals.

The advisory registry pins stable hypothesis IDs, comparison operators, targets, metric/formula versions, and cohort/reference selectors. It is a tested projection of the roadmap table, not a policy or semantic authority. `duplication-share/v1` is report-only and equals `duplicated_context / (unique_context + duplicated_context)` for complete compatible components with a positive sum; `fallback-rate/v1` is reason-coded fallback records divided by cohort size. Input-reduction hypotheses require a compatible reference cohort and otherwise return `insufficient-evidence`.

The module exports pure `normalizeContextMeasurement`, `validateContextMeasurement`, `deriveContextKpis`, `aggregateContextMeasurements`, `loadCx0Hypotheses`, `compareCx0Hypotheses`, and `canonicalCx0Json`. Persistence exports `appendContextMeasurement({workspace, changeName, record})`. Benchmark exports `readContextMeasurements(filePath)` and `buildCx0Report(records, hypotheses)`; no existing export changes semantics.

## Requirement and Scenario Allocation

| Scenario | Component / flow | Files and tests |
|---|---|---|
| Fully observed attributable dispatch | Collector + v1 normalizer | `context-measurement.js`; full fixture and module test |
| Covered compatible amplification | KPI derivation | module test pins `amplification/v1`, source, coverage |
| Equivalent cohort percentiles | Canonical aggregator | benchmark deterministic-order/byte-equivalence test |
| All metric values unavailable | Aggregator unavailable branch | benchmark no-eligible-observation test |
| Contradicted hypothesis | Advisory comparer | benchmark contradicted/no-side-effect test |
| Legacy phase-cost remains readable | Separate stream | existing O1 tests plus compatibility regression |
| Successful hook emission | Post-O1 emitter | `subagent-stop.test.js` ordering/stdout test |
| Missing or malformed host field | Degraded normalizer | hook unavailable-with-reason test |
| CX0 durable write failure | Independent catch boundary | hook injected-write-failure test |
| Mixed-coverage cohort | Eligibility filter + coverage summary | benchmark P50/P90/count/source test |
| Invalid row is not zero | Schema + semantic validator | invalid fixture and benchmark rejection test |
| Advisory diagnostic consumption | Disconnected report API | benchmark scoring/routing immutability test |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Metric unions, bounds, compatibility, formula/reason codes, canonical ordering, nearest-rank, roadmap-registry parity, hypothesis states | Node `node:test` table tests and committed valid/invalid fixtures |
| Integration | Locked JSONL append, concurrent writers, hook ordering, host token extraction, degraded collection, write isolation | Temporary workspaces and dependency seams in existing hook/state suites |
| Regression | O1 parsing/attestation, stdout `{continue:true}`, benchmark scoring, route/authority state | Run focused suites, then `npm test`; assert CX0 APIs are not referenced from policy/routing modules |

## Migration / Rollout

No data migration is required. Deploy the schema and pure library first, then persistence, hook emission, and reporting. Existing O1 rows stay readable but are never upgraded into CX0 evidence. Rollback disables the CX0 call/read path and leaves the separate append-only file ignorable; no semantic state needs repair.

## Open Questions

None. The accepted clarification fixes the only externally material formula decision needed for design.
