# ADR-001: Two-Bucket Execution Usage Accounting

- Status: proposed
- Change: k5-usage-accounting-integrity
- Date: 2026-08-22

## Context
Physical effect usage must survive every unconfirmed post-effect exit without being charged again when a completed journal result is skipped on retry. A blocked response may also occur after CAS already committed, so response outcome alone cannot decide carry-over.

## Decision
Track prior carry-over (`P`) separately from usage executed in the current invocation (`N`). Apply both to the CAS candidate, and let an internal `none | pending | committed` disposition tell `createKernelRuntime` whether to preserve `P`, store `P + N`, or clear the partition. Reconciled results never enter `N`.

## Alternatives
- Aggregate every completed journal result: rejected because each CAS retry re-debits historical usage.
- Store the candidate debit and carry-over together: rejected because it double-charges one execution.
- Key carry-over only by subject: rejected because concurrent nodes contaminate each other.

## Consequences
Success, failure, ambiguity, and repeated CAS conflicts share one accounting rule. The state/carry-over exclusivity invariant becomes testable. The change is reversible within the process-local runtime accounting layer.
