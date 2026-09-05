---
name: review-evolution
description: "Evolution and maintainability review skill for the Quality Review Gate."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
  delegate_only: true
---

> **ORCHESTRATOR GATE**: Dispatch this skill to the dedicated `review-evolution` executor. The executor reviews directly and never delegates.

## Purpose

Review maintainability, architectural boundaries, and contract evolution in the assigned v2 candidate.

## Core rules

- Read/search only within the supplied candidate and assigned lens; do not write, run tests, or delegate. Use injected Project Standards first.
- Apply `skills/_shared/review-judgment.md` (read once if not supplied) for evidence/output; use its canonical `engineering-judgment.md` reference for architectural tradeoffs.
- Tie structural concerns to a concrete change scenario or broken consumer contract; layer count, naming, duplication, and preferred patterns alone are not findings.
- Every finding needs a precise reference, trigger, causal impact, counterevidence check, and verifiable correction outcome; unsupported suspicion is not a finding.
- Preserve `severity`, `affected_files`, `evidence`, `why_it_matters`, and `owner: evolution` (v2); bounded findings also need existing `summary` and `acceptance_criteria` fields.
- Keep `BLOCKER|CRITICAL|WARNING|SUGGESTION`, one-shot lineage, and frozen scope. Completed clean findings report: exactly `No findings.`; preserve the required outer envelope and structured `findings: []`. Missing essential evidence is not a clean review.

## Lens questions

| Inspect | Evidence to establish | Counterevidence and limits |
|---------|-----------------------|----------------------------|
| Public, generated, and configuration contracts | Trace a changed producer to its consumer or generator and show incompatible values, defaults, or semantics. | A contract change with a supported migration or version boundary is not automatically a defect. |
| Coupling and responsibility boundaries | Identify the responsibility or dependency that forces an unrelated module to change, and explain the concrete consequence. | Do not infer a requirement for a new interface, service, or architectural style from personal preference. |
| Structural complexity and duplication | Show an actual change task where competing sources of truth or hidden ordering create inconsistent behavior. | Size, nesting depth, and similar-looking code are inspection signals; apply canonical engineering judgment before recommending restructuring. |

## Finding output

Follow [review-judgment.md](../_shared/review-judgment.md) for the common finding schema, severity calibration, and return envelope. Include `owner: evolution`; never translate it across lineage schemas. Classification signals select inspection, not conclusions.
