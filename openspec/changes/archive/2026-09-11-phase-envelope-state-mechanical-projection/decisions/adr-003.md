# ADR-003: CAS Revision Checks and Replay Determinism

- Status: proposed
- Change: phase-envelope-state-mechanical-projection
- Date: 2026-09-11

## Context
Concurrent subagent execution, asynchronous stop hooks, and network/process retries create race conditions where multiple processes attempt to advance or reconcile `state.yaml` simultaneously, risking lost updates or duplicate journal entries.

## Decision
Enforce Compare-And-Swap (CAS) revision matching under advisory file locking (`withFileLock`) in `scripts/lib/ospec-state.js` (`projectPhaseCompletion`), and use payload hashing to detect duplicate completion replays for zero-delta idempotent convergence.

## Alternatives
- Unsynchronized last-writer-wins: rejected because concurrent subagent stops overwrite newer state revisions.
- Optimistic in-memory concurrency without file locking: rejected because Node.js cross-process filesystem writes on Windows/POSIX lack atomic append/replace guarantees.

## Consequences
Guarantees thread- and process-safe state updates, prevents phantom state advances, and enables safe retries of `SubagentStop` without duplicating journal records. Interrupted writes remain recoverable via `recoverOrphanBak`.
