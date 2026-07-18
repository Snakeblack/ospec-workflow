# Apply Progress: Review Signal Overflow Escalation

## Batch 1 — O4.1 implementation

Delivery path: `size:exception` (approved in `state.yaml`). Scope is limited to the O4.1 classifier, gate adapter, focused/parity tests, shared gate guidance, and O4.1 documentation references. `review-lineage.js` and archive baseline promotion are intentionally unchanged.

### Completed work

- [x] 1.1 Added threshold, canonical-order, overflow-reason, fingerprint identity, and tamper-rejection tests in `scripts/review-dimensions.test.js`.
- [x] 1.2 Added additive audit, stale-field, malformed-contract, legacy-read, and lineage adapter coverage in `scripts/review-gate-state.test.js`.
- [x] 1.3 Updated five-target parity probes and mutation guards in `scripts/selective-4r-parity.test.js`.
- [x] 2.1 Implemented classifier-owned 0/1-2/3-4 policy with strict overflow depth and structured reason.
- [x] 2.2 Persisted `depth` and `escalation_reason` through read-merge gate audit while preserving fail-closed validation and canonical dispatch.
- [x] 3.1–3.2 Focused, adapter, and five-target parity tests pass; repeated evidence fingerprints and canonical order remain stable.
- [x] 3.3 Full `npm test` passes with `0 errors, 0 warnings` and `All checks passed.`
- [x] 4.1 Refactored policy branches/reason validation while retaining deterministic output.
- [x] 4.2 Updated `skills/_shared/gate-4r-review.md` with targeted versus strict overflow policy and retained generalist-first/lineage invariants.
- [x] 4.3 Updated only O4.1 references in architecture/roadmap docs; unrelated existing O20A documentation hunks were preserved.
- [ ] 4.4 Baseline promotion is an archive-phase responsibility and remains deferred to `sdd-archive`.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| 1.1 / 2.1 | `scripts/review-dimensions.test.js` | Unit | ✅ 22/22 baseline | ✅ Written — New threshold/tamper tests failed before implementation; marker records the already-authored test source, not a historical rerun | ✅ Passed — `node --test scripts/review-dimensions.test.js`; exit 0; tests 25; pass 25; fail 0; skipped 0 | ✅ 0/1/2/3/4, permutations, malformed evidence, identity, high-risk | ✅ Focused suite remains green | Overflow adds strict depth, structured reason, and canonical override reasons. |
| 1.2 / 2.2 | `scripts/review-gate-state.test.js` | Adapter integration | ✅ 11/11 baseline | ✅ Written — New audit-depth test failed before adapter persistence; marker records the already-authored test source, not a historical rerun | ✅ Passed — `node --test scripts/review-gate-state.test.js`; exit 0; tests 12; pass 12; fail 0; skipped 0 | ✅ additive merge, stale fields, malformed/invalid contracts, legacy read, lineage handoff | ✅ Focused suite remains green | Audit fields are read-merge-written; historical fields survive. |
| 1.3 / 3.1 | `scripts/selective-4r-parity.test.js` | Generated-target integration | ✅ 3/3 baseline | ✅ Written — Overflow probe/mutation expectations failed before policy update; marker records the already-authored test source, not a historical rerun | ✅ Passed — `node --test scripts/selective-4r-parity.test.js`; exit 0; tests 3; pass 3; fail 0; skipped 0 | ✅ Claude, VS Code, GitHub Copilot, OpenCode, Codex; strict depth/reason/order/fingerprint and mutation guards | ✅ Regenerated probes remain green | All target roots consume the same classifier and adapter runtime. |
| 3.3 | `npm test` | Repository regression | ✅ Focused suites green | N/A (regression gate) | ✅ `0 errors, 0 warnings`; `All checks passed.` | ✅ Full generated/runtime contract suite | ✅ No post-suite changes to behavior | Runtime output retained for verify. |

### Deviations and risks

- None from the approved design. `review-lineage.js` was not modified.
- Task 4.4 is intentionally deferred until archive so the baseline is promoted only by `sdd-archive`.

### Phase 5 — Post-Verify Strict-TDD Evidence Correction

Tasks 5.1 and 5.2 are complete. The three coding rows above now use the exact RED marker `✅ Written` while retaining their historical rationale; this marker attests to the already-authored test source and does not claim a historical rerun. No production, test, generated-target, spec, or baseline files were changed.

Observed correction-run commands and results:

- `node --test scripts/review-dimensions.test.js` — exit 0; tests 25; pass 25; fail 0; skipped 0.
- `node --test scripts/review-gate-state.test.js` — exit 0; tests 12; pass 12; fail 0; skipped 0.
- `node --test scripts/selective-4r-parity.test.js` — exit 0; tests 3; pass 3; fail 0; skipped 0.
- `npm test` — exit 0; tests 1377; pass 1375; fail 0; skipped 2; `0 errors, 0 warnings`; `All checks passed.`
