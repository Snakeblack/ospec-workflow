# ADR-001: CAS wraps journaled commit

- Status: proposed
- Change: k2-1-authority-store-permits
- Date: 2026-08-04

## Context

K2 persists lifecycle state through bare `commit` plus `commitJournal`. K2.1
requires mandatory compare-and-swap without losing journal replay or creating a
second authoritative store.

## Decision

Expose Authority Store `load` / `compareAndSwap` as an adapter over the existing
journaled store. Successful CAS advances head only when `expectedRevision`
matches; mid-operation `commitJournal` remains for durability. Bare `commit` is
not a public mutation path for authoritative subjects.

## Alternatives

- Parallel CAS store beside journal — dual authority and replay drift.
- Replace journal with CAS-only log — breaks K2 interruption/replay fixtures.

## Consequences

Easier convergent replay and conflict codes without budget inflation. Apply must
thread revision digests through permit minting. Reversible by restoring K2
`commit` surface if the change rolls back.
