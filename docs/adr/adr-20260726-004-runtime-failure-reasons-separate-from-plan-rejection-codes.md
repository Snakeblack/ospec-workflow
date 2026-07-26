# ADR-004: Runtime failure reasons kept separate from plan rejection codes

- Status: proposed
- Change: hybrid-archive-transaction-runtime
- Date: 2026-07-26

## Context

REQ-archive-plan-contract-003 makes the v1 allowlist the authoritative identity of plan
validation failures and orders consumers to treat unknown codes as fail-closed rejections.
The runtime also fails for reasons that are not plan defects: gate state, I/O, compare
mismatch, journal identity conflict.

## Decision

Keep `rejection_codes[]` restricted to the v1 allowlist and carry runtime causes in a
separate receipt field `failure_reason` ∈ `gate-not-satisfied | baseline-stale |
compare-mismatch | commit-failed | journal-plan-conflict | io-error`.

## Alternatives

- Extend the plan allowlist with runtime causes — blurs "unknown code ⇒ fail closed" and
  makes a future schema v2 harder to reason about.
- Free-text diagnostics only — forbidden as the authoritative failure identity.

## Consequences

Consumers can distinguish "the agent's plan is wrong" from "the environment failed" without
parsing prose. Two enums must stay documented. Reversible while the receipt has no external
consumers.
