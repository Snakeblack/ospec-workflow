# Tasks: Review Signal Overflow Escalation

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-routing-002: zero, one/two, and three/four signal thresholds | MUST | `scripts/lib/review-dimensions.js` classifier policy | covered-by-design | Count unique positive dimensions after precedence; 3–4 selects canonical full 4R. |
| REQ-routing-002: four-signal order and fingerprint identity | MUST | classifier output plus focused identity/order tests | covered-by-design | Evidence object/fingerprint is copied unchanged. |
| REQ-routing-002: high-risk full 4R override | MUST | existing high-risk branch in `review-dimensions.js` | covered-by-design | Preserve `high-risk-override` reasons and strict depth. |
| REQ-routing-003: deterministic additive audit | MUST | `scripts/lib/review-gate-state.js` read-merge-write | covered-by-design | Persist depth, escalation reason, evidence, generalist, and four dimensions without deleting legacy fields. |
| REQ-routing-003: malformed evidence/generalist fail closed | MUST | existing adapter validation and dispatch guard | covered-by-design | Contract remediation blocks before generalist/specialist dispatch. |
| REQ-routing-003: legacy audit compatibility | MUST | `readReviewGate` compatibility path | covered-by-design | Do not synthesize or rewrite pre-change archived state. |

### Reconciliation Verdict

- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 450–550 (classifier/adapter, focused tests, five-target parity, shared gate guidance, and O4.1 docs) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 classifier + unit tests; PR 2 gate adapter + integration/parity tests; PR 3 shared guidance and O4.1 docs |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Implement classifier-owned overflow policy with strict TDD evidence | PR 1 | `review-dimensions.js` and `review-dimensions.test.js`; RED → GREEN → TRIANGULATE → REFACTOR. |
| 2 | Carry and audit the decision through the gate adapter | PR 2 | `review-gate-state.js`, its tests, and five-target parity assertions; depends on Unit 1. |
| 3 | Align contracts and references | PR 3 | `skills/_shared/gate-4r-review.md`, architecture/roadmap O4.1 references; preserve unrelated hunks. |

## Strict TDD Evidence Expectations

Every implementation task must record a row in `apply-progress.md` with test file, layer, safety net, and RED/GREEN/TRIANGULATE/REFACTOR evidence. RED must be a newly failing focused test; GREEN must pass the focused test; TRIANGULATE must cover malformed inputs, permutations, identity, and cross-target behavior; REFACTOR may change structure only while the full focused suite remains green. Run `npm test` after all focused tests and retain its runtime output for `sdd-verify`.

## Phase 1: RED Contract and Boundary Tests

- [x] 1.1 Add failing 0/1/2/3/4-signal, canonical-order, overflow-reason, fingerprint-identity, and tamper-rejection tests in `scripts/review-dimensions.test.js` [REQ-routing-002]
- [x] 1.2 Add failing adapter tests for additive audit merge, stale-field clearing, malformed evidence, invalid generalist, legacy reads, and lineage handoff in `scripts/review-gate-state.test.js` [REQ-routing-003]
- [x] 1.3 Update `scripts/selective-4r-parity.test.js` with failing five-target probes for strict depth, reason, order, fingerprint, and removal of `normal-cap-excluded` [REQ-routing-002, REQ-routing-003]

## Phase 2: GREEN Core Implementation

- [x] 2.1 Modify `scripts/lib/review-dimensions.js` to count unique positive dimensions after precedence, select targeted 0–2 or strict full 4R for 3–4, emit structured `normal-signal-overflow`, and retain high-risk overrides [REQ-routing-002]
- [x] 2.2 Modify `scripts/lib/review-gate-state.js` to validate/persist `depth` and `escalation_reason`, read-merge existing audit fields, fail closed on invalid contracts, and dispatch canonical specialists without changing `scripts/lib/review-lineage.js` [REQ-routing-003]

## Phase 3: TRIANGULATE Integration and Parity

- [x] 3.1 Run focused classifier and adapter tests, then parity tests across Claude, VS Code, GitHub Copilot, OpenCode, and Codex generated targets; capture runtime evidence [REQ-routing-002, REQ-routing-003]
- [x] 3.2 Verify repeated identical inputs preserve normalized evidence/fingerprint and canonical `risk`, `reliability`, `resilience`, `readability` order, including three-signal fourth-lens selection [REQ-routing-002]
- [x] 3.3 Run `npm test` (`node --test scripts/**/*.test.js`) and record the complete result in `apply-progress.md` [REQ-routing-003]

## Phase 4: REFACTOR, Contracts, and Documentation

- [x] 4.1 Refactor classifier/adapter helpers for deterministic validation and readable reasons without changing passing behavior; rerun focused tests [REQ-routing-002, REQ-routing-003]
- [x] 4.2 Update `skills/_shared/gate-4r-review.md` to document 0–2 targeted versus 3–4 strict overflow while retaining generalist-first and lineage invariants [REQ-routing-003]
- [x] 4.3 Update only O4.1 references in `docs/architecture/harness-evolution.md` and `docs/roadmaps/harness-evolution.md`; preserve unrelated uncommitted documentation hunks [REQ-routing-003]
- [ ] 4.4 At archive, promote the change-local routing delta into `openspec/specs/routing/spec.md`; do not edit the baseline during apply [REQ-routing-002, REQ-routing-003]

## Phase 5: Post-Verify Strict-TDD Evidence Correction (O4.1 tasks-gap)

- [x] 5.1 Amend the three existing coding rows in `openspec/changes/review-signal-overflow-escalation/apply-progress.md` to include the exact RED marker `✅ Written`, retaining each row's original rationale and command context; document that the marker records the already-authored test source and do not claim a historical rerun or alter feature files [REQ-routing-002, REQ-routing-003]
- [x] 5.2 Rerun the focused suites named by rows 1.1/2.1, 1.2/2.2, and 1.3/3.1 plus `npm test`; record only observed commands, exit codes, and counts, and use `✅ Passed` (or `STATIC_VALIDATED`/`DEFERRED` only when execution is unavailable) as the GREEN marker [REQ-routing-002, REQ-routing-003]

### Phase 5 Acceptance Criteria

- `apply-progress.md` retains the prior evidence and adds a correction note; every coding row contains literal RED `✅ Written` and an admitted GREEN marker.
- Focused and full-suite outputs are sourced from the correction run (no invented failures, passes, timestamps, or counts).
- No production, test, generated-target, spec, or baseline files are changed by this remediation; only the evidence artifact is updated.
- `sdd-verify` can re-check the marker contract and route to archive when no other findings remain.

## Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally
