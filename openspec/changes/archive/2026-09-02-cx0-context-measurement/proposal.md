# Proposal: CX0 Context Measurement

## Intent

Establish trustworthy, non-authoritative context telemetry before optimizing transport. CX0 will replace incomplete zero-filled history with measurements that expose provenance and coverage, then test the roadmap hypotheses without creating gates.

## Scope

### In Scope
- Versioned input/cached/uncached/output tokens, artifact reads/writes, tool output, unique/duplicated context, amplification, and reason-coded fallback.
- Per-field source (`host-observed`, `runtime-derived`, `estimated`) and coverage; unavailable data is never an evidentiary zero.
- Reproducible P50/P90 by phase, classification, profile, and host, with Candidate binding when observable.
- Backward-compatible, non-authoritative phase-cost telemetry.

### Out of Scope
- Projection, compaction, dispatch, or `full → compiled-*` promotion (CX3+).
- Gates, budget/default changes, or promotion decisions.
- Changes to semantic authorities or K6d contracts and critical-path position.

## Capabilities

### New Capabilities
- `context-measurement`: Versioned records, provenance/coverage, context KPIs, cohort aggregation, and hypothesis comparison.

### Modified Capabilities
- `hooks`: Extend host/runtime collection and durable emission while preserving fail-safe behavior.
- `orchestrator-evals`: Produce coverage-aware cohort P50/P90 reports.

## Approach

Define telemetry outside semantic artifacts, normalize observations at the hook boundary, derive KPIs only from covered inputs, and aggregate immutable records deterministically. Preserve legacy readers; reports compare cohorts with CX hypotheses without pass/fail.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `schemas/telemetry/context-measurement/` | New | Versioned records and fixtures |
| `scripts/hooks/subagent-stop.js` | Modified | Collection and normalization |
| `scripts/lib/ospec-state.js` | Modified | Durable compatible rows |
| `scripts/evals/lib/benchmark.js` | Modified | KPIs and percentiles |
| `scripts/**/*.test.js` | Modified | Contract and degradation tests |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Unequal host detail | High | Field-level source and coverage |
| Derived metrics overstate savings | Med | Version formulas; retain raw components |
| Cost or content exposure | Med | Store bounded counts/digests, not payloads |

## Rollback Plan

Disable the new emitter/report, retain legacy parsing, and ignore CX0 records. Semantic state and defaults require no reversal.

## Dependencies

- Existing `SubagentStop` observability and live host bindings.
- CX boundaries; K6d remains parallel and independent.

## Success Criteria

- [ ] Fixtures enforce version, source, coverage, dimensions, and fallback reasons.
- [ ] Supported fields distinguish token, artifact, tool, and context metrics; unsupported fields remain unavailable.
- [ ] Deterministic P50/P90 slice by phase, classification, profile, and host with cohort coverage.
- [ ] Reports ratify or correct every CX0 hypothesis without gates.
- [ ] Authorities, assurance, route-critical behavior, and legacy compatibility remain unchanged.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST.
