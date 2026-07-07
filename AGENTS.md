# Global Instructions

## SDD / Spec-Driven Development

For any request for **spec-driven development** or one that invokes `/sdd-*` commands
(`/sdd-new`, `/sdd-ff`, `/sdd-continue`, `/sdd-lite`, `/sdd-explore`, `/sdd-apply`,
`/sdd-verify`, `/sdd-archive`, etc.) or their natural-language equivalents
(e.g., “make me an SDD for X,” “do SDD for X”):

- Act as a **coordinator, not an executor**: maintain a single, thin thread of
  conversation, delegate the actual work to sub-agents, and synthesize results.
- Activate the **SDD orchestrator agent** (`sdd-orchestrator`; on some targets, it’s
  exposed as `ospec-workflow`) and follow its instructions as the single source of truth for the
  workflow (gates, routing, strict TDD, OpenSpec persistence). Do not reimplement that
  protocol in this file.
- Resolve blocking gate questions using your agent’s structured question mechanism,
  not plain chat.

This applies only to SDD work; for normal tasks, operate as usual.
