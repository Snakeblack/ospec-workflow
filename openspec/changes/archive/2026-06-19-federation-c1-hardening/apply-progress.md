# Apply Progress: federation-c1-hardening

**Change**: federation-c1-hardening
**Mode**: Strict TDD (Node native test runner — `node --test scripts/**/*.test.js`)
**Apply date**: 2026-06-19
**Applies to commits**: 810b502 (pre-apply implementation) + remediation batch (2026-06-19)

---

## Honest Retroactive Documentation Note

Tasks T1.1–T5.5 and T6.1–T6.3 were implemented and merged in commit `810b502`
BEFORE this apply-progress artifact was created. The SDD bookkeeping was never
produced at that time. The RED column for those tasks is marked as
`n/a — retroactively documented (implemented pre-apply in 810b502)`.
GREEN evidence is verified NOW against the passing test suite.

This is NOT fabricated evidence. It is an honest reconstruction per the
remediation batch instructions.

Tasks A1 and A2 are NEWLY applied in this remediation batch (cosmetic, non-TDD).

### A3 reverted (recorded for audit)

A3 (a path-containment guard in `resolveMembers`) was applied and then REVERTED
in the same batch. It was a regression: federation members are declared as
sibling repos (`path: ../services/api`) OUTSIDE the coordinator root BY DESIGN,
so a lexical containment guard marked every legitimate member `reachable: false`
and broke cross-repo aggregation in `describeWorkspace` / `findActiveChanges`.
The risk-review finding that prompted it confused this by-design asymmetry (the
guard in `scanMemberMarkers` applies to git submodules, which ARE in-container)
with a bug. The original no-guard behavior is correct; `workspace.yaml` is the
trust boundary. The guard, its 2 tests, and spec Requirement 6 were all removed.

