# ADR-004: Deterministic Capsule Construction and Interruption Preservation

- Status: proposed
- Change: k6a-worker-isolation
- Date: 2026-08-23

## Context
Worker executions must run inside minimal reproducible capsules without repository noise, and aborts or timeouts must not discard valuable execution telemetry and modified file diffs.

## Decision
`MaterializeSourceSnapshot` projects only declared dependency files and computes a deterministic SHA-256 fingerprint over sorted relative paths and content digests. `RecoverInterruptedExecution` preserves partial stdout/stderr streams and modified file inventory into an `interrupted` workspace state.

## Alternatives
- *Copy full repository snapshot*: Rejected because extraneous files and git metadata break determinism and leak state.
- *Discard state on timeout/cancellation*: Rejected because partial evidence is critical for failure analysis and diagnostic recovery.

## Consequences
Deterministic capsule construction enabling reproducible replays; complete telemetry preservation upon timeout or cancellation. Reversibility is high.
