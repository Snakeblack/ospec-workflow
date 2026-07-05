---
name: sdd-document
description: Generate wiki pages detailing repository architecture, specifications, and status.
agent: sdd-orchestrator
argument-hint: ""
tools: ['agent', 'read', 'search', 'edit', 'execute']
---

Route this slash command to the `sdd-orchestrator` custom agent.

Generate documentation using `${input:changeName}` through the orchestrator.

Do not invoke the `sdd-document` phase agent directly. The orchestrator must validate the approved documentation scope and delegate execution only when safe.
