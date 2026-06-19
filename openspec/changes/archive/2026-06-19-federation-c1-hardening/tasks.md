# Tasks: federation-c1-hardening (C6)

**Delivery**: Single PR, exception-ok
**Estimated changed lines**: ~200-250

---

## Phase 1 — Spec alignment (W1)

- [x] **T1.1** Edit `openspec/specs/workspace-explore/spec.md`: add cross-reference to `federation-markers` spec for marker schema authority
- [x] **T1.2** Edit `openspec/specs/workspace-explore/spec.md`: replace any inline marker field descriptions with references to the authoritative spec

## Phase 2 — Fix `isCorruptCache` (W2)

- [x] **T2.1** Edit `scripts/lib/artifact-store.js`: change `isCorruptCache(content, parsed)` to `isCorruptCache(content)` using structural header detection (`/^members:/m` or `//^contracts:/m`)
- [x] **T2.2** Update callers of `isCorruptCache` in `loadAtlas()` to pass only `content`
- [x] **T2.3** Add test: empty-but-valid workspace.yaml (`members:\ncontracts:\n`) is NOT corrupt
- [x] **T2.4** Add test: garbage YAML IS corrupt (regression test for existing behavior)
- [x] **T2.5** Verify existing "regenerates and warns when the cache is corrupt" test still passes

## Phase 3 — DI seam for git (W3)

- [x] **T3.1** Edit `scripts/lib/artifact-store.js`: add `{ execGitSync }` parameter to `createWorkspaceFederatedStore(workspace, opts)` with default `spawnSync`
- [x] **T3.2** Edit `warnIfGitTracked()` to use `execGitSync` from closure
- [x] **T3.3** Propagate `execGitSync` through `createArtifactStore(opts)` when mode is `workspace-federated`
- [x] **T3.4** Propagate `execGitSync` through `createArtifactStoreFromConfig(opts)`
- [x] **T3.5** Refactor test "warns but keeps loading when workspace.yaml is git-tracked": inject mock `execGitSync` instead of calling real `git`
- [x] **T3.6** Verify all existing artifact-store tests pass

## Phase 4 — Explore marker roster (S1)

- [x] **T4.1** Edit `scripts/lib/federation-explore.js`: add `roster: []` to `buildMemberData()` return value
- [x] **T4.2** Add or update test: verify that explore-enrolled markers contain `roster: []`
- [x] **T4.3** Verify existing explore tests pass unchanged

## Phase 5 — Code quality: JSDoc and naming (S4-S6)

- [x] **T5.1** Add JSDoc to all exported functions in `scripts/lib/workspace-atlas.js` (incl. `loadMarkerFromMember` added in remediation)
- [x] **T5.2** Add JSDoc to all exported functions in `scripts/lib/federation-marker.js`
- [x] **T5.3** Add JSDoc to all exported functions in `scripts/lib/federation-explore.js`
- [x] **T5.4** Add JSDoc to all exported functions in `scripts/lib/federation-baseline-orchestrator.js`
- [x] **T5.5** Review function naming against `federation-markers` spec vocabulary — rename if misaligned

## Phase 6 — Verification

- [x] **T6.1** Run `npm test` — all tests pass (454/454)
- [x] **T6.2** Cross-check spec edits against implementation
- [x] **T6.3** Verify no unintended behavior changes in hooks/runtime

## Remediation tasks (apply batch 2026-06-19)

- [x] **A1** Add JSDoc block (`@param`, `@returns`) to `loadMarkerFromMember` in `workspace-atlas.js` — cosmetic, no new test
- [x] **A2** Fix misleading `// A candidate is found` comment in `federation-baseline-orchestrator.js:nextMember` — cosmetic, no new test
- [~] **A3** ~~Add path-containment guard (`isWithinRoot`) in `resolveMembers`~~ — REVERTED. The containment guard was a regression: federation members are declared as sibling repos (`../services/api`) outside the coordinator root BY DESIGN, so the guard marked all legitimate members `reachable: false`, breaking cross-repo aggregation in `describeWorkspace`/`findActiveChanges`. The original no-guard behavior is correct; `workspace.yaml` is the trust boundary.

---

## Review Workload Forecast

| Metric | Value |
|--------|-------|
| Estimated changed lines | ~200-250 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Decision needed before apply | No |

## Dependencies

None — all tasks are internal to the federation lib layer. No external API changes.
