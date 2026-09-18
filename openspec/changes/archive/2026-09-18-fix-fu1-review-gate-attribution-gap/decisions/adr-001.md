# ADR-001: Synthetic fact `kernel-contract-change` emitted in the normalizer

- Status: proposed
- Change: fix-fu1-review-gate-attribution-gap
- Date: 2026-09-17

## Context
Clean kernel-contract changes classified `normal` produce zero lexical facts, so `public-kernel-contract-unattributed` fires and the gate dead-ends in `quality-review-ambiguity-unresolved` (FU1). Spec REQ-001 requires attribution via `capability_scopes` to flow through the normal fact pipeline with a valid fingerprint and audit presence.

## Decision
Add `kernel-contract-change` (domains `trust`, `evolution`, source `metadata`) to the v2 signal vocabulary and emit it in `normalizeQualityReviewEvidence` once per capability scope covering `schemas/kernel/**`, attributed to that scope id. Coverage, fingerprint, and audit derive from it like any other fact.

## Alternatives
- Special-case inside `classifyQualityReview` — leaves no auditable fact trace and diverges from the evidence contract.
- Attribute domains directly in `buildCapabilityCoverage` without a fact — breaks the invariant that coverage derives from facts.

## Consequences
Classification stays deterministic and evidence-driven; fingerprint of freshly normalized kernel-scope evidence changes (accepted, snapshots are self-consistent — see ADR-003). Makes the runtime ambiguity rule per-capability mandatory so the fact cannot mask other codes.
