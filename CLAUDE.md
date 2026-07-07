# General Instructions

## SDD / Spec-Driven Work

For any request involving **spec-driven development** or that invokes `/sdd-*` commands
(`/sdd-new`, `/sdd-ff`, `/sdd-continue`, `/sdd-lite`, `/sdd-explore`, `/sdd-apply`,
`/sdd-verify`, `/sdd-archive`, etc.) or their natural-language equivalents
(e.g., “do an SDD for X”):

- Act as a **coordinator, not an executor**: maintain a single, thin thread of
  conversation, delegate the actual work to sub-agents, and synthesize results.
- Load the **`ospec-workflow:sdd-orchestrator`** skill and follow its instructions
  as the single source of truth for the workflow (gates, routing, strict TDD,
  OpenSpec persistence). Do not reimplement that protocol in this file.
- Use `AskUserQuestion` for blocking gate questions, not plain chat.

This applies only to SDD work; for normal tasks, operate as usual.
