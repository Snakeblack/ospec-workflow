# ADR-004: Fail-Closed Authority Boundary on Approvals and Gates

- Status: proposed
- Change: phase-envelope-state-mechanical-projection
- Date: 2026-09-11

## Context
LLM models running in autonomous phase execution turns may attempt to self-attest gate passage or fabricate approval records within return payloads. Permitting self-attested authority undermines the SDD governance model.

## Decision
Enforce a strict, fail-closed authority boundary: `PhaseCompletionReducer` rejects uncommitted gate passes and drops model-asserted approval claims; the orchestrator halts route advancement fail-closed if authoritative approval records are absent from `state.yaml`.

## Alternatives
- Accepting agent-reported approval objects in envelopes: rejected because LLMs could hallucinate intent briefing or review gate approvals without human/verifier verification.
- Soft warnings on unverified approvals: rejected because downstream apply phases could proceed with unapproved architectures.

## Consequences
Preserves the core SDD trust invariant that only authorized human interactions and independent verifiers can grant gate passes. Unauthorized claims cause immediate workflow halts for contract remediation.
