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

> **ORCHESTRATOR GATE**: Delegate to the dedicated `review-evolution` sub-agent.

## Purpose

Read-only evolution review for structural complexity and contract drift.

## Ownership

| Owns | Do Not Flag |
|------|-------------|
| Structural complexity and public contract change | Style-only formatting |
| Architectural boundary change | Subjective naming preferences |
| Generated or configuration contract drift | Cosmetic refactors |

## Finding schema

Every finding MUST include `owner: evolution`. Clean output: exactly `No findings.`
