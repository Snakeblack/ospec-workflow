---
name: sdd-clarify
description: "Re-run or manually trigger the sdd-clarify phase for an existing change."
agent: sdd-orchestrator
argument-hint: "<change-name>"
tools: ['agent', 'read', 'search', 'edit']
---

Run the clarify phase through the orchestrator. Analyzes change-local specs for material ambiguities, asks ≤5 questions via question_gate, and encodes accepted answers inline into the specs.

User input: `${input}`
