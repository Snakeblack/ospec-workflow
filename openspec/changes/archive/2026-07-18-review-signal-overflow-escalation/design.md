# Design: Review Signal Overflow Escalation

## Technical Approach

Use `scripts/lib/review-dimensions.js` as the sole policy authority for counting unique positive dimensions after evidence/generalist reason construction. Normal changes retain targeted review for zero to two positive dimensions; three or four switch to strict depth and select the canonical four dimensions. `scripts/lib/review-gate-state.js` validates that decision, persists the additive depth/escalation audit, and maps the already-canonical selection to reviewers. The generalist-first handler and bounded-lineage reducer consume the result without reinterpreting it.

## Requirement Allocation

| Spec scenario | Design allocation |
|---|---|
| Normal, zero signals | Classifier returns `depth.review: targeted`, no specialists, four deterministic negative reasons; unit boundary test. |
| Normal, one or two signals | Classifier selects exactly the justified dimensions, output in canonical order; unit boundary/permutation tests. |
| Normal, three signals | Classifier returns strict depth, a structured overflow reason, and all four dimensions; unit and gate-plan tests. |
| Four-signal identity | Decision reuses the normalized evidence object/fingerprint and emits canonical specialists; identity/order assertions. |
| High-risk full 4R | Existing `high-risk-override` branch remains full 4R and reports strict depth; regression test. |
| Complete deterministic audit | Gate adapter read-merge-writes depth, escalation reason, evidence, generalist, and all dimensions; repeat-evaluation test. |
| Escalation reason audit | Gate test verifies the exact structured reason and unchanged fingerprint/order. |
| Malformed evidence | Existing normalization and decision validation errors flow to `contract-remediation`; negative tests. |
| Invalid generalist | Existing generalist validation remains before derivation/dispatch; negative tests. |
| Legacy state | `readReviewGate` continues to clone legacy gates without synthesis or rewrite; compatibility test. |

## Architecture Decisions

### Decision: Count positive dimensions at the classifier boundary

**Choice**: Build reasons as today, count `candidates` (unique justified dimensions) before adding policy overrides, and branch on `0..2` versus `3..4`. For overflow, select `DIMENSIONS` rather than slicing ranked candidates.

**Alternatives considered**: Count raw fact codes; escalate in the orchestrator or gate adapter; retain a ranked top-two cap.

**Rationale**: One fact may justify multiple dimensions and multiple facts may justify one dimension, so raw-fact counts are not the review workload. Keeping the threshold beside precedence and canonical ordering prevents prompts/adapters from developing a second policy.

### Decision: Add explicit depth and structured escalation audit

**Choice**: Extend every newly derived decision with `depth: { review: "targeted" | "strict" }` and `escalation_reason`, which is `null` unless a normal change has three or four positive dimensions. The overflow value is `{ code: "normal-signal-overflow", positive_dimensions: 3 | 4, detail: <canonical text> }`. The adapter persists both fields under `gates.4r-review-gate`. Overflow also adds a canonical `signal-overflow-override` reason (`source: "override"`) to all four dimension decisions so the otherwise-unsignaled fourth lens in a three-signal case is never selected with only a negative reason.

**Alternatives considered**: Infer strict depth from four selected specialists; persist only free-form prose; overload `high-risk-override`; omit the audit field when inactive.

**Rationale**: Four specialists can result from either high-risk classification or signal overflow. An explicit, validated reason makes that distinction reproducible, and `null` clears stale escalation state during read-merge-write. This additive schema-v1 audit remains readable by legacy consumers; archived gates are not rewritten. See `decisions/adr-001.md`.

### Decision: Preserve bounded lineage as a downstream consumer

**Choice**: Do not modify `scripts/lib/review-lineage.js`. Pass its genesis the classifier's canonical `selected_specialists` and unchanged evidence fingerprint. Update only focused adapter coverage to prove a normal overflow starts four one-shot lenses in canonical order.

**Alternatives considered**: Add an escalation transition or mutable lens expansion to the lineage reducer.

**Rationale**: Escalation occurs before genesis is frozen. The current reducer already supports zero through four canonical selected dimensions; changing it would risk identity, attempt, budget, findings, and successor invariants outside O4.1.

## Data Flow

