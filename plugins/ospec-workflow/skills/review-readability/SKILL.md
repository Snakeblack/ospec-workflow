---
name: review-readability
description: "Readability review skill. Flag/Block/Require-evidence/Do-not-flag rules for the readability dimension of the 4R review gate."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
  delegate_only: true
---

> **ORCHESTRATOR GATE**: Dispatch this skill to the dedicated `review-readability` executor. The executor reviews directly and never delegates.

## Purpose

Review comprehension and safe modification for the assigned legacy v1 readability lens.

## Core rules

- Read/search only within the supplied candidate and assigned lens; do not write, run tests, or delegate. Use injected Project Standards first.
- Apply `skills/_shared/review-judgment.md` (read once if not supplied) for evidence/output; use its canonical `engineering-judgment.md` reference for architectural tradeoffs.
- Names, nesting, and missing comments need a concrete misunderstanding or change hazard; never emit preference-only findings or enforce an arbitrary nesting threshold.
- Every finding needs a precise reference, trigger, causal impact, counterevidence check, and verifiable correction outcome; unsupported suspicion is not a finding.
- Preserve `severity`, `affected_files`, `evidence`, `why_it_matters`, and `owner: readability` (legacy v1); bounded findings also need existing `summary` and `acceptance_criteria` fields.
- Keep `BLOCKER|CRITICAL|WARNING|SUGGESTION`, one-shot lineage, and frozen scope. Completed clean findings report: exactly `No findings.`; preserve the required outer envelope and structured `findings: []`. Missing essential evidence is not a clean review.

## Lens questions

| Inspect | Evidence to establish | Counterevidence and limits |
|---------|-----------------------|----------------------------|
| Naming and meaning | Identify a misleading unit, state, or contract and the concrete caller or maintenance error it invites. | Idiomatic short names and stylistic alternatives alone are not findings. |
| Control flow | Trace a specific branch or ordering dependency that obscures an invariant or makes a realistic change inconsistent. | More than three nesting levels is not by itself a defect or a reason to introduce abstractions. |
| Decisions and comments | Identify the unstated constraint a maintainer needs to preserve and check referenced docs before claiming it is missing. | Do not require comments that restate code or mistake a documented tradeoff for missing explanation. |

## Finding output

Follow [review-judgment.md](../_shared/review-judgment.md) for the common finding schema, severity calibration, and return envelope. Include `owner: readability`; never translate it across lineage schemas. Classification signals select inspection, not conclusions.
