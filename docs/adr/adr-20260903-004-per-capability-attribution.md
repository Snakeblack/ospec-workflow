# ADR-004: Per-Capability Attribution and Blast-Radius Residue

- Status: proposed
- Change: quality-review-gate
- Date: 2026-09-03

## Context

Clarify B5: `cross-capability-blast-radius` fires when more than three distinct behavioral capabilities are affected and at least one lacks deterministic domain attribution. Inferring scopes from capability-id path prefixes would invent attribution and hide incomplete coverage. A flat residual `paths ≤20` list can drop a small capability behind a large one.

## Decision

Classifier units are `input.capabilities`. `capability_scopes` is **explicit attribution authority**. There is no POSIX prefix/segment match. If a scope is present for X, use the validated mapping (`scope.id` ∈ `capabilities[]`, `scope.paths` ⊆ `paths[]`, no duplicate/divergent scopes). If a scope is absent for X, X is behavioral and unscoped; path-derived facts MUST NOT claim attribution to X. A global fact MAY select a domain (`selected_domains` includes it) without attributing specific capabilities. Blast radius uses behavioral count `> 3` plus ≥1 unattributed; residue is exactly those unattributed capabilities, each with deterministically bounded `paths`, `total_paths`, and `truncated`. A single unattributed runtime change uses `runtime-code-without-domain-attribution`, not blast radius.

## Alternatives

- Count filesystem packages — rejected by B5.
- Infer scopes from capability-id path segments — fakes attribution.
- Treat any global signal as full coverage — hides unattributed capabilities.
- Flat residual path list with a global cap — can silently drop a capability.

## Consequences

Evidence schema v2 grows `capability_coverage` and per-capability `residual_evidence.capabilities[]`. Orchestrators that omit scopes increase ambiguity (safer). Threshold `>3` is bootstrap-only; no live auto-tune. Reversible as part of the v2 evidence contract.
