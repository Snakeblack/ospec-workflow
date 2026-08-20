# Proposal: K5 — Budgets, Causal Failures, and Common Recovery

## Intent

Implement Block 5 (K5) of the harness evolution roadmap (`docs/roadmaps/harness-evolution.md`, lines 854-894; `docs/architecture/harness-evolution.md`). K5 introduces uniform per-node execution budgets and authoritative effect limits, establishes a causal failure taxonomy with an allowlisted transition matrix (`repair`, `replan`, `escalate`, `stop`), enforces strict budget monotonicity across retries and CAS conflicts, ensures non-semantic separation of consumption telemetry, requires zero-delta attempt consumption, and guarantees honest E2E recovery by requiring blocking fingerprint advancement or explicit terminal stop. K5 absorbs and supersedes P7, P8, P18, O4.2, and legacy verify routing.

## Scope

### In Scope
- **Node-level budgets**: Uniform quotas for `turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines`, and `allowed_paths`.
- **Authority and effect budgets**: Dedicated limits for `effect_attempts`, `authority_mutations`, `evidence_runs`, and `review_sweeps`.
- **Causal failure taxonomy**: Typed failure classification distinguishing environment/tooling faults, CAS conflicts, ambiguous effects, validation gaps, and code defects.
- **Causal priority resolution**: Deterministic precedence rules for mixed failure sets preventing misclassification of infrastructure issues as code bugs.
- **Allowlisted transition matrix**: Explicit mapping of failure codes to valid recovery operations (`repair`, `replan`, `escalate`, `stop`).
- **Budget monotonicity**: Strict non-resetting budget accounting across retries, CAS race reconciliations, and repair loops.
- **Zero-delta consumption**: Attempt counting for actions that produce zero semantic progress.
- **Honest E2E recovery**: Proof of blocking fingerprint advancement or deterministic terminal termination.
- **Telemetry separation**: Consumption counters and metrics isolated outside canonical semantic lifecycle state.

### Out of Scope
- Isolated worker container execution or work-order capsule execution runtime (deferred to K6a).
- Independent verification, multi-strategy evidence selectors, and review authority emission (deferred to K6b, K7, K8).
- Multi-worker shadow orchestration (deferred to K4b).

## Capabilities

### New Capabilities
- `execution-budgets`: Uniform node execution limits (`turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines`, `allowed_paths`), authority & effect budgets (`effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`), monotonicity enforcement without implicit reset on retry or CAS conflict, and telemetry isolation outside semantic state.
- `failure-recovery`: Causal failure taxonomy, deterministic causal priority resolution for mixed failures, allowlisted transition matrix (`repair`, `replan`, `escalate`, `stop`), zero-delta attempt consumption, and honest E2E recovery validation via blocking fingerprint advancement or terminal termination.

### Modified Capabilities
- `kernel-contract-schemas`: Register versioned schemas and fixtures for unified node budgets, authority & effects budgets, causal failure descriptors, and failure-recovery transitions.
- `lifecycle-kernel-runtime`: Integrate causal failure classification, budget monotonicity enforcement, allowlisted transition routing, and zero-delta attempt consumption into lifecycle reducers and transition selection.
- `contract-lint`: Add lint checkers verifying causal failure taxonomy conformance, transition allowlist validity, and budget structure completeness across execution graphs and work orders.
- `lifecycle-model-conformance`: Extend model tests with causal priority resolution, budget exhaustion terminality, zero-delta accounting, and CAS conflict / retry monotonicity proofs.

## Approach

1. **Budget Engine & Monotonicity**: Implement unified budget evaluation in `scripts/lib/` covering node operations (`turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines`, `allowed_paths`) and authority actions (`effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`). Store transient telemetry outside semantic state and enforce decrement-only / monotonically non-increasing budgets across retries and CAS reconciliations.
2. **Causal Failure Classifier & Priority**: Define typed failure taxonomy in `scripts/lib/` mapping environment faults, CAS conflicts, ambiguous effects, and validation gaps to structured failure objects. Implement priority ordering ensuring external/tooling failures are never attributed to code defects.
3. **Allowlisted Transition Matrix**: Implement state transition table mapping each failure code to allowlisted operations (`repair`, `replan`, `escalate`, `stop`). Enforce bounded repair scopes (restricting nodes, paths, and findings) and ensure exhausted budgets trigger terminal transitions.
4. **Zero-Delta & Honesty Enforcement**: Hook attempt counters to register zero-delta operations and validate that every recovery step advances the `blockingFingerprint` or enters an explicit terminal state.
5. **Schemas, Lint & Conformance**: Publish contract schemas in `schemas/kernel/`, register contract-lint rules, and expand model-based conformance testing.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `schemas/kernel/` | Modified | Schemas and fixtures for budgets, failure taxonomy, and failure-recovery transitions |
| `scripts/lib/` | New/Modified | Budget enforcement, causal failure classification, transition matrix, and honesty validation |
| `openspec/specs/execution-budgets/` | New | Specification for node and authority/effect budgets, monotonicity, and telemetry separation |
| `openspec/specs/failure-recovery/` | New | Specification for causal failure taxonomy, transition matrix, priority resolution, and honesty |
| `openspec/specs/kernel-contract-schemas/` | Modified | Delta spec for budget and failure-recovery schema updates |
| `openspec/specs/lifecycle-kernel-runtime/` | Modified | Delta spec for budget monotonicity, causal routing, and zero-delta consumption |
| `openspec/specs/contract-lint/` | Modified | Delta spec for budget, taxonomy, and transition lint rules |
| `openspec/specs/lifecycle-model-conformance/` | Modified | Delta spec for budget and recovery conformance model checks |
| `scripts/**/*.test.js` | New/Modified | Unit, integration, and property tests for budgets, causal failures, and recovery flows |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Overly restrictive budgets causing premature worker termination | Med | Provide sensible baseline defaults and explicit escalation paths to `replan` |
| Misclassification of mixed failures leading to incorrect recovery routing | Med | Enforce strict deterministic causal priority resolver backed by comprehensive test matrix |
| Budget leakage or silent reset during CAS retry loops | Low | Model budget consumption in kernel state transitions independent of CAS transaction retries |
| Zero-delta false positives on non-mutating inspection steps | Low | Restrict zero-delta attempt consumption strictly to effect-bearing and mutation steps |

## Rollback Plan

Revert the PR/commit implementing K5. Since K5 defines pure contracts, budget checks, failure taxonomy classification, and kernel recovery validation without altering external persistence stores or downstream isolated worker runtime, reverting restores previous transition routing and baseline budgets without data loss.

## Dependencies

- Prerequisites: K4a (Execution Graph Compiler, Obligation Manifest, and Deterministic Replay).

## Success Criteria

- [ ] Node execution budgets (`turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines`, `allowed_paths`) and authority/effect budgets (`effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`) are enforced monotonically.
- [ ] Exhausted budgets deterministically prevent re-launching identical workers and force `escalate` or `stop`.
- [ ] Causal failure taxonomy correctly classifies environment, tooling, CAS, ambiguity, and code failures.
- [ ] Mixed failure sets resolve deterministically according to causal priority without blaming code for environment faults.
- [ ] Each failure code maps to an allowlisted transition (`repair`, `replan`, `escalate`, `stop`).
- [ ] Zero-delta operations consume attempts when applicable.
- [ ] E2E recovery validation verifies blocking fingerprint advancement or explicit terminal stop.
- [ ] Consumption telemetry remains strictly separated from canonical semantic lifecycle state.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
