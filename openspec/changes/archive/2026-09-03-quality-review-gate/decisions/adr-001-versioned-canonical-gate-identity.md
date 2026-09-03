# ADR-001: Versioned Canonical Gate Identity

- Status: proposed
- Change: quality-review-gate
- Date: 2026-09-03

## Context

Clarify A4 forbids unqualified aliasing of the post-verify review gate. Live routes, `state.yaml`, and routing constants currently use `4r-review-gate` with 4R dimension IDs. A flat `KNOWN_GATES` that lists both names would make a **new v2 config** that wrongly lists `4r-review-gate` syntactically valid.

## Decision

`quality-review-gate` is the sole canonical identity for schema v2, new config, and new state writes. Split `ACTIVE_GATES` (includes `quality-review-gate`, not `4r-review-gate`) from `LEGACY_GATES` (includes `4r-review-gate`). Their union MAY exist for **lexical parsing** only. Semantic admission is context-dependent: live/v2 config admits only `quality-review-gate`; schema-v1 persisted state admits only `4r-review-gate`; archive readers admit `4r-review-gate`; both keys in one mutable `state.yaml` fail closed (`contract-remediation`). A single route must not list both.

Recognition of a legacy identifier does not authorize its use in a v2 live route.

## Alternatives

- Flat `KNOWN_GATES` of both names — makes an illegal v2 route look valid.
- Keep live config on `4r-review-gate` — hides the taxonomy change and invites mixed writes.
- Treat the old key as an alias of the new one — A4 forbids unqualified aliasing.

## Consequences

`route-dispatcher.js` must validate gates with a context, not a flat allowlist. Live `openspec/config.yaml` and eval goldens switch keys. In-flight v1 lineages keep `4r-review-gate` until terminal or explicit migration. Archives stay byte-identical. Reversible only by reverting the released contract as a unit.
