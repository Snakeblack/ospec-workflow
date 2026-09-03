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

> **ORCHESTRATOR GATE**: Delegate to the dedicated `review-efficiency` sub-agent.

## Purpose

Read-only efficiency review. Distinguish defect, measured risk, and speculation.

## Ownership

| Owns | Do Not Flag |
|------|-------------|
| Loop I/O and repeated network flows | Micro-optimizations without evidence |
| Unbounded collections and blocking I/O | Premature optimization guesses |
| Whole-tree scans and performance-sensitive paths | Theoretical slowness |

## Finding schema

Every finding MUST include `owner: efficiency`. Clean output: exactly `No findings.`
