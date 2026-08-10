# ADR-004: Preserve legacy lineage and add a generational container

- Status: proposed
- Change: k3-readiness-remediation
- Date: 2026-08-09

## Context

The 4R gate stores one `lineage` object. A verified new Candidate needs a separately approved successor, but replacing that field would destroy the byte-pinned terminal predecessor and make multi-generation recovery ambiguous.

## Decision

Keep the singular `lineage` node immutable as the legacy seed. Add a sibling `lineages` container with schema/revision, canonical order, `by_id`, one `active_lineage_id`, pinned legacy digests, and one pending mutation. Seed it additively and idempotently; all new reads resolve the active chain through the container. Persist each mutation by locked compare-and-swap and atomic read-merge-write before dispatch.

## Alternatives

- Replace `lineage` with the container: breaks legacy readers and rewrites the predecessor.
- Keep active `lineage` plus historical entries: each activation overwrites the compatibility node.
- External sidecar: splits canonical OpenSpec state and complicates archive recovery.

## Consequences

Every generation remains auditable and predecessors stay canonical; legacy readers fail closed on the terminal seed. State grows with each generation and writers must validate the full chain, revision, digests, and pending operation. Reversal is cheap before dispatch, but after dispatch the audit must remain additive.
