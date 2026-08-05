# ADR-002: Shared Async Transport Invoke And Failure Classification

- Status: proposed
- Change: k2a-1-live-capability-probes-async-transports
- Date: 2026-08-05

## Context
Transport ports are invoked synchronously today. A rejected Promise can be
missed or wrapped as success. Headless conformance and the kernel host-boundary
must share one fail-closed observation path with cancel/timeout support.

## Decision
Export `invokeTransportAsync` and `classifyTransportFailure` from
`scripts/lib/host-contract/index.js`. Every invoke returns
`Promise<TransportOutcome>`, awaits the port, catches rejections, and never
reports `{ ok: true }` for a rejection. Requests may carry `requestId`,
`AbortSignal`, and `deadlineMs`. Failure classes are stable:
`timeout`, `cancel`, `reject`, `interrupt`, `worker-fail`.

## Alternatives
- Duplicate await/catch per caller: rejected — classification and abort semantics drift.
- Sync-only try/catch: rejected — does not observe rejected Promises (CRITICAL 5).
- Ad-hoc error strings without classes: rejected — fault matrix and schemas need machine-readable classes.

## Consequences
Headless host and `host-boundary` both consume the shared path. Ports become
async-capable; tests must cover abort/deadline. Additive transport envelope
schemas document the request/outcome/failure shapes without mutating existing
transport port `$id`s.
