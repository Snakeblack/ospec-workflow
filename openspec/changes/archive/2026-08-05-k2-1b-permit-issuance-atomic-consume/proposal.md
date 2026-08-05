# Proposal: K2.1b — Permit issuance control and atomic consume

## Intent

K2.1 delivered Authority Store CAS, `OperationPermit`, and effect classes, but
two authority gaps remain before K3:

1. Public `runKernelOperation` defaults `mintPermit = true`, so a valid
   transition request is effectively auto-authorized.
2. Permit consume lives in a separate in-memory Map after `compareAndSwap`. CAS
   can succeed while consume fails (`operation_receipt: null`); replay/restart
   cannot treat permit+receipt as part of the authoritative revision.

This corrective hardening slice closes those gaps **before** Candidate/K3. It
does **not** reopen K2a scope. Parent:
`openspec/changes/archive/2026-08-04-k2-1-authority-store-permits/`.

## Scope

### In Scope

- Public authoritative entrypoint MUST default `mintPermit = false`.
- Separate controlled issuer path:
  `TransitionOffer + PolicyDecision|HumanDecision|KernelRule + expected_revision
  → issue OperationPermit` (runtime-owned; not model/self-grant).
- Positive mutating tests MUST obtain a previously issued permit from that
  issuer — no auto-mint convenience on the public path.
- Permit consumed status, `next_state`, `next_journal`, and `OperationReceipt`
  MUST commit in the **same** authoritative CAS revision.
- Exact identical-operation replay MUST return the prior `OperationReceipt`
  (no second ledger/receipt).
- After in-process restart (K2.1 process-local durability model), permit and
  receipt MUST remain verifiable from the authority-store revision.
- Roadmap WARNING 5: `docs/roadmaps/harness-evolution.md` quick-path
  `Ejecutar K2a → K3` MUST become `Ejecutar K3` **or** reflect that
  K2.1b / k2a-1 correctives precede K3 (approved docs fix).

### Out of Scope

- K2a live capability probes / async transports / Claude enforced states
  (`k2a-1-live-capability-probes-async-transports`).
- K3 Candidate freeze / identities / relation algebra runtime.
- Multi-process durable ledger beyond K2.1’s process-local store (consume +
  receipt still MUST ride the same CAS revision as state).
- Cryptographic trust roots, attestation, delivery authorization.

## Capabilities

### New Capabilities

- None

### Modified Capabilities

- `operation-permits`: Controlled issuance (offer + decision/rule + revision);
  public path must not auto-mint; consume + `OperationReceipt` are revision-
  authoritative; exact replay returns prior receipt.
- `authority-store`: CAS payload MUST atomically include permit consumed status
  and `OperationReceipt` with next state/journal.
- `lifecycle-kernel-runtime`: `runKernelOperation` defaults `mintPermit=false`;
  mutating ops require a pre-issued permit; fail closed if consume cannot be
  part of the successful CAS.
- `minimal-kernel-harness`: Fault/positive matrix uses controlled issuer; assert
  atomic consume and replay/restart receipt stability.
- `lifecycle-model-conformance`: Promote “no auto-authorize on state-valid” and
  “no commit without consumed permit in same revision” invariants.
- `harness-authority-canon`: Record K2.1b corrective maturity (issuance vs
  consume atomicity) without claiming K3 readiness.

## Approach

Keep functional-core / imperative-shell (CommonJS, Strict TDD):

1. Flip public default to `mintPermit = false`; keep mint only on an explicit
   issuer API (or gated internal helper) that requires TransitionOffer +
   PolicyDecision/HumanDecision/KernelRule + `expected_revision`.
2. Extend Authority Store CAS so the winning revision records permit consumed
   status + OperationReceipt alongside next state/journal (process-local
   durability preserved; separate Map is no longer the sole consume truth).
3. On exact replay of an identical authorized operation, return the stored prior
   OperationReceipt; do not mint/consume again.
4. Update harness, model, and kernel tests under Strict TDD (RED→GREEN) so
   fixtures issue permits first.
5. Patch roadmap quick-path per approved WARNING 5.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/lifecycle-kernel/index.js` | Modified | Default `mintPermit=false`; atomic post-effect commit |
| `scripts/lib/lifecycle-kernel/permits.js` | Modified | Controlled issuer; consume tied to CAS revision |
| `scripts/lib/authority-store/index.js` | Modified | CAS payload carries permit/receipt records |
| `scripts/lib/minimal-kernel-harness.js` | Modified | Issuer-first scenarios; no auto-mint defaults |
| `scripts/lib/lifecycle-model.js` | Modified | New authority invariants |
| `scripts/lib/**/*.test.js` | Modified | Strict TDD coverage for gates |
| `docs/roadmaps/harness-evolution.md` | Modified | Quick-path precedes-K3 wording |
| `openspec/specs/*` (on archive) | Modified | Promote deltas |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Callers/tests break when auto-mint removed | High | Controlled issuer helper; migrate harness/model fixtures first (Strict TDD) |
| Partial migrate leaves dual truth (Map vs CAS) | Med | Single authoritative consume record in CAS revision; ledger mirrors only |
| Scope creep into K2a/K3 | High | Explicit out-of-scope; plan approval `plan-001` |
| Review LOC overrun | Med | `delivery_strategy: exception-ok`; slice issuer → CAS payload → replay → docs |
| Process-local durability misread as multi-process | Low | Document K2.1 model unchanged; assert in-process restart only |

## Rollback Plan

1. Revert K2.1b kernel/store/permit/harness/model edits and roadmap quick-path.
2. Restore K2.1 `mintPermit=true` default and post-CAS Map consume behavior.
3. Leave K2.1 schemas, journal history, and fixed-policy defaults intact.
4. Do not rewrite review/archive lineages or reopen K2a/K3 artifacts.

## Dependencies

- Parent K2.1 archived (`2026-08-04-k2-1-authority-store-permits`, v2.39.0).
- K2a archived separately; this change does not depend on k2a-1 completion.
- Blocks K3 Candidate runtime until this corrective (and planned k2a-1) close
  per approval `plan-001`.

## Success Criteria

- [ ] 0 operations authorized solely because they are state-valid.
- [ ] 0 commits without a previously issued permit.
- [ ] 0 state commits without permit consumed in the same revision.
- [ ] Exact identical replay → same OperationReceipt.
- [ ] In-process restart → permit/receipt still verifiable from authority-store revision.
- [ ] Roadmap quick-path no longer says bare `Ejecutar K2a → K3` without correctives.
- [ ] Strict TDD evidence for issuer, atomic consume, replay, and restart paths.
