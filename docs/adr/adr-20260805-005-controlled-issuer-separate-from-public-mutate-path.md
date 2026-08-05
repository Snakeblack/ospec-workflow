# ADR-001: Controlled issuer separate from public mutate path

- Status: proposed
- Change: k2-1b-permit-issuance-atomic-consume
- Date: 2026-08-05

## Context

K2.1 `runKernelOperation` defaults `mintPermit = true`, so a state-valid
transition request is effectively auto-authorized. Specs require issuance only
via TransitionOffer + PolicyDecision|HumanDecision|KernelRule + expected_revision,
and forbid public auto-mint.

## Decision

Expose `issueOperationPermit` as the controlled runtime issuer. Public
`runKernelOperation` defaults `mintPermit` to false and rejects `mintPermit: true`
(`auto-mint-disabled`). Positive callers must present an issuer-produced permit.

## Alternatives

- Flag-only default flip while keeping auto-mint branch — still teaches the wrong public path.
- Cryptographic / multi-process issuer — out of scope for K2.1 process-local model.

## Consequences

Harness/model fixtures must issue before mutate (high churn, intentional).
Reversible by restoring the K2.1 mint branch. Extends parent ADR-003 (runtime-
owned ledger) with an explicit issuance gate.
