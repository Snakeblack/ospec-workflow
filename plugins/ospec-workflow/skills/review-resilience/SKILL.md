---
name: review-resilience
description: "Resilience review skill. Flag/Block/Require-evidence/Do-not-flag rules for the resilience dimension of the 4R review gate."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
  delegate_only: true
---

> **ORCHESTRATOR GATE**: Dispatch this skill to the dedicated `review-resilience` executor. The executor reviews directly and never delegates.

## Purpose

Review failure propagation and recovery for the assigned legacy v1 resilience lens.

## Core rules

- Read/search only within the supplied candidate and assigned lens; do not write, run tests, or delegate. Use injected Project Standards first.
- Apply `skills/_shared/review-judgment.md` (read once if not supplied) for evidence/output; use its canonical `engineering-judgment.md` reference for architectural tradeoffs.
- Follow an exception or partial failure to the real handling boundary; a missing local try/catch or logging statement alone is not actionable evidence.
- Every finding needs a precise reference, trigger, causal impact, counterevidence check, and verifiable correction outcome; unsupported suspicion is not a finding.
- Preserve `severity`, `affected_files`, `evidence`, `why_it_matters`, and `owner: resilience` (legacy v1); bounded findings also need existing `summary` and `acceptance_criteria` fields.
- Keep `BLOCKER|CRITICAL|WARNING|SUGGESTION`, one-shot lineage, and frozen scope. Completed clean findings report: exactly `No findings.`; preserve the required outer envelope and structured `findings: []`. Missing essential evidence is not a clean review.

## Lens questions

| Inspect | Evidence to establish | Counterevidence and limits |
|---------|-----------------------|----------------------------|
| I/O failures | Trace a supported I/O failure through callers and show the violated failure contract. | Caller-managed propagation and intentional fail-fast may be correct without a local catch. |
| Partial state and recovery | Identify the failed step, already-applied effects, and inconsistent state visible to later operations. | Atomic operations or demonstrated rollback can exclude the proposed failure. |
| Suppressed exceptions | Show which meaningful failure becomes invisible or is wrongly reported as success. | Expected absence or documented suppression can be valid; assess the actual consequence rather than requiring logging everywhere. |

## Finding output

Follow [review-judgment.md](../_shared/review-judgment.md) for the common finding schema, severity calibration, and return envelope. Include `owner: resilience`; never translate it across lineage schemas. Classification signals select inspection, not conclusions.
