# ADR-003: Asynchronous Subprocess Synchronization and Close-Event Settlement Barrier

- Status: proposed
- Change: k6a-runtime-boundary-closure
- Date: 2026-08-23

## Context
Two runtime concurrency defects existed: `invokeTransportAsync` had a 3-argument invocation signature mismatch against the 2-argument definition in `host-contract`, and local subprocess abortion suffered race conditions where `recoverInterruptedExecution` executed before child processes fully terminated and flushed stdio streams.

## Decision
Align `invokeTransportAsync(workerTransport, { signal, deadlineMs, input })` to the canonical 2-argument contract and preserve `stdout`, `stderr`, and `exit_code` telemetry across `normalizeTransportOutcome`. In local subprocess fallback, implement an explicit synchronization barrier awaiting the child process `'close'` event and stream settlement before invoking `recoverInterruptedExecution`.

## Alternatives
- *Immediate kill without close barrier*: Rejected because lingering asynchronous writes corrupt post-recovery filesystem inventory.
- *Synchronous execSync fallback*: Rejected because it blocks the Node.js event loop and prevents graceful timeout cancellation.
- *Separate transport adapter wrappers*: Rejected because `invokeTransportAsync` already standardizes async transport invocations.

## Consequences
- Eliminates race conditions during abort/timeout handling and prevents zombie subprocesses.
- Preserves full execution telemetry across transport normalization layers.
- Reversibility: High; changes modify invocation calls and event listeners in `worker-executor.js` and `host-contract/index.js`.
