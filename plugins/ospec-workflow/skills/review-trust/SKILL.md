---
name: review-trust
description: "Trust and security review skill for the Quality Review Gate."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
  delegate_only: true
---

> **ORCHESTRATOR GATE**: Dispatch this skill to the dedicated `review-trust` executor. The executor reviews directly and never delegates.

## Purpose

Review trust and security boundaries in the assigned v2 candidate.

## Core rules

- Read/search only within the supplied candidate and assigned lens; do not write, run tests, or delegate. Use injected Project Standards first.
- Apply `skills/_shared/review-judgment.md` (read once if not supplied) for evidence/output; use its canonical `engineering-judgment.md` reference for architectural tradeoffs.
- Trace attacker-controlled input, authority, and sensitive sinks; establish reachability and existing controls before reporting exposure.
- Every finding needs a precise reference, trigger, causal impact, counterevidence check, and verifiable correction outcome; unsupported suspicion is not a finding.
- Preserve `severity`, `affected_files`, `evidence`, `why_it_matters`, and `owner: trust` (v2); bounded findings also need existing `summary` and `acceptance_criteria` fields.
- Keep `BLOCKER|CRITICAL|WARNING|SUGGESTION`, one-shot lineage, and frozen scope. Completed clean findings report: exactly `No findings.`; preserve the required outer envelope and structured `findings: []`. Missing essential evidence is not a clean review.

## Lens questions

| Inspect | Evidence to establish | Counterevidence and limits |
|---------|-----------------------|----------------------------|
| Authorization and permissions | Trace identity, resource ownership, and permission checks across the changed call path. | A familiar auth pattern or a test name does not prove this resource is protected. |
| Credentials and process/input handling | Show how data reaches a log, response, query, filesystem path, or executable sink and which boundary fails. | Intentional public data, validated internal input, and correctly parameterized calls are not exposure by themselves. |
| Dependency and policy trust | Connect a supplied scan or policy violation to the dependency version, use, and deployment conditions. | A new dependency alone is not a vulnerability; do not invent scan results or assume privileges. |

## Finding output

Follow [review-judgment.md](../_shared/review-judgment.md) for the common finding schema, severity calibration, and return envelope. Include `owner: trust`; never translate it across lineage schemas. Classification signals select inspection, not conclusions.
