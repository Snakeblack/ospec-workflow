# ADR-006: No Go mirror — JS/Go parity is N/A for the archive runtime

- Status: proposed
- Change: hybrid-archive-transaction-runtime
- Date: 2026-07-26

## Context

The roadmap requires JS/Go parity "where applicable". The only Go consumer, `cmd/ospec-hooks`,
implements session and tool hooks and has no archive responsibility; the runtime is invoked
by the orchestrator through `node`.

## Decision

Ship JS only. Record parity as N/A in the receipt (`parity.go: "n/a"`), in both new specs,
and in the roadmap row for O6A.

## Alternatives

- Mirror the runtime in `internal/archivetransaction` — duplicate transactional filesystem
  logic with no caller.
- Move archive closure into the Go hook binary — expands the hook layer's mandate.

## Consequences

Halves the implementation and test surface of a high-risk change. If a headless CI archive
(explicitly out of scope) ever needs Go, the plan contract is language-neutral JSON, so a
mirror can be added without changing the agent-facing contract.
