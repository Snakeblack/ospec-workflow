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

> **ORCHESTRATOR GATE**: Delegate to the dedicated `review-runtime` sub-agent.

## Purpose

Read-only runtime review covering network, error, retry, timeout, concurrency, and partial failure paths.

## Ownership

| Owns | Do Not Flag |
|------|-------------|
| Network and retry flows | Documented retry policies with tests |
| Error and partial failure paths | Standard logging noise |
| Concurrency and persistent state mutation | Theoretical races without evidence |

## Finding schema

Every finding MUST include `owner: runtime`. Clean output: exactly `No findings.`
