# Proposal: K2 — Lifecycle Kernel, Minimal Harness y Model-Based Conformance

## Intent

K1 published the versioned lifecycle vocabulary and `next_transition` contracts,
but the harness still lacks one authoritative runtime that derives status,
transitions, recovery and events from persisted state. Existing phases and
orchestrator surfaces can therefore keep interpreting prose or applying local
lifecycle rules.

K2 implements the smallest executable lifecycle protocol before introducing host
transports (K2a), Candidate identity (K3), Execution Graph compilation (K4a),
productive budgets (K5) or delivery authority (K10-delivery). It also delivers a
Minimal Kernel Harness and a reduced model so the kernel is verified as a
replayable protocol rather than only through isolated unit tests.

## Scope

### In Scope

- One host-agnostic lifecycle kernel for:
  - `status`;
  - `start`;
  - `complete`;
  - `fail`;
  - `invalidate-node`;
  - `recover`.
- Deterministic `status → next_transition` using the K1
  `state-transition/v1` contract and ordered transition rules.
- Pure reducer semantics with explicit effect intents; models and projections
  cannot mutate authoritative state directly.
- Idempotent operation journal and reconciliation for interruption/replay.
- Honest recovery: a named command MUST advance the operation or reach an
  explicit terminal state when executed in the Minimal Kernel Harness.
- Derived, non-authoritative event emission.
- Compatibility adapters to the existing routing, review-lineage and archive
  kernels without replacing them.
- Live parity between the human projection and negotiated envelope for the same
  lifecycle condition.
- Minimal headless protocol harness covering reducer execution, command/effect
  application, interruption, replay, idempotency, recovery and state snapshots.
- Reduced model exploration with:
  - executable K2 invariants;
  - opaque ports (`SubjectId`, `AuthorityToken`, `BudgetRef`, `PolicyRef`);
  - deferred invariants explicitly marked as non-enforced.

### Out of Scope

- `HostCapabilities`, host transports or choosing the reference host (K2a).
- `SourceSnapshotId`, `WorkOrderId`, `WorkResultId`, `CandidateId` or candidate
  freeze (K3).
- Execution Graph compilation, invalidation or replay (K4a).
- Productive node/correction budgets (K5/K7).
- Worker isolation or live work-order execution (K6a/K4b).
- Evidence strategies, Assurance Graph, review adjudication, attestations or
  delivery authorization (K6b–K10-delivery).
- Product-scale corpus, multi-target evaluation or 10–30 sequential journeys
  (K12).
- TLA+, PlusCal or Alloy as a delivery requirement.
- Changing `fixed` defaults or activating adaptive routes.

## Capabilities

### New Capabilities

- `lifecycle-kernel-runtime`: authoritative state machine, deterministic
  transitions, recovery, journal/reconciliation and derived events.
- `minimal-kernel-harness`: headless runner for the protocol, interruption,
  replay, recovery and snapshot round-trip.
- `lifecycle-model-conformance`: reduced transition model, invariant exploration
  and reproducible counterexamples.

### Modified Capabilities

- `transition-surface-parity`: upgrades K1 shape parity to runtime parity over the
  transition actually selected by K2; named commands must be operationally honest.

## Approach

Implement a functional core / imperative shell in CommonJS with no new runtime
dependencies:

1. Normalize authoritative lifecycle state and operation requests.
2. Reduce `(state, action)` into:
   - next immutable state;
   - ordered effect intents;
   - derived event descriptors;
   - structured failure/recovery information.
3. Persist state and journal records through an injected store boundary.
4. Execute effect intents through an injected executor, recording idempotency
   keys before reconciliation.
5. Derive `status` and ordered `next_transition` from the committed state.
6. Exercise the same public kernel entrypoint through the Minimal Kernel Harness.
7. Explore a bounded state/action model and replay every counterexample through
   the harness.

