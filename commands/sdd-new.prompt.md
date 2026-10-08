---
name: sdd-new
description: Start a new persisted SDD change through the SDD orchestrator.
agent: sdd-orchestrator
---

Route this slash command to the `sdd-orchestrator` custom agent.

Start a new persisted SDD change from this request: `${input:request}`.

The request carries the whole user intent. If its first word is a kebab-case name with at least one hyphen (for example `add-login`), use that word as the change name and the rest as the intent. Otherwise the whole request is the intent: derive a short kebab-case change name from it.

Do not invoke phase agents directly. Let `sdd-orchestrator` run init checks, classify the change, choose the workflow, and delegate phases as needed.