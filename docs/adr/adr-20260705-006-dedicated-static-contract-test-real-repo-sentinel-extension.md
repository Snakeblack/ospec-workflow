# ADR-006: Dedicated static contract test + real-repo sentinel extension

- Status: accepted
- Change: harden-archive-move-fingerprints
- Date: 2026-07-05

## Context

The two hardened contracts are agent-instruction prose, not runtime code, so their
MUST scenarios are verified by static string anchors that must fail `npm test` on
drift. The repo already uses this style (`commands-agents-contract.test.js`,
`sdd-document.test.js`) and tracks handler protocol strings via a sentinel table in
`scripts/configure/real-repo.test.js`.

## Decision

Create `scripts/archive-move-fingerprint-contract.test.js` with two `test()` cases
(archive-move contract; fingerprint ownership) asserting the load-bearing strings in
`gate-archive-quality.md`, `skills/sdd-archive/SKILL.md`, `skills/sdd-spec/SKILL.md`
and the orchestrator body — including the ABSENCE of the old "delete the source
folder" executor instruction. Extend `real-repo.test.js` with sentinel rows for the
new gate-archive-quality.md move-completion strings and assert those strings are not
re-inlined in the orchestrator body.

## Alternatives

- Fold assertions into an existing suite — rejected: dilutes the concern and makes
  drift failures harder to locate.
- New `_shared` file requiring a new sentinel-table row — moot: the protocol reuses
  the existing sentinel-tracked `gate-archive-quality.md`, so no new-file entry.

## Consequences

Easier: any future drift in these instruction strings fails the suite across all 4
dist targets. Harder: the anchored strings become load-bearing and must stay
verbatim. Reversible: delete the test file and the added sentinel rows.
