# Proposal: Review Signal Overflow Escalation

## Intent

The selective 4R gate caps a normal change at two specialists, allowing a third or fourth dimension to be labeled `normal-cap-excluded`. This change escalates when evidence warrants full 4R while preserving generalist-first execution and bounded lineage.

## Scope

### In Scope

- Change deterministic classification: 0 positive signals → 0 specialists; 1–2 → targeted review; 3–4 → `depth.review=strict` and full 4R.
- Persist an auditable escalation reason while preserving canonical order, normalized evidence, and fingerprint identity.
- Add focused tests and five-target parity coverage; update routing baseline and O4.1 references only.

### Out of Scope

- Preflight metadata cleanup, link repair, or unrelated documentation maintenance.
- Changes to generalist-first ordering, specialist prompts, frozen findings, correction validation, successor lineage, or bounded budgets.
- Adaptive routing, model selection, cryptographic receipts, or archive transaction work.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `routing`: review-dimension classification and reducer escalate 3+ positive signals to strict full 4R without discarding material evidence.

## Approach

Refine `scripts/lib/review-dimensions.js` as policy authority. After precedence and canonical ordering, count justified signals: retain targeted selection for 0–2, and emit strict-depth/full-4R for 3–4 instead of applying the cap. Update `review-gate-state.js` only to carry the reason and dispatch plan. Keep generalist-first and lineage adapters unchanged; add regression, malformed-input, fingerprint/order, and parity tests.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/review-dimensions.js` | Modified | Signal-count escalation and canonical reasons. |
| `scripts/lib/review-gate-state.js` | Modified | Persist reducer decision and dispatch plan. |
| `scripts/review-dimensions.test.js`, `scripts/review-gate-state.test.js`, `scripts/selective-4r-parity.test.js` | Modified | Boundary and parity regressions. |
| `openspec/specs/routing/` | Modified | Baseline delta for overflow and audit behavior. |
| `docs/roadmaps/harness-evolution.md`, `docs/architecture/harness-evolution.md` | Modified | O4.1 behavior/status references only. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Three-signal changes increase review cost. | High | Record strict-depth evidence and retain workload forecasting. |
| Generated targets diverge. | Medium | Pure-function tests and parity mutation checks across five targets. |
| Existing lineage state breaks. | Low | Add audit data only; keep identity, paths, findings, and budgets immutable. |

## Rollback Plan

Revert classifier/reducer, tests, baseline delta, and O4.1 references together. Legacy two-specialist behavior and gate state remain readable; no lineage migration is needed.

## Dependencies

- Archived O4+O5 selective review and bounded-lineage implementation.
- Node.js native tests and five-target parity harness.

## Success Criteria

- [ ] 0 signals selects none; 1–2 targeted; 3–4 sets `depth.review=strict` and selects all four.
- [ ] No positive signal is `normal-cap-excluded`; order, fingerprint, generalist-first, and lineage remain stable.
- [ ] Malformed evidence still fails closed; focused tests, `npm test`, parity, routing, roadmap, and architecture checks pass.
