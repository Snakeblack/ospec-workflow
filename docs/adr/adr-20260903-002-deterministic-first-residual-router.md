# ADR-002: Deterministic-First Routing with Residual-Only Router

- Status: proposed
- Change: quality-review-gate
- Date: 2026-09-03

## Context

Today `planReviewGate` always sets `run_generalist: true`, then `deriveReviewDimensions` merges the generalist with facts and escalates three positive dimensions to full 4R. Treating every valid router answer as a union would dispatch specialists when the router still reports `ambiguous`.

## Decision

`classifyQualityReview` runs with no model. High-risk selects all four quality domains and skips `review-change`. Classifier `sufficient` dispatches `union(signalled_domains)` including empty (zero model calls). Classifier `ambiguous` is the only router invocation; input is residual evidence **per unattributed capability** (no silently dropped capability). Output is `{ classification_status, added_domains, reason }` with no findings.

After a **valid** payload: `sufficient` merges `deterministic ∪ added_domains` and dispatches; `ambiguous` (including `added_domains: []`) blocks with `blocker_reason: quality-review-ambiguity-unresolved`, `dispatch=[]`, `archive_allowed=false`, and MUST NOT freeze lineage. Malformed or forbidden output uses `contract-remediation`. The router cannot remove deterministic domains. `normal-signal-overflow` is removed. Persist unresolved ambiguity as a gate `blocker_reason`, not a new SDD phase `blocker_type`.

## Alternatives

- Keep mandatory generalist-first — preserves token cost on every successful verify.
- Let the router replace rather than union the set — would strip deterministic selections.
- Always union after any valid router object — would dispatch as if sufficient.

## Consequences

`review-change` becomes exceptional. A well-formed “cannot resolve” is distinct from a contract defect. Specialist count may be 0–4 on normal changes after a sufficient path. Reversible only with the atomic contract revert.
