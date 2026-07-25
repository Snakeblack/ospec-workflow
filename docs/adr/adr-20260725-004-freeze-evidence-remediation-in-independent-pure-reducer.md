# ADR-004: Freeze evidence remediation in an independent pure reducer

- Status: accepted
- Change: strict-tdd-evidence-remediation-fast-path
- Date: 2026-07-25

## Context

An evidence-only repair crosses apply, verify, and orchestrator boundaries and must survive interruption without changing the functional candidate or consuming unbounded retries. The existing 4R lineage reducer owns reviewer-specific semantics and cannot safely be reused.

## Decision

Create a namespaced pure reducer for schema-v1 Strict TDD evidence remediation. It freezes the original finding, canonical functional candidate identity and genesis paths, exact evidence artifact/section allowlist, changed-line budget, and one focal-recheck allowance. The orchestrator persists reducer state before I/O; apply and verify only execute the returned action. Any material delta, identity mismatch, budget breach, unknown unreconciled outcome, or failed recheck transitions to ordinary routing without mutating the frozen identity.

## Alternatives

- Reuse `review-lineage.js`: couples evidence repair to reviewers, findings, and correction attempts.
- Store identity and budget only in prose: cannot enforce or recover deterministic transitions.
- Redispatch full apply/verify after every representation gap: preserves safety but defeats the bounded fast path.

## Consequences

Fast-path behavior is deterministic, resumable, and independently testable. A second small control-plane state contract must ship in every generated target and be updated through read-merge-write. It adds no reviewer allocation, adaptive routing, cryptographic receipts, or O6A archive authority.
