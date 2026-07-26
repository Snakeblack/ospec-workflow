# ADR-001: Staging root and journal under `.ospec/archive-tx/{change}/`

- Status: proposed
- Change: hybrid-archive-transaction-runtime
- Date: 2026-07-26

## Context

The transaction needs a staging tree and a journal that survive process death (resume),
pollute neither the origin change folder (copied verbatim into the audit trail) nor the
archive destination, and sit on the same volume as `openspec/` so `rename` is atomic.

## Decision

Place `journal.json`, `staging/` and `receipt.json` in `.ospec/archive-tx/{change-name}/`.

## Alternatives

- Inside the origin change folder — staging artifacts would be copied into the archive.
- Inside `openspec/changes/archive/` — an abandoned transaction would litter the audit trail.
- OS temp directory — risks `EXDEV` on commit rename across volumes.

## Consequences

Reuses the existing gitignored "ephemeral runtime derivative" convention
(`.ospec/session/**`, `.ospec/cache/**`); the journal and receipt are local-only, so
cross-machine handover of an interrupted transaction is not supported. Reversible: the
root is one constant in `archive-transaction.js`.
