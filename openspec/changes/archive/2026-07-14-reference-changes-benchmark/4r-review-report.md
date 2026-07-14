# 4R Review Report

Date: 2026-07-12T18:40:49Z
Scope: final diff of `reference-changes-benchmark`
Outcome: BLOCKED pending user decision

## Summary

- BLOCKER: 2
- CRITICAL: 0
- WARNING: 5
- SUGGESTION: 1

The two BLOCKER findings independently identify the same root defect: `scripts/evals/simulate-live-runs.js` fabricates completion markers, verified state, fixed telemetry and zero-defect observations without executing live orchestrator sessions. `scripts/evals/run.js` accepts those artifacts and generates `scripts/evals/reports/reference-baseline.md`, contrary to the live-execution MUST in the change spec.

## Risk

### BLOCKER — fabricated live evidence accepted as baseline

- Affected: `scripts/evals/simulate-live-runs.js`, `scripts/evals/run.js`, `scripts/evals/reports/reference-baseline.md`, `openspec/changes/reference-changes-benchmark/verify-report.md`
- Evidence: `simulate-live-runs.js:63-104` writes completion markers, `status: verified`, constant telemetry and zero defects without a live session; `run.js:295-296,369-389` accepts those artifacts. This contradicts `specs/orchestrator-evals/spec.md:76`.
- Impact: future cost and quality comparisons would be based on invented evidence.

### WARNING — uncontained change path

- Affected: `scripts/evals/simulate-live-runs.js`
- Evidence: `manifest.benchmark.change` is joined into output paths without an equivalent containment guard.
- Impact: a manipulated fixture can write outside its benchmark workspace.

## Reliability

### BLOCKER — 9/9 does not exercise the real orchestrator

- Affected: `scripts/evals/simulate-live-runs.js`, `scripts/evals/run.js`, benchmark fixtures, `scripts/evals/reports/reference-baseline.md`
- Evidence: fabricated markers and telemetry satisfy `scoreBenchmark()` without a live invocation.
- Impact: the baseline does not measure production behavior.

### WARNING — CLI instruction test can skip the target branch

- Affected: `scripts/evals/run.test.js`, `scripts/evals/run.js`
- Evidence: the test accepts either the expected instruction or `PASS docs-one-file` while reusing shared `.runs` state.
- Impact: the incorrect CLI verb can regress without a failing test.

## Readability

### WARNING — unexplained fixed telemetry

- Affected: `scripts/evals/simulate-live-runs.js`
- Evidence: `generateCostRows()` hard-codes phase sequences, token counts, duration and tier without explaining their source.
- Impact: maintainers cannot distinguish contract values from assumptions.

## Resilience

### WARNING — premature completion markers

- Affected: `scripts/evals/simulate-live-runs.js`
- Evidence: completion markers are written before all required evidence, without staging or rollback.
- Impact: partial failures leave an inconsistent workspace.

### WARNING — non-atomic baseline replacement

- Affected: `scripts/evals/run.js`, `scripts/evals/reports/reference-baseline.md`
- Evidence: the baseline is overwritten directly rather than via temporary file plus atomic rename.
- Impact: a write failure can destroy the previous valid baseline.

### SUGGESTION — silent Git fallback

- Affected: `scripts/evals/run.js`
- Evidence: `git rev-parse` failures are converted to `unknown` by an undocumented empty catch.
- Impact: operational failures are indistinguishable from an unavailable revision.

## Skill Resolution

All four reviewers reported `skill_resolution: injected`.

## Selective re-review — 2026-07-12T19:43:21Z

Selection rationale: the user explicitly requested a bounded re-review of only the two dimensions that owned the original BLOCKER findings. Therefore only `review-risk` and `review-reliability` reviewed the final remediation diff; readability and resilience were intentionally not rerun.

Outcome: **BLOCKED** — 2 BLOCKER findings (one shared root cause), 0 CRITICAL, 0 WARNING, 0 SUGGESTION.

Resolved evidence:

- The simulator and fabricated baseline are absent.
- `manifest.benchmark.change` is confined before filesystem writes.
- The CLI pending-instruction test is isolated from shared `.runs` state.
- Missing O1 fails closed; completion ordering and atomic baseline publication are covered.

Remaining shared BLOCKER:

- Affected: `scripts/evals/run.js`, `scripts/evals/lib/benchmark.js`, `scripts/evals/run.test.js`, `scripts/evals/live-driver.js`.
- Evidence: `scoreBenchmarkWorkspace()` validates the declared shape of `benchmark.json`, accepts structurally valid O1 and state, but does not open `codex-events.jsonl`, recalculate `provenance.transcript_sha256`, or bind the declared session id/O1 to that transcript. The existing incomplete-evidence test uses synthetic provenance and O1 and fails only because verified state is absent.
- Impact: a replay or synthesized workspace can still present plausible provenance, verified state, O1 and observations, pass scoring, and enable a baseline without a real live session.

Both selective reviewers reported `skill_resolution: injected`.

## Phase 7 selective re-review — 2026-07-12T20:05:07Z

Selection rationale: only `review-risk` and `review-reliability` were rerun because the user explicitly bounded remediation review to the dimensions owning the provenance BLOCKER. Readability and resilience were not dispatched.

Outcome: **BLOCKED** — 3 BLOCKER findings across two reviewers, 0 CRITICAL, 0 WARNING, 0 SUGGESTION.

Phase 7 successfully added transcript path confinement, byte-level SHA-256 recalculation, session/CLI/usage consistency checks, fail-closed O1 validation and regression coverage. However, the re-review demonstrated that these checks establish internal consistency rather than authenticity:

1. `parseCodexTranscript()` accepts a synthetic or replayed `thread.started` + `turn.completed.usage` pair; a self-consistent transcript, hash and session id can therefore pass without a verifiable live origin.
2. Canonical O1 rows are checked independently from the transcript and do not carry a session id, transcript hash or event identifier. Synthetic or unrelated O1 can therefore be combined with a self-consistent transcript.
3. Existing tests construct these artifacts and reach PASS, proving the acceptance gap rather than merely hypothesizing it.

The path-traversal, stateful CLI, atomic publication and missing-O1 fail-closed findings remain resolved. The remaining remediation requires a trusted provenance root or a contract change that cryptographically/structurally binds session events and O1 at emission time; scorer-only self-declarations are insufficient.

Both reviewers reported `skill_resolution: injected`.

## Phase 8 selective re-review — 2026-07-12T20:34:05Z

Selection rationale: per explicit user scope, only `review-risk` and `review-reliability` reviewed the complete Phase 8 root-of-trust delta, including Node scoring/capability logic, Node and Go hook binding parity, and their tests. Readability and resilience were not dispatched.

Outcome: **CLEAN** — 0 BLOCKER, 0 CRITICAL, 0 WARNING, 0 SUGGESTION.

- `review-risk`: No findings.
- `review-reliability`: No findings.
- Both reviewers reported `skill_resolution: injected`.

This closes the code-review BLOCKERs for Phase 8. It does not make the change archive-ready: the current host still reports `unsupported-host-binding`, the manual fixture still lacks authentic O1 `phase-costs.jsonl`, and no 9/9 baseline exists.