---

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| T1.1 — workspace-explore spec cross-ref | `openspec/specs/workspace-explore/spec.md` | Cosmetic | n/a (new file edit) | n/a — retroactively documented (810b502) | ✅ Verified: spec.md cross-references federation-markers | ➖ Structural-only change | ➖ None needed |
| T1.2 — replace inline marker field descriptions | `openspec/specs/workspace-explore/spec.md` | Cosmetic | n/a | n/a — retroactively documented (810b502) | ✅ Verified: no inline marker field redefinitions | ➖ None | ➖ None needed |
| T2.1 — isCorruptCache structural check | `scripts/lib/artifact-store.test.js:356` | Unit | n/a | n/a — retroactively documented (810b502) | ✅ "regenerates and warns when the cache is corrupt" passes | ✅ 3 cases (corrupt, empty-valid, valid-with-members) | ➖ None needed |
| T2.2 — callers pass only content | `scripts/lib/artifact-store.test.js:368` | Unit | n/a | n/a — retroactively documented (810b502) | ✅ "empty-but-valid workspace.yaml is NOT corrupt" passes | ✅ Triangulated | ➖ None needed |
| T2.3 — test: empty workspace NOT corrupt | `scripts/lib/artifact-store.test.js:368` | Unit | n/a | n/a — retroactively documented (810b502) | ✅ passes | ✅ Covered | ➖ None needed |
| T2.4 — test: garbage IS corrupt | `scripts/lib/artifact-store.test.js:356` | Unit | n/a | n/a — retroactively documented (810b502) | ✅ passes | ✅ Covered | ➖ None needed |
| T2.5 — existing corrupt test still passes | `scripts/lib/artifact-store.test.js:356` | Unit | n/a | n/a | ✅ Confirmed passing in full suite | ➖ None | ➖ None needed |
| T3.1 — execGitSync param to createWorkspaceFederatedStore | `scripts/lib/artifact-store.test.js:392` | Unit | n/a | n/a — retroactively documented (810b502) | ✅ "warns when workspace.yaml is git-tracked (mock)" passes | ✅ 2 cases (tracked + not-tracked) | ➖ None needed |
| T3.2 — warnIfGitTracked uses execGitSync | `scripts/lib/artifact-store.test.js:392` | Unit | n/a | n/a — retroactively documented (810b502) | ✅ mock injection verified | ✅ Covered | ➖ None needed |
| T3.3 — propagate through createArtifactStore | `scripts/lib/artifact-store.test.js:406` | Unit | n/a | n/a — retroactively documented (810b502) | ✅ passes execGitSync via createArtifactStore | ✅ Covered | ➖ None needed |
| T3.4 — propagate through createArtifactStoreFromConfig | `scripts/lib/artifact-store.test.js` | Unit | n/a | n/a — retroactively documented (810b502) | ✅ propagation verified by mock test | ➖ None | ➖ None needed |
| T3.5 — refactor git-tracked test to use mock | `scripts/lib/artifact-store.test.js:392` | Unit | n/a | n/a — retroactively documented (810b502) | ✅ test uses mockExecGitSync, no real git subprocess | ✅ Covered | ➖ None needed |
| T3.6 — all artifact-store tests pass | `scripts/lib/artifact-store.test.js` | Unit | n/a | n/a | ✅ Full suite passes | ➖ None | ➖ None needed |
| T4.1 — roster: [] in buildMemberData | `scripts/lib/federation-explore.test.js:556` | Unit | n/a | n/a — retroactively documented (810b502) | ✅ "explore marker includes explicit roster: []" passes | ✅ Covered | ➖ None needed |
| T4.2 — test: explore markers contain roster: [] | `scripts/lib/federation-explore.test.js:556` | Unit | n/a | n/a — retroactively documented (810b502) | ✅ asserts Array.isArray(roster) && length===0 | ✅ Covered | ➖ None needed |
| T4.3 — existing explore tests pass | `scripts/lib/federation-explore.test.js` | Unit | n/a | n/a | ✅ Full suite passes | ➖ None | ➖ None needed |
| T5.1 — JSDoc on all exports in workspace-atlas.js (incl. loadMarkerFromMember) | `scripts/lib/workspace-atlas.js` | Cosmetic | n/a | n/a — cosmetic, no new test | ✅ JSDoc added to loadMarkerFromMember (remediation); other exports verified in 810b502 | ➖ Single structural check | ➖ None needed |
| T5.2 — JSDoc on exports in federation-marker.js | `scripts/lib/federation-marker.js` | Cosmetic | n/a | n/a — retroactively documented (810b502) | ✅ all exported functions have JSDoc | ➖ None | ➖ None needed |
| T5.3 — JSDoc on exports in federation-explore.js | `scripts/lib/federation-explore.js` | Cosmetic | n/a | n/a — retroactively documented (810b502) | ✅ all exported functions have JSDoc | ➖ None | ➖ None needed |
| T5.4 — JSDoc on exports in federation-baseline-orchestrator.js | `scripts/lib/federation-baseline-orchestrator.js` | Cosmetic | n/a | n/a — retroactively documented (810b502) | ✅ all exported functions have JSDoc | ➖ None | ➖ None needed |
| T5.5 — naming aligned with federation-markers spec | Multiple files | Cosmetic | n/a | n/a — retroactively documented (810b502) | ✅ function names match spec vocabulary | ➖ None | ➖ None needed |
| T6.1 — npm test all pass | Full suite | Integration | n/a | n/a | ✅ 454/454 (see C1 summary below) | ➖ None | ➖ None needed |
| T6.2 — spec edits cross-checked | Spec files | Cosmetic | n/a | n/a | ✅ workspace-explore/spec.md verified against implementation | ➖ None | ➖ None needed |
| T6.3 — no unintended behavior changes | Full suite | Integration | n/a | n/a | ✅ 454/454 — no regressions detected | ➖ None | ➖ None needed |
| **A1** — JSDoc for `loadMarkerFromMember` | `scripts/lib/workspace-atlas.js:401` | Cosmetic (non-TDD) | ✅ Safety Net before edit | n/a — cosmetic edit, no new behavior | ✅ JSDoc block added with @param and @returns; suite still green | ➖ Structural, no branching | ➖ None needed |
| **A2** — Fix misleading comment in nextMember | `scripts/lib/federation-baseline-orchestrator.js:51` | Cosmetic (non-TDD) | n/a — no test covers comments | n/a — cosmetic edit | ✅ Comment fixed: gate-block branch correctly described | ➖ None | ➖ None needed |
| **A3** — Path-containment guard in resolveMembers | (reverted) | — | — | — | ❌ REVERTED — regression; see note above | — | — |

---

## Test Summary

- **Net new tests retained this batch**: 0 (A3's 2 tests were reverted along with the guard)
- **Total tests passing after all changes**: 454
- **Layers used**: Unit
- **Pure functions created**: 0

---

## C1. Final Test Run Summary

```
# tests 454
# pass  454
# fail    0
# cancelled 0
# skipped   0
# todo      0
```

Runner: `node --test scripts/**/*.test.js`
Date: 2026-06-19

---

## Files Changed (net, after A3 revert)

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/workspace-atlas.js` | Modified | Added JSDoc for `loadMarkerFromMember` (A1). (A3 guard applied then reverted — no net change to `resolveMembers`.) |
| `scripts/lib/federation-baseline-orchestrator.js` | Modified | Fixed misleading `// A candidate is found` comment in `nextMember` (A2) |
| `openspec/changes/federation-c1-hardening/apply-progress.md` | Created | This file |
| `openspec/changes/federation-c1-hardening/tasks.md` | Modified | Checked off T1.1–T6.3; A3 marked reverted |

---

## Deviations from Design

A3 (path-containment guard) was proposed, implemented under genuine RED→GREEN,
then REVERTED after verification showed it broke the by-design sibling-member
topology of federation. Recorded above for audit. No other deviations.
