# Proposal: k2-1d-private-issuer-durable-record

## Intent

Close CRITICAL 1 (public permit issuer capability leak) and CRITICAL 2 (non-durable in-memory authority bag / torn CAS record) identified during K3 readiness review. Require consistent, auditable 4R review re-certification on commit head.

## Scope

### In Scope
- Remove `getPermitIssuer()` from public `AuthorityStore`.
- Remove `PERMIT_AUTHORITY_ISSUER` export and `Symbol.for("ospec.permitAuthorityIssuer")`.
- Remove public export of `createPermitAuthorityIssuer` from public surface (`permits.js` / `authority-store` / `lifecycle-kernel`).
- Separate runtime composition (internal private issuer capability) from the public store interface.
- Combine state + journal + authority + budgets into a single atomic CAS durable record.
- Implement reference filesystem durable backend (temp write + fsync + atomic rename + directory fsync).
- Real crash/restart tests without manual `snapshot()` copying.
- Mandatory adversarial security & isolation tests.

### Out of Scope
- Broad kernel redesigns (rest of K2/K2a architecture is validated and GO).

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `authority-store`: Encapsulate issuer capability, unify state + journal + authority + budgets into atomic CAS record, add crash-safe filesystem durability.
- `lifecycle-kernel`: Internalize issuer capability resolution, strict private mint authority.

## Approach

- `AuthorityStore` creates private issuer internally or accepts private token, but NEVER exposes `getPermitIssuer()`.
- `runKernelOperation` interacts with store using private internal bindings.
- CAS commit writes `{ state, journal, authority, budgets }` as a single unit to the inner durable store.
- Reference `FileSystemStore` implements CAS with temp file, fsync, atomic rename, and directory fsync.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/authority-store/index.js` | Modified | Remove `getPermitIssuer`, encapsulate private issuer capability, unify atomic CAS record structure. |
| `scripts/lib/lifecycle-kernel/permits.js` | Modified | Unexport `createPermitAuthorityIssuer` and private symbols. |
| `scripts/lib/lifecycle-kernel/index.js` | Modified | Internalize issuer capability resolution in `runKernelOperation`. |
| `scripts/lib/filesystem-store.js` | Modified | Implement atomic CAS write with temp file, fsync, atomic rename, dir fsync. |
| `scripts/lib/authority-store/index.test.js` | Modified | Update tests for private issuer encapsulation and crash/restart persistence without `snapshot()`. |
| `scripts/lib/lifecycle-kernel/index.test.js` | Modified | Add adversarial security, permit isolation, and atomic durability crash/recovery tests. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Breaking existing test harnesses that relied on `getPermitIssuer()` | Medium | Update harness test helpers to use high-level runtime composition functions. |

## Rollback Plan

Revert `k2-1d-private-issuer-durable-record` commit.

## Dependencies

- Validated K2 / K2a architecture baseline.

## Success Criteria

- [ ] `store.getPermitIssuer` is undefined.
- [ ] `createPermitAuthorityIssuer` is not exported publicly.
- [ ] Public caller cannot mint or fabricate permits.
- [ ] Restart of store from disk preserves authority bag without manual `snapshot()`.
- [ ] Crash before rename leaves previous head intact; crash after rename leaves new head intact; no torn writes.
