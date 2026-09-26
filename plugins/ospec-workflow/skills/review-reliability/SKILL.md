---
name: review-reliability
description: "Reliability review skill. Flag/Block/Require-evidence/Do-not-flag rules for the reliability dimension of the 4R review gate."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
  delegate_only: true
---

> **ORCHESTRATOR GATE**: Dispatch this skill to the dedicated `review-reliability` executor. The executor reviews directly and never delegates.

## Purpose

Review correctness and consequential test gaps for the assigned legacy v1 reliability lens.

## Core rules

- Read/search only within the supplied candidate and assigned lens; do not write, run tests, or delegate. Use injected Project Standards first.
- Apply `skills/_shared/review-judgment.md` (read once if not supplied) for evidence/output; use its canonical `engineering-judgment.md` reference for architectural tradeoffs.
- A missing test needs a specific supported failure mode and meaningful consequence; trace actual callers and existing coverage before proposing a test.
- Every finding needs a precise reference, trigger, causal impact, counterevidence check, and verifiable correction outcome; unsupported suspicion is not a finding.
- Preserve `severity`, `affected_files`, `evidence`, `why_it_matters`, and `owner: reliability` (legacy v1); bounded findings also need existing `summary` and `acceptance_criteria` fields.
- Keep `BLOCKER|CRITICAL|WARNING|SUGGESTION`, one-shot lineage, and frozen scope. Completed clean findings report: exactly `No findings.`; preserve the required outer envelope and structured `findings: []`. Missing essential evidence is not a clean review.

## Lens questions

| Inspect | Evidence to establish | Counterevidence and limits |
|---------|-----------------------|----------------------------|
| Error-path coverage | Identify the supported trigger, expected behavior, and why existing tests fail to protect it; distinguish a coverage risk from a proven defect. | Do not require a test for every branch or flag unreachable TODO scaffolding; a TODO is not immunity for reachable production behavior. |
| Non-determinism | Show how timing, ordering, or external state violates a caller expectation. | Intentional randomness with appropriate assertions is not incorrect merely because outputs vary. |
| Input contracts | Show a supported invalid input reaching behavior that violates the public contract. | Internal helpers may rely on upstream validation; do not demand duplicate checks at each layer. |

## Finding output

Follow [review-judgment.md](../_shared/review-judgment.md) for the common finding schema, severity calibration, and return envelope. Include `owner: reliability`; never translate it across lineage schemas. Classification signals select inspection, not conclusions.
