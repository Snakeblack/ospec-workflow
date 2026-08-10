# Proposal: K3 Readiness Remediation

## Intent

Close K3 readiness gaps before K4a consumes Candidate identities. Restore one fail-closed vocabulary across spec, schema, runtime, fixtures, distributions, archive state, and references.

## Scope

### In Scope

- Align Candidate v2 validation with `exact`, `changed`, `ambiguous`, and `unknown`.
- Define predecessor/successor semantics so a modified Candidate cannot remain `exact`.
- Add fixtures for symlink, case-sensitive paths, projections, and identity separation.
- Prove K3 APIs and schemas are present in each applicable generated `dist/` target.
- Reconcile non-terminal K3 remediation archive states and K3/K4a reference claims.

### Out of Scope

- K4a Graph, Obligation Manifest, replay, or new worker authority.
- Attestation/authorization issuance beyond K3 rejection boundaries.
- Unrelated archive artifacts or historical verification evidence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `execution-identities`: Candidate relation/successor contract, freeze, separation evidence, and generated availability.
- `kernel-contract-schemas`: Candidate v2 vocabulary and fixtures.

## Approach

Use baseline requirements as contract; align schema, `freezeCandidate`, evaluation, fixtures, and distributions. Treat predecessor as lineage metadata and derive relation from frozen payload. Reconcile state from archive/verify evidence only.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `scripts/lib/execution-identities/index.js` | Modified | Candidate relation and successor semantics |
| `schemas/kernel/candidate/**` | Modified | v2 contract and adversarial fixtures |
| `scripts/lib/*k3*.test.js` | Modified | Contract and distribution evidence |
| `scripts/configure/cli.js`, `dist/**` | Modified | Verifiable K3 publication |
| `openspec/changes/archive/2026-08-08-*` | Modified | State reconciliation |
| `docs/roadmaps/harness-evolution.md`, `docs/architecture/harness-evolution.md` | Modified | K3/K4a references |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Relation correction breaks consumers | High | Contract fixtures and target checks |
| Archive correction obscures history | Medium | Amend only metadata from evidence |
| Generated output drifts | Medium | Rebuild and assert target inclusion |

## Rollback Plan

Revert the change, regenerate `dist/`, and retain its archive. If reconciliation is wrong, restore only prior state metadata after comparing archive/verify artifacts.

## Dependencies

- K3 baseline and archived remediation evidence.
- Existing Node tests and distribution generator.

## Success Criteria

- [ ] Schema, runtime, and baseline spec accept exactly four K3 relations and reject others.
- [ ] A changed predecessor/successor pair cannot present as `exact`; ambiguous and invalid inputs fail closed.
- [ ] Fixtures prove symlink, case, projection, and identity-kind boundaries.
- [ ] Applicable distributions contain K3 APIs and Candidate v2 schema with automated evidence.
- [ ] Archived states and planning references are consistent with evidence before K4a.

**Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST.
