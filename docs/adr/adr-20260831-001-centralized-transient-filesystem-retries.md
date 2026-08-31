# ADR-001: Centralized Transient Filesystem Retries

- Status: proposed
- Change: harden-installer-fs-recovery
- Date: 2026-08-31

## Context
Host processes (IDEs, background tasks) frequently hold locks during installation, causing transient `EPERM`, `EACCES`, and `EBUSY` errors across different targets.

## Decision
Centralize retry logic in `install-engine.js` via `withTransientFsRetries` and `mutateFs`, bounding attempts to [0, 5] (default 3 retries) with incremental backoff, injectable sleep for deterministic testing, and structured diagnostic enrichment on exhaustion.

## Alternatives
- Custom ad-hoc retries per installer: Rejected due to logic duplication and inconsistent error reporting.
- Retrying higher-level operations or full runs: Rejected because non-idempotent operations could produce corrupt side effects.

## Consequences
Guarantees uniform retry behavior and error metadata across all installer targets while enabling deterministic unit testing via sleep spies.
