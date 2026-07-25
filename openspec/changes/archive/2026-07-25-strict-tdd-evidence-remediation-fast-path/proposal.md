# Proposal: Strict TDD Evidence Remediation Fast Path

## Intent

A malformed Strict TDD evidence marker currently triggers a full reroute even when
behavior and tests are correct. O4.2 adds a fail-closed repair path for equivalent
drift while preserving Strict TDD.

## Scope

### In Scope
- Deterministic evidence validation and distinct `evidence-format-gap` classification.
- Evidence-only repair with an immutable candidate identity verified before/after.
- Focused verify recheck and routing/cost tests.

### Out of Scope
- Weakening Strict TDD, execution-test requirements, or CRITICAL handling of missing/fabricated evidence.
- Product, production-code, spec, or test changes made by the fast path; material deltas use ordinary routing.
- O6A archive finalization or adaptive routing.

### Dependency

- O4.1 review-signal overflow must be delivered first; O6A remains blocked until this change completes.

## Capabilities

### New Capabilities
- `strict-tdd-evidence-remediation`: Constrain and recheck equivalent evidence
  repairs without changing functional candidate identity.

### Modified Capabilities
- `agents`: Apply/verify/orchestrator contracts and failure routing gain
  `evidence-format-gap`, identity checks, and focused-recheck outcomes.
- `routing`: Distinguish evidence-only drift from functional/task failures.
- `skills`: Define structured Strict TDD evidence, repair boundaries, and evidence
  requirements for absent or fabricated records.

## Approach

Add a pure validator/repair helper at the apply boundary.
Allow writes only to evidence; classify missing, unverifiable, or fabricated records
as CRITICAL. Persist classification and identity, then run a targeted verify recheck.
Material deltas, identity mismatches, or failed rechecks return to ordinary routing.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/`, `scripts/**/*.test.js` | New/Modified | Validator, identity, recheck, routing, and cost tests. |
| `skills/sdd-{apply,verify}/strict-tdd*.md` | Modified | Evidence and recheck rules. |
| `agents/sdd-{orchestrator,apply,verify}.agent.md` | Modified | Classification and routing guidance. |
| `openspec/specs/{agents,routing,skills}` | Delta | Normative requirements/scenarios. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Fabricated evidence masked | High | Provenance/structure checks and CRITICAL fail-closed path. |
| Repair changes behavior | Med | Immutable fingerprints and evidence-only write allowlist. |

## Rollback Plan

Revert this implementation and its contract deltas together; ordinary
`tasks → apply → verify` routing remains the fallback. Rerun verification under
the prior Strict TDD rules.

## Success Criteria

- [ ] Equivalent `evidence-format-gap` records are recognized and mechanically repaired.
- [ ] Missing/fabricated evidence remains CRITICAL and fails closed.
- [ ] Fast path cannot modify production, specs, or tests; identity is immutable.
- [ ] Verify performs a focused recheck without full phase redispatch.
- [ ] Tests distinguish evidence drift from functional/task failures and enforce cost limits.

**Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST.
