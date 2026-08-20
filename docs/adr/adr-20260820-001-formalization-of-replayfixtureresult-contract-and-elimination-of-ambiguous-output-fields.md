# ADR-001: Formalization of ReplayFixtureResult Contract and Elimination of Ambiguous Output Fields

- Status: proposed
- Change: k4a-replay-completion-contract-reconciliation
- Date: 2026-08-20

## Context

Requirement REQ-006 previously specified closed completion discrimination for deterministic replay but included the ambiguous phrase "missing output fields" without formalizing an output schema. This created potential confusion about whether fixtures required a separate `output` payload competing with `evidence`, or whether live runtime `WorkResult` schemas belonged in K4a replay.

## Decision

1. Formalize the minimal canonical `ReplayFixtureResult` contract across 6 explicit completion dimensions: (1) Provenance (`graph_id` + `work_order_id`), (2) Terminal Status (`completed`), (3) Exit Code (`0`), (4) Evidence Object (`typeof === "object"` && `!Array.isArray`), (5) Node Required Evidence coverage, and (6) Post-evaluation Obligation satisfaction.
2. Eliminate "missing output fields" by treating the `evidence` object as the sole authoritative container for node outputs and proofs.
3. Preserve strict kernel boundaries: live `WorkResult` execution payloads remain exclusive to K6a / K4b, and fine-grained obligation causality remains deferred to K5.

## Alternatives

- **Parallel Output Schema**: Introduce a dedicated `outputs` dictionary in fixtures alongside `evidence`. Rejected because it duplicates evidence semantics, bloats fixture structures, and conflicts with future K6a/K4b contracts.
- **Status Quo (Unspecified Output Fields)**: Keep "missing output fields" without formal definition. Rejected because vague requirements cause contract drift and test non-determinism.

## Consequences

- **Positive**: Exact, minimal, and fully verifiable fixture contract with zero redundant schemas.
- **Positive**: Strict decoupling of K4a replay from live execution kernels (K5, K6a).
- **Negative / Trade-offs**: Fixtures must encapsulate all node results within the structured `evidence` map. Reversibility is high.
