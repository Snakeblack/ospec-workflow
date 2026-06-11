---
name: sdd-workspace
description: "Manage the workspace-federated atlas: scaffold it (init), report cross-repo active changes (status), or analyze cross-repo impact (impact)."
agent: sdd-orchestrator
argument-hint: "<init|status|impact> [change]"
tools: ['agent', 'read', 'search', 'edit', 'execute']
---

Route this slash command to the `sdd-workspace` executor via the SDD orchestrator.

Launch the `sdd-workspace` phase. The first token of the input selects the subcommand
(`init`, `status`, or `impact`); default to `status`. `init` writes
`openspec/workspace.yaml` only after explicit confirmation; `status` and `impact` are
read-only and never modify member repos.

User input: `${input}`
