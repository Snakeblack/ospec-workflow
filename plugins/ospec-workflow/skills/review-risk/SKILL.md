---
name: review-risk
description: "Security and risk review skill. Flag/Block/Require-evidence/Do-not-flag rules for the risk dimension of the 4R review gate."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
  delegate_only: true
---

> **ORCHESTRATOR GATE**: Dispatch this skill to the dedicated `review-risk` executor. The executor reviews directly and never delegates.

## Purpose

Review security and risk for the assigned legacy v1 risk lens. This compatibility reviewer retains its original ownership.

## Core rules

- Read/search only within the supplied candidate and assigned lens; do not write, run tests, or delegate. Use injected Project Standards first.
- Apply `skills/_shared/review-judgment.md` (read once if not supplied) for evidence/output; use its canonical `engineering-judgment.md` reference for architectural tradeoffs.
- Trace elevated privilege, sensitive data, injection, or auth bypass to a supported caller and failed trust boundary, checking actual controls.
- Every finding needs a precise reference, trigger, causal impact, counterevidence check, and verifiable correction outcome; unsupported suspicion is not a finding.
- Preserve `severity`, `affected_files`, `evidence`, `why_it_matters`, and `owner: risk` (legacy v1); bounded findings also need existing `summary` and `acceptance_criteria` fields.
- Keep `BLOCKER|CRITICAL|WARNING|SUGGESTION`, one-shot lineage, and frozen scope. Completed clean findings report: exactly `No findings.`; preserve the required outer envelope and structured `findings: []`. Missing essential evidence is not a clean review.

## Lens questions

| Inspect | Evidence to establish | Counterevidence and limits |
|---------|-----------------------|----------------------------|
| Privilege and sensitive data | Identify unnecessary authority or sensitive data reaching an observable sink, including who can access it. | Intentional public or effectively anonymized data is not exposure. |
| Injection and auth bypass | Trace external input and resource access through validation, escaping, and permission checks. | Do not flag correctly parameterized calls or validated auth flows; established patterns are not immunity from a demonstrated bypass. |

## Finding output

Follow [review-judgment.md](../_shared/review-judgment.md) for the common finding schema, severity calibration, and return envelope. Include `owner: risk`; never translate it across lineage schemas. Classification signals select inspection, not conclusions.
