# Proposal: K2.1 — Authority Store, OperationPermit y semántica de efectos

## Intent

K2 delivered lifecycle state, journal, commits and effect idempotency, but a
non-empty `AuthorityToken` is still not a real mutation permit, and the store
commits without CAS. Concurrent writers can race from the same revision; stale
or reused tokens are not rejected; effect outcomes can be retried without an
explicit class.

K2.1 closes that authority gap **before** Work Orders, Candidate freeze (K3),
HostCapabilities (K2a) or Graph/Obligation Manifest (K4a). This is a concrete
roadmap delta between K2 and K2a — not a parallel “OSPEC v3”. Source of truth:
`docs/roadmaps/harness-evolution.md` §K2.1 and
`docs/architecture/harness-evolution.md` (2026-08-04 Authority Store
reconciliation).

## Scope

### In Scope

- Authority Store with mandatory CAS: `load(subjectId)` → `{ state, revision }`
  and `compareAndSwap(subjectId, expectedRevision, nextState)`.
- Single-writer wins on `expectedRevision`; CAS conflict MUST NOT restart work
  or inflate budgets; exact replay on the same revision MUST converge.
- Preserve existing journal/commits; CAS is the concurrent mutation contract.
- Separate `TransitionOffer` ≠ `OperationPermit` ≠ `OperationReceipt`
  (revision-bound, single-use permit; receipt = mechanical completion only).
- Effect classes: `pure` | `idempotent-keyed` | `probeable` | `compensatable` |
  `irreversible`; ambiguous irreversible → `decide`/`stop`, never blind retry.
- Block direct-write adapters: every mutation requires permit + CAS + class.
- Fault-matrix fixtures: CAS conflict, stale permit, reuse, ambiguous effect.
- Fixed-policy no-regression.

### Out of Scope

- Four identities / Candidate freeze (K3).
- HostCapabilities / product transports / Headless Conformance Host (K2a).
- Execution Graph / Obligation Manifest (K4a).
- Evaluation Attestation / Delivery Authorization (K8 / K10-delivery).
- Cryptographic signatures without a real trust root.
- Global default / fixed-policy promotion changes.
- Productive budgets beyond permit `budget_ref` digests (K5).

## Capabilities

### New Capabilities

- `authority-store`: CAS `load`/`compareAndSwap`, revision identity, conflict
  semantics, convergent replay over the same revision.
- `operation-permits`: `OperationPermit` / `OperationReceipt` schemas and rules
  (single-use, revision-bound, distinct from `TransitionOffer` and from
  attestation/delivery).
- `effect-semantics`: mandatory effect class, retry/decide/stop policy, ban on
  false exactly-once over shell/Git/external I/O.

### Modified Capabilities

- `lifecycle-kernel-runtime`: mutations require valid permit + CAS; close
  “non-empty token ≠ permit”; models still cannot self-grant permits.
- `minimal-kernel-harness`: exercise CAS/stale/reuse/ambiguous-effect matrix
  through the public kernel entrypoint.
- `lifecycle-model-conformance`: promote CAS/permit/effect invariants from opaque
  `AuthorityToken` placeholders to executable K2.1 checks where owned.
- `kernel-contract-schemas`: add versioned permit/receipt/effect-class contracts;
  do **not** reuse `receipt/v1` as `OperationReceipt`.
- `harness-authority-canon`: mark Authority Store / permits / effect classes as
  implemented for the K2.1 slice (OpenSpec+Git remain semantic authority).

## Approach

Extend the K2 functional-core / imperative-shell (CommonJS, no new runtime deps):

1. Introduce an Authority Store adapter over the existing journaled store with
   revision digests and `compareAndSwap` (replace bare `commit` as the mutation
   API for authoritative subjects).
2. Mint runtime-owned `OperationPermit` from a valid `TransitionOffer` + head
   revision + digests; consume once into `OperationReceipt` on mechanical
   completion.
3. Tag every effect intent with an explicit class; shell retry policy follows
   class (no blind retry on ambiguous `irreversible`).
4. Reject direct-write / model-issued permits at the authorize boundary.
5. Expand Minimal Kernel Harness + model fixtures for the terminal fault matrix.
6. Keep review/archive/routing bridges compatible; fixed remains control/default.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/authority-store/` (or equiv.) | New | CAS store API, revision digests, conflict codes |
| `scripts/lib/lifecycle-kernel/` | Modified | Permit authorize/consume; CAS commits; effect classes |
| `scripts/lib/minimal-kernel-harness.js` | Modified | Fault-matrix scenarios |
| `scripts/lib/lifecycle-model.js` | Modified | CAS/permit/effect invariants |
| `schemas/kernel/` | New/Modified | Permit, OperationReceipt, effect-class contracts + fixtures |
| Review/archive/routing bridges | Modified | No-regression; no second authority |
| `scripts/**/*.test.js` | New/Modified | Strict TDD + harness/model coverage |
| `openspec/specs/*` | Modified on archive | Promote new + delta capabilities |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Scope creep into K2a/K3/K4a/K8 | High | Explicit out-of-scope; opaque ports for non-owned IDs |
| `receipt/v1` confused with OperationReceipt | High | Distinct schema/kind; canon note in design |
| Permit minting by models | High | Runtime-only issuer; tests reject self-grant |
| CAS retrofit breaks journal replay | Med | Preserve journal; CAS wraps commit; convergent replay fixtures |
| False exactly-once over external I/O | Med | Effect classes + ambiguous → decide/stop |
| Review LOC overrun | Med | `delivery_strategy: exception-ok`; slice tasks by store → permit → effects → harness |

## Rollback Plan

1. Revert K2.1 store/permit/effect modules and schema registrations.
2. Restore K2 `commit`-based store and opaque `AuthorityToken` authorize path.
3. Leave K1/K2 schemas, journal history and fixed defaults intact.
4. Disable only K2.1 bridges; do not rewrite review/archive lineages.
5. Keep failed CAS/permit diagnostics as non-authoritative evidence.

## Dependencies

- K2 `k2-lifecycle-kernel` done (archive `2026-08-04-k2-lifecycle-kernel`, v2.38.0).
- Reuses: lifecycle reducer/journal, Minimal Kernel Harness, lifecycle model,
  K1 `state-transition` / `event` / `failure-recovery`, `next-transition.js`.
- Blocks K2a.

## Success Criteria

- [ ] 0 mutations without CAS.
- [ ] 0 stale permits accepted (`expected_revision` ≠ head).
- [ ] 0 permit reuse (`single_use`).
- [ ] 0 ambiguous effects blindly retried.
- [ ] Exact convergent replay on the same revision.
- [ ] Direct-write adapters blocked.
- [ ] Fixed path without regressions.
- [ ] Fault matrix CAS/conflict/stale/reuse/ambiguous-effect covered by fixtures.
- [ ] Models cannot mint or self-grant permits.
- [ ] `TransitionOffer` never authorizes mutation; `OperationReceipt` ≠ attestation/delivery.
