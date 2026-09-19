---
name: review-runtime
description: "Runtime reliability review skill for the Quality Review Gate."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
  delegate_only: true
---

> **ORCHESTRATOR GATE**: Dispatch this skill to the dedicated `review-runtime` executor. The executor reviews directly and never delegates.

## Purpose

Review runtime behavior, persistent state, and failure paths in the assigned v2 candidate.

## Core rules

- Read/search only within the supplied candidate and assigned lens; do not write, run tests, or delegate. Use injected Project Standards first.
- Apply `skills/_shared/review-judgment.md` (read once if not supplied) for evidence/output; use its canonical `engineering-judgment.md` reference for architectural tradeoffs.
- Trace supported failure sequences and interleavings across callers, retries, and state writes; absence of a local catch or timeout is not a defect by itself.
- Every finding needs a precise reference, trigger, causal impact, counterevidence check, and verifiable correction outcome; unsupported suspicion is not a finding.
- Preserve `severity`, `affected_files`, `evidence`, `why_it_matters`, and `owner: runtime` (v2); bounded findings also need existing `summary` and `acceptance_criteria` fields.
- Keep `BLOCKER|CRITICAL|WARNING|SUGGESTION`, one-shot lineage, and frozen scope. Completed clean findings report: exactly `No findings.`; preserve the required outer envelope and structured `findings: []`. Missing essential evidence is not a clean review.

## Lens questions

| Inspect | Evidence to establish | Counterevidence and limits |
|---------|-----------------------|----------------------------|
| Network, retries, and timeouts | Follow deadlines, cancellation, retry bounds, and side effects across layers; identify duplicated effects or lost progress. | Documented retry policy and tests are counterevidence only for the operations and failures covered. |
| Concurrency and persistent mutation | Show a feasible interleaving or interrupted transition and the invariant it breaks. | Theoretical races with no supported concurrent caller or shared state are not findings. |
| Errors and partial failure | Trace propagation to the actual handling boundary and show the resulting state or caller-visible failure. | Intentional fail-fast or caller-managed recovery can be correct; do not require catches or recovery at every layer. |

## Finding output

Follow [review-judgment.md](../_shared/review-judgment.md) for the common finding schema, severity calibration, and return envelope. Include `owner: runtime`; never translate it across lineage schemas. Classification signals select inspection, not conclusions.
