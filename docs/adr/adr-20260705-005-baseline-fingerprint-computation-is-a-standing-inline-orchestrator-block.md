# ADR-005: Baseline fingerprint computation is a standing inline orchestrator block

- Status: accepted
- Change: harden-archive-move-fingerprints
- Date: 2026-07-05

## Context

`sdd-spec` has no execute tool to hash files, so the orchestrator must compute
`baseline_fingerprints`. Per REQ-agents-009 the snapshot MUST be taken immediately
after `sdd-spec` returns (spec time) so a later baseline move is detectable. This
must run on EVERY change touching a baseline domain.

## Decision

Add a compact self-contained standing block to the orchestrator body, adjacent to
the Assumption Ledger Protocol: after `sdd-spec` returns `success`, compute SHA-256
of each `touched_baseline_domains` entry's current baseline spec (`null` if none)
and write `state.yaml.baseline_fingerprints`; never record it as a per-change
`assumptions:` entry. `sdd-spec` only declares the domains.

## Alternatives

- Host in `clarify-routing.md` — rejected: fires only when the clarify gate runs,
  not standing across every route.
- Host in `gate-change-collision.md` — rejected: loaded pre-apply, too late for a
  spec-time snapshot.

## Consequences

Easier: fingerprint gap closed structurally for every change; per-change assumption
pattern removed. Harder: ~6 inline lines consumed (492 → ~498, still under the
guard). Reversible: revert the block; contract text also anchored by a static test.
