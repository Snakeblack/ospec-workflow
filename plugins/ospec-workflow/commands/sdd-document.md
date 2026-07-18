---
name: sdd-document
description: Generate wiki pages detailing repository architecture, specifications, and status.
argument-hint: changeName
tools: ['Agent', 'Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash', 'PowerShell']
arguments: changeName
---

Route this slash command to the `sdd-orchestrator` custom agent.

Generate documentation using `$changeName` through the orchestrator.

Do not invoke the `sdd-document` phase agent directly. The orchestrator must validate the approved documentation scope and delegate execution only when safe.
