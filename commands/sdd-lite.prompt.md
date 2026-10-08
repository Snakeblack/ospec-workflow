---
name: sdd-lite
description: Ask the SDD orchestrator to run lite mode only for trivial or small changes.
agent: sdd-orchestrator
---

Route this slash command to the `sdd-orchestrator` custom agent.

Classify the change in this request: `${input:request}`. Use SDD lite mode only if the orchestrator determines the change is trivial or small.

The request carries the whole user intent. If its first word is a kebab-case name with at least one hyphen (for example `add-login`), use that word as the change name and the rest as the intent. Otherwise the whole request is the intent: derive a short kebab-case change name from it.

Do not invoke phase agents directly. If the change is normal, high-risk, or grows beyond lite scope, the orchestrator must escalate to standard SDD.