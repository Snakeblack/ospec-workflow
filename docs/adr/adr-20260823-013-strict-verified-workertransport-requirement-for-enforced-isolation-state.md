# ADR-002: Strict Verified WorkerTransport Requirement for Enforced Isolation State

- Status: proposed
- Change: k6a-runtime-boundary-closure
- Date: 2026-08-23

## Context
Previously, local subprocess execution via `spawn()` could report `isolationReported = "enforced"` without an active, sandboxed `WorkerTransport` port simply because host proof metadata was present. This created a false isolation guarantee where arbitrary host command execution occurred unsandboxed.

## Decision
Require both verified capability proof AND an active, verified `WorkerTransport` port before reporting `isolationReported = "enforced"`. When `isolationCapability: "enforced"` is requested without a valid `WorkerTransport`, fail closed and reject execution. Local subprocess execution without a sandbox must report `partial` or `unavailable`, never `enforced`.

## Alternatives
- *Permit local spawn with enforced reporting*: Rejected because local process spawning provides no host isolation or resource sandboxing.
- *Silent downgrade without failure*: Rejected because callers requiring enforced isolation would run insecurely without notice.
- *Ignore capability proof and rely on config*: Rejected because capability proof verifies cryptographic binding to the runtime adapter.

## Consequences
- Guarantees that `isolationReported: "enforced"` genuinely represents sandboxed worker transport execution.
- Callers requiring enforced isolation must supply a valid `WorkerTransport`.
- Reversibility: High; enforced capability verification is localized in `executeWorkOrder`.
