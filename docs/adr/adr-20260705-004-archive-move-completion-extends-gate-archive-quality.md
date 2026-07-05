# ADR-004: Archive move-completion extends gate-archive-quality.md

- Status: accepted
- Change: harden-archive-move-fingerprints
- Date: 2026-07-05

## Context

The orchestrator must own the archive-folder MOVE (verify dest-vs-source inventory,
then delete source) as a POST-return, archive-route-only responsibility. The
orchestrator body is size-guarded <500 lines (currently 492). A circumstantial
handler is read once at its hook point and then stays in context for the rest of
the route.

## Decision

Append a `## Post-Return Move Completion` section to
`skills/_shared/gate-archive-quality.md`. That handler is already read at the
archive hook point (before dispatching `sdd-archive`) and retained in context
through the executor's return, so the post-return protocol is already loaded — no
new pointer-table row and no inline orchestrator lines. Mirrors `route-document.md`
§6 J5 orchestrator-owned post-run inventory precedent.

## Alternatives

- New `skills/_shared/route-archive-move.md` — rejected: costs a pointer-table row
  from the ~8-line headroom under the <500 guard and a redundant second load.
- Inline the protocol in the orchestrator body — rejected: breaks the handler
  pattern and the 500-line ratchet.

## Consequences

Easier: full orchestrator-side archive lifecycle (quality gate + move completion)
lives in one file; zero inline cost. Harder: one handler now spans two hook points
(mitigated by an explicit section header). Reversible: revert the appended section.
