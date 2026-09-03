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

> **ORCHESTRATOR GATE**: Delegate to the dedicated `review-trust` sub-agent.

## Purpose

Read-only trust review. Signals inform routing; they are NOT findings.

## Ownership

| Owns | Do Not Flag |
|------|-------------|
| Auth boundary changes | Style-only renames |
| Permission and credential handling | Intentional public data |
| Secret handling and process execution | Parameterized queries with tests |
| Dependency trust and security policy drift | Established auth patterns |

## Finding schema

Every finding MUST include `severity`, `affected_files`, `evidence`, `why_it_matters`, and `owner: trust`.

Clean output: exactly `No findings.`