```text
verified inputs + real diff
        |
        v
normalizeReviewEvidence() ----> stable evidence fingerprint
        |
        v
read-only review-change generalist
        |
        v
deriveReviewDimensions()
  build reasons -> count positive dimensions
       | 0-2                         | 3-4 normal
       v                             v
  targeted depth              strict depth + full 4R
       \_____________________________/
                     |
                     v
validateReviewDecision() --invalid--> contract-remediation; no dispatch
                     |
                   valid
                     v
planReviewGate() -> merged audit -> startReviewLineage()
                                      |
                                      v
                         canonical one-shot lens dispatch
```

Generalist execution remains before derivation and specialist dispatch. Neither the gate adapter nor the orchestrator recalculates signal counts.

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/lib/review-dimensions.js` | Modify | Add threshold/depth/escalation policy, overflow reason code, and conditional contract validation; remove emission of `normal-cap-excluded`. |
| `scripts/lib/review-gate-state.js` | Modify | Persist validated `depth` and `escalation_reason`, preserve historical fields, and keep deterministic fail-closed dispatch. |
| `scripts/review-dimensions.test.js` | Modify | Add 0/1/2/3/4 boundaries, permutation, identity, overflow-reason, and tamper tests. |
| `scripts/review-gate-state.test.js` | Modify | Cover normal strict four-reviewer plan, additive audit merge, stale-field clearing, fail-closed behavior, and lineage handoff. |
| `scripts/selective-4r-parity.test.js` | Modify | Replace cap probes/mutants with overflow depth, reason, canonical order, fingerprint, and five-target runtime assertions. |
| `skills/_shared/gate-4r-review.md` | Modify | Replace the obsolete normal-cap contract with the 0-2 targeted / 3-4 strict policy; retain generalist-first and lineage rules. |
| `docs/architecture/harness-evolution.md` | Modify | Mark the documented target overflow behavior as implemented; edit only O4.1 references. |
| `docs/roadmaps/harness-evolution.md` | Modify | Mark O4.1 delivered and advance the next item; leave unrelated preflight cleanup untouched. |
| `openspec/specs/routing/spec.md` | Promote at archive | Merge the existing change-local delta through `sdd-archive`; do not edit the baseline directly during apply. |

Existing uncommitted documentation changes must be preserved with hunk-scoped edits.

## Interfaces / Contracts

```js
{
  schema_version: 1,
  classification: "normal" | "high-risk",
  evidence: { schema_version: 1, fingerprint, sources },
  generalist: { status, specialists, reason },
  depth: { review: "targeted" | "strict" },
  escalation_reason: null | {
    code: "normal-signal-overflow",
    positive_dimensions: 3 | 4,
    detail: "Normal review has N positive dimensions; strict full 4R required"
  },
  dimensions: { risk, reliability, resilience, readability },
  selected_specialists: [/* canonical dimension ids */]
}
```

Validation recomputes the decision from normalized evidence and the generalist result. Normal `0..2` requires targeted depth and `null` escalation; normal `3..4` requires strict depth, the exact structured reason, all four specialists, and no `normal-cap-excluded`; high-risk requires strict depth, `null` overflow reason, all four specialists, and existing per-dimension `high-risk-override`. The evidence object is copied unchanged, so its fingerprint is never recalculated from policy output.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Thresholds, precedence, canonical order, reason schema, fingerprint identity, tamper rejection | Strict TDD in `review-dimensions.test.js`; start with failing 3/4-signal and contract tests, then triangulate 0/1/2/high-risk. |
| Adapter integration | Audit merge, four-reviewer dispatch, legacy read, error sanitization, lineage handoff | Strict TDD in `review-gate-state.test.js`; assert exact dispatch and no archive on invalid input. |
| Generated parity | Runtime policy and mutation resistance in Claude, VS Code, GitHub Copilot, OpenCode, and Codex outputs | Update the generated-tree probe/mutants in `selective-4r-parity.test.js`. |
| Regression | Full repository contracts, docs/spec consistency, generated runtime roots | Run focused Node tests, parity test, then `npm test`. Preserve RED/GREEN/TRIANGULATE/REFACTOR evidence for apply/verify. |

## Migration / Rollout

No state migration or feature flag is required. New gate evaluations write the additive audit fields; legacy archived gates without them remain readable and untouched. Rollback reverts classifier, adapter, handler, tests, and O4.1 documentation together; existing lineage records remain valid because their frozen genesis is unchanged.

## Open Questions

None.
