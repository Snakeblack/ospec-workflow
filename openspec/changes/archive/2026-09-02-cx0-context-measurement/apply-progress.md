# Apply Progress: CX0 Context Measurement

## Batch 1 — tasks 1.1–4.3

- [x] 1.1–1.6 — Added the closed v1 schema, machine-readable advisory hypothesis registry, committed fixtures, and the pure normalization/validation/KPI/aggregation library. `amplification/v1` is available only for complete compatible components and uses `(unique_context + duplicated_context) / unique_context`.
- [x] 2.1–2.5 — Added a locked, newline-terminated `.ospec/session/{change}/context-measurements.jsonl` append path. `SubagentStop` emits CX0 strictly after O1 in its own fail-safe boundary; O1 estimates are never reclassified as observed CX0 evidence.
- [x] 3.1–3.4 — Added canonical cohort sorting, nearest-rank P50/P90, rejected-row reporting, source/coverage counts, and advisory-only hypothesis reporting. Existing benchmark scoring exports are unchanged.
- [x] 4.1 and 4.3 — Focused suites completed: `node --test scripts/lib/context-measurement.test.js scripts/lib/ospec-state.test.js scripts/hooks/subagent-stop.test.js scripts/evals/lib/benchmark.test.js` (141 passing). The report is explicitly advisory, coverage-aware, and formula-versioned.
- [~] 4.2 — `npm test` was executed and failed outside the CX0 contract: concurrent K6d schema enum declarations fail `k1-schema-compat`, and the inherited K1 frozen-inventory guard rejects both K6d and CX0 new paths. No focused CX0 test failed; keep the full-suite task pending until the shared/K1 failures are reconciled.

## Scope and verification

- Delivery: `size:exception` accepted by the maintainer.
- CX0-owned code change: approximately 430 added/modified lines plus schemas and fixtures, below the 650–850 line forecast.
- K6d files, authority, gates, route selection, budgets, defaults, and release policy were not edited by this batch.
- The only deliberate fallback is `unavailable` with a stable reason code; it is never coerced into a numeric measurement.

## Batch 2 — shared regression reconciliation for task 4.2

- [x] Registered only `scripts/lib/context-measurement.js` and `scripts/lib/context-measurement.test.js` as post-K1 successor paths in `scripts/lib/k1-scope-guard.test.js`; the thirteen K6d registrations were preserved unchanged.
- [x] `node --test scripts/lib/k1-scope-guard.test.js` — 5 passing.
- [x] `npm test` — passed (terminal exit code 0).

The full suite now verifies O1 compatibility and the concurrent K6d/CX0 scope. CX0 remains additive and advisory-only.

## Batch 3 — frozen verify remediation (CX0-V001 to CX0-V003)

- [x] CX0-V001 — Registry descriptors now require stable IDs, formula versions and advisory metadata; aggregation calculates `duplication-share/v1` and `fallback-rate/v1` from their canonical components instead of reusing amplification.
- [x] CX0-V002 — The v1 JSON Schema now closes dimensions, metric unions, sources, coverage and fallback codes. Added the frozen valid/degraded and invalid named fixtures plus schema coverage.
- [x] CX0-V003 — `uncached_input_tokens` is runtime-derived with two-component coverage, fallback preserves the most specific reason, and the hook validates the normalized record before append.
- [x] Frozen validation recipes: 30 passing (`CX0-V001`), 2 passing (`CX0-V002`), and 59 passing (`CX0-V003`).
- [x] Candidate successor freeze / verify handoff: verified with version 2.56.7 content-addressed Candidate recovery.
- [x] Stable REQ IDs added to CX0 test suites (`[REQ-context-measurement-001..004]`, `[REQ-hooks-017]`).
