# Proposal: Recoverable Candidate Persistence for Verify Lineage

## Intent

Verify lineage persists only Candidate IDs, so remediation cannot recover canonical `Candidate/v2` material after `state.yaml` is reloaded. Persist content-addressed Candidate records so bounded remediation can resume safely across processes.

## Scope

### In Scope
- Persist canonical `Candidate/v2` bytes before a lineage references them.
- Rehydrate and revalidate the current Candidate during `prepareRemediation` and `recordRemediationAttempt` after state reload.
- Test restart, idempotency, tampering, missing records, and legacy states.
- Align verify/apply guidance with the recovery contract.

### Out of Scope
- K6d/CX0 fixes or supersession; changing frozen findings, attempts, scopes, or recipes.
- Fabricating legacy preimages or treating a digest as recovery evidence.
- New authority stores, K4a/K4b primitives, promotion, or delivery authority.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `verify-lineage`: require exact recovery of Candidates referenced by mutable transitions while preserving lineage authority and history.

## Approach

Store immutable Candidate records by canonical-byte digest. `startVerifyLineage` verifies persistence before exposing the reference. Recovery recomputes the record digest and `candidate_id`; absent or divergent material blocks mutation. Remediation persists its successor before advancing `current_candidate_id`. Compatibility is additive: legacy states remain readable, but cannot mutate without recoverable material.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/verify-lineage.js` | Modified | Persist, resolve, and validate Candidate references. |
| `scripts/lib/verify-lineage.test.js` | Modified | Prove restart continuity and fail-closed behavior. |
| `scripts/lib/execution-identities/**` | Reused | Preserve canonical Candidate identity semantics. |
| `skills/sdd-{verify,apply}/SKILL.md` | Modified | Require persisted recovery. |
| `openspec/specs/verify-lineage/spec.md` | Modified | Specify recovery and compatibility. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Dangling or tampered reference | Med | Persist, re-read, and rehash before exposing or using it. |
| Legacy evidence is invented | Med | Never derive preimages from IDs or rewrite history. |
| Store becomes competing authority | Low | Validate against K3 identity; lineage remains authoritative. |

## Rollback Plan

Revert runtime, skill, tests, and spec delta together. Leave additive fields/blobs as inert audit material; never rewrite legacy or archived lineages.

## Dependencies

- Existing K3 Candidate validation and OpenSpec persistence.

## Success Criteria

- [ ] Start → reload → prepare works without an in-memory preimage.
- [ ] Remediation persists its successor and resumes after another reload.
- [ ] Invalid material blocks mutation without changing attempts/findings/scopes.
- [ ] Persistence is byte-stable/idempotent; legacy state remains unchanged.
- [ ] K6d/CX0 remain untouched.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST.
