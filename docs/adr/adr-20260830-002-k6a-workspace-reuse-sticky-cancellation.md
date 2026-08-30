# ADR-002: K6a Workspace Reuse and Sticky Cancellation

- Status: proposed
- Change: k6c-integrity-remediation
- Date: 2026-08-28

## Context
Adversarial mutation must alter executable bytes without changing the frozen Candidate, escaping its diff, or allowing a timed-out child to report success.

## Decision
Create one registered K6a workspace per selected challenge, materialize verified Candidate bytes, and execute with the existing confined worker primitive. Scope is derived from digest-verified diff bytes. A monotonic plan deadline and AbortSignal are sticky: timeout always emits `CHALLENGE_TIMEOUT`; late success is ignored. Original Candidate/tree digests are checked before and after.

## Alternatives
- K6c-specific sandbox: rejected as a duplicate, weaker isolation boundary.
- Caller-provided source/paths and elapsed duration: rejected as forgeable.
- Shared workspace across challenges: rejected because mutations can contaminate later results.

## Consequences
K6c inherits K6a confinement and cleanup tests and gains per-challenge isolation. Workspace creation costs more, and executors without enforced challenge/isolation/cancellation capability fail closed.
