---
name: review-efficiency
description: "Efficiency review skill for the Quality Review Gate."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
  delegate_only: true
---

> **ORCHESTRATOR GATE**: Dispatch this skill to the dedicated `review-efficiency` executor. The executor reviews directly and never delegates.

## Purpose

Review resource cost and performance-sensitive behavior in the assigned v2 candidate.

## Core rules

- Read/search only within the supplied candidate and assigned lens; do not write, run tests, or delegate. Use injected Project Standards first.
- Apply `skills/_shared/review-judgment.md` (read once if not supplied) for evidence/output; use its canonical `engineering-judgment.md` reference for architectural tradeoffs.
- Support performance findings with a measured result or a code-derived cost tied to evidenced workload bounds; label estimates and never invent timings.
- Every finding needs a precise reference, trigger, causal impact, counterevidence check, and verifiable correction outcome; unsupported suspicion is not a finding.
- Preserve `severity`, `affected_files`, `evidence`, `why_it_matters`, and `owner: efficiency` (v2); bounded findings also need existing `summary` and `acceptance_criteria` fields.
- Keep `BLOCKER|CRITICAL|WARNING|SUGGESTION`, one-shot lineage, and frozen scope. Completed clean findings report: exactly `No findings.`; preserve the required outer envelope and structured `findings: []`. Missing essential evidence is not a clean review.

## Lens questions

| Inspect | Evidence to establish | Counterevidence and limits |
|---------|-----------------------|----------------------------|
| Repeated I/O and scans | Show call frequency, fan-out, and input size; connect repeated work to a latency or resource cost. | One startup scan or small bounded loop is not a bottleneck just because it is synchronous. |
| Unbounded collections and resource lifetime | Trace retention, growth, release, and supported input limits to a concrete resource risk. | A collection is not unbounded when the actual caller contract bounds it. |
| Optimization tradeoffs | Use canonical engineering judgment to compare the evidenced saving with consistency, memory, and operational costs. | No cache, parallelism, or data-structure rewrite based solely on theoretical slowness or an invented future workload. |

## Finding output

Follow [review-judgment.md](../_shared/review-judgment.md) for the common finding schema, severity calibration, and return envelope. Include `owner: efficiency`; never translate it across lineage schemas. Classification signals select inspection, not conclusions.