The existing `next-transition.js`, K1 schemas and parity helpers remain the
contract surface. K2 consumes them; it does not rename or replace them.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/lifecycle-kernel/` | New | Reducer, transition selection, journal, reconciliation, events and public API |
| `scripts/lib/minimal-kernel-harness.js` | New | Deterministic headless protocol runner |
| `scripts/lib/lifecycle-model.js` | New | Reduced model and transition exploration |
| `scripts/lib/next-transition.js` | Modified | Runtime-selected transition validation and command honesty integration |
| `scripts/lib/transition-parity.js` | Modified | Runtime parity fixtures/normalization |
| Existing orchestrator/routing bridge | Modified | Consume structured kernel operations instead of interpreting prose for covered operations |
| Existing review/archive bridges | Modified | Compatibility adapters and no-regression integration tests |
| `scripts/**/*.test.js` | New/Modified | Strict TDD, model exploration and harness E2E |
| `openspec/specs/*` | Modified on archive | Promote the three new capabilities and the parity delta |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| K2 absorbs K3–K10 concepts | High | Opaque ports and explicit deferred-invariant table; path/scope guards |
| Reducer performs side effects | High | Functional core returns effect intents only; tests reject direct I/O |
| Replay duplicates effects | High | Stable operation/effect idempotency keys plus persisted journal |
| Events become a second authority | Medium | Events derived after commit; reducer never consumes event log as state |
| Recovery command is syntactically valid but useless | High | Harness executes every named recovery and asserts advance-or-terminal |
| Existing review/archive behavior regresses | Medium | Compatibility adapters and focused no-regression fixtures |
| Model and runtime diverge | Medium | Counterexamples must replay through the real harness entrypoint |
| Scope/LOC grows beyond reviewability | High | Single cohesive K2 change, but tasks sliced by authority → reducer → journal → harness → model → bridges |

## Rollback Plan

1. Revert the K2 implementation and remove lifecycle-kernel registrations.
2. Restore existing routing/orchestrator interpretation for operations covered by
   K2.
3. Leave K1 schemas, aliases and validators intact.
4. Keep `fixed` policy/defaults unchanged.
5. Remove only K2 event/journal artifacts; do not mutate review/archive histories.
6. If partial rollout occurred, disable the K2 bridge and retain generated
   diagnostics as non-authoritative evidence.

## Dependencies

- K1 `k1-contract-suite` is `done`, archived and published in v2.37.0.
- Baseline commit for opening K2: `ae6927e`.
- Reuses:
  - `schemas/kernel/state-transition/v1`;
  - `schemas/kernel/failure-recovery/v1`;
  - `schemas/kernel/event/v1`;
  - `scripts/lib/next-transition.js`;
  - `scripts/lib/transition-parity.js`;
  - O4.2 recovery patterns;
  - O6A transactional/reconciliation patterns.
- Blocks K2a.

## Success Criteria

- [ ] Same authoritative state digest produces the same ordered transitions.
- [ ] Invalid transitions fail closed with stable reason codes.
- [ ] Interruption and replay do not duplicate effects.
- [ ] Every named recovery is executed E2E and advances or terminates.
- [ ] Models cannot mutate lifecycle state or grant themselves authority.
- [ ] Terminal exhaustion cannot silently restart the same operation.
- [ ] Events are reproducible from committed state/journal and never alter decisions.
- [ ] Terminal states expose no non-recovery execution transition.
- [ ] Human and negotiated projections contain the same material discriminants.
- [ ] Existing review-lineage and archive behavior passes no-regression tests.
- [ ] The orchestrator no longer interprets prose to select a covered operation.
- [ ] The Minimal Kernel Harness runs without human intervention or auto-approval.
- [ ] Fixtures cover interruption, replay, idempotency, recovery and snapshot round-trip.
- [ ] Model exploration runs in CI and each counterexample is reproducible through the harness.
- [ ] Opaque-port invariants are modeled without inventing Candidate, policy or delivery implementations.
- [ ] Deferred invariants are documented but have no fake K2 enforcement.
