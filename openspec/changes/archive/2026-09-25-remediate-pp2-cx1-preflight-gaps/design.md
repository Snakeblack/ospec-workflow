# Design: Remediate PP2/CX1 Preflight Gaps

## Technical Approach

Close three bounded preflight gaps on main `2.68.1` without a second PP2/CX1 or Adaptive delivery. Map directly to change-local specs:

| Spec | Design allocation |
|------|-------------------|
| REQ-lifecycle-kernel-029 | Dual-accept replay hashes in Node + Go reducers; new writes stay canonical |
| REQ-routing-016 | Persist `route.actual_route` for policy-bound changes; fail closed vs explicit legacy absence |
| REQ-install-027 | Split plugin/runtime root vs project workspace in `scripts/validate-phase.js` |

BOM strip in `scripts/hooks/ospec-hooks-launch.js` stays untouched. YAML block-scalar parser work stays out of scope (compatibility risk only).

## Architecture Decisions

### Decision: Dual-accept replay hashes; write only canonical

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Dual-accept (canonical + frozen v2.67 insertion-order sha256) on compare only | Small compare branch; preserves CAS/noop contract | **Chosen** |
| Rehash/migrate all stored `last_payload_hash` | Touches durable state; wider blast radius | Rejected |
| Accept arbitrary stringify order | Non-deterministic across runtimes | Rejected |

**Choice**: Before CAS apply, treat `noop-replay` if `phases.{phase}.last_payload_hash` equals either (1) current canonical sha256 (sorted-key `canonicalJson` / `canonicalReplayJSON`) or (2) frozen v2.67.0–v2.67.3 insertion-order `JSON.stringify` sha256 of the same envelope. On match: return converged state, no `revision` bump, no mutations, no journal append. On advance: store **only** the canonical hash.

**Evidence and consequences**: REQ-lifecycle-kernel-029; today Node/Go only compare canonical (`phase-completion-reducer.js` L106–117, Go `reducePhaseCompletion` L277–280). Reversibility high (remove legacy compare arm). Unrelated payloads must not noop solely by hash equality.

**Legacy serialize contract**: Node computes legacy digest via `sha256(JSON.stringify(envelope))` on the in-memory envelope (historical v2.67 behavior). Go mirrors with a shared frozen key walk that fixtures prove equal to captured Node v2.67 digests for golden envelopes (declaration order of result-envelope fields, recursive object key order matching those fixtures)—not Go map iteration order. Pin hex digests in tests.

### Decision: Policy-bound `actual_route` vs whole-`route` legacy absence

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Entire `route:` absent → legacy exception; `route` present without non-empty `actual_route` → fail closed | Narrow, independently testable | **Chosen** |
| Timestamp / version cutoff | Fragile, hard to fixture | Rejected |
| Implicit re-select when missing | Continues the gap | Rejected |

**Choice**: Create/update of a policy-bound change must persist non-empty `route.actual_route` (orchestrator write contract already documented; enforce at runtime continuation). Continuation (`selectRoute` / `route-dispatch-run` / `validate-phase`) fail-closed when `route` exists but `actual_route` is absent/empty—no invent, no silent table re-select. Pre-policy durable states that lack a `route:` section entirely MAY continue under the legacy exception (table evaluation), covered by dedicated tests that assert the exception does **not** apply to newly policy-bound omissions. Continuation locking of a present `actual_route` remains REQ-routing-014.

### Decision: Project workspace vs plugin root in validate-phase

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `projectRoot = cwd` (or `--workspace` / `OSPEC_PROJECT_ROOT`); `pluginRoot = resolve(__dirname,"..")`; `openspec/` under project | Matches `route-dispatch-run.js`; fixes global install | **Chosen** |
| Keep single `__dirname/..` root | Broken when plugin ≠ project | Rejected |

**Choice**: Resolve OpenSpec config/change paths from the project workspace; keep `require("./lib/...")` on the script’s plugin location. Prove Claude Code plus Cursor (second globally installed golden target). In-repo when cwd equals plugin root remains valid.

No ADR: bounded compatibility fix; no new public contract shape, dependency, or cross-cutting pattern beyond existing replay/routing/install surfaces.

## Data Flow

### Replay (REQ-lifecycle-kernel-029)

```
envelope P
    │
    ├─► canonicalHash = sha256(canonicalJson(P))
    └─► legacyHash    = sha256(v2.67 insertion-order stringify(P))
              │
              ▼
stored last_payload_hash ──match either?──► noop-replay (no revision++)
              │ no
              ▼
         CAS + project; store canonicalHash only
```

Node: `scripts/lib/lifecycle-kernel/phase-completion-reducer.js`  
Go: `internal/hooks/phase-completion-reducer.go`  
I/O wrapper (`ospec-state` / `ProjectPhaseCompletion`) unchanged aside from reducer outcome.

### Route persistence (REQ-routing-016)

```
create/update change ──► state.yaml MUST write route.actual_route (policy-bound)
continuation ──read route──►
    route absent entirely ──► legacy exception (testable) ──► selectRoute table path
    route present, actual_route empty/absent ──► fail closed
    actual_route set ──► REQ-routing-014 lock
```

### Validate-phase roots (REQ-install-027)

```
pluginRoot (__dirname/..) ──► lib requires / runtime assets
projectRoot (cwd | --workspace | OSPEC_PROJECT_ROOT) ──► openspec/config.yaml + changes/{name}
collapsed global (openspec only under plugin) ──► reject / fail closed
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` | Modify | Legacy hash helper; dual-accept before CAS; write canonical only |
| `scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js` | Modify | v2.67 noop; unrelated hash not noop; revision pin |
| `internal/hooks/phase-completion-reducer.go` | Modify | Same dual-accept + frozen legacy serialize |
| `internal/hooks/phase-completion-reducer_test.go` | Modify | Node↔Go noop on fixture v2.67 digests |
| `scripts/validate-phase.js` | Modify | Split roots; optional workspace override; fail collapsed global openspec |
| `scripts/configure/validate-phase.test.js` | Modify | Global Claude + Cursor layouts; in-repo coincidence; policy `actual_route` |
| `scripts/lib/route-dispatcher.js` | Modify | Fail closed on policy-bound missing `actual_route`; legacy whole-`route` absence |
| `scripts/lib/route-dispatcher.test.js` | Modify | New-change fail closed; legacy exception; no silent re-select |
| `scripts/route-dispatch-run.js` | Modify | Pass/enforce persisted-route policy when reading state (if gap remains) |
| `openspec/changes/remediate-pp2-cx1-preflight-gaps/consumer-inventory.md` | Create | Short confirmation: approvals, lineage, recovery (apply phase) |

Do **not** edit `scripts/hooks/ospec-hooks-launch.js` or its test.

## Interfaces / Contracts

```text
noop-replay iff stored_hash ∈ { sha256(canonical(P)), sha256(legacy_v267(P)) }
on advance: last_payload_hash := sha256(canonical(P))   // never legacy form
revision unchanged on noop-replay

policy-bound continuation:
  route.actual_route non-empty OR fail closed (reason: missing_actual_route)
legacy exception:
  durable state with no `route:` key → MAY evaluate routing table (tests only for that class)

validate-phase roots:
  projectRoot ≠ pluginRoot on global install
  openspec paths := join(projectRoot, "openspec", ...)
```

Approvals/gates remain reducer-preserved from current state (not from envelope). Identity of lineage/recovery consumers: confirmation only (see inventory).

## Testing Strategy

| Requirement / quality concern | Trigger and conditions | Expected response | Verification |
|--------------------------------|------------------------|-------------------|--------------|
| REQ-lifecycle-kernel-029 v2.67 noop | State with fixture `last_payload_hash` = legacy digest of P; replay P in Node and Go | `noop-replay`; same `revision`; no file mutation | Unit + Go cross-runtime tests; pinned hex |
| REQ-lifecycle-kernel-029 canonical noop | Stored canonical hash of P; replay P | Same as today | Existing reducer tests |
| Unrelated payload | Hash of Q matches neither form of P | Not noop; normal reduce/CAS path | Unit test |
| REQ-routing-016 new change | Policy-bound state with `route:` but empty/absent `actual_route` | Fail closed; no invented route | `route-dispatcher` (+ validate-phase) tests |
| REQ-routing-016 legacy | Fixture state with no `route:` key | Exception path; table evaluation allowed | Dedicated test asserting non-application to new omissions |
| REQ-install-027 Claude + Cursor | Script under temp plugin root; cwd = project with `openspec/` | Reads project openspec; not plugin-local | Integration-style CLI tests |
| Collapsed global roots | Global layout; openspec only under plugin | Fail closed / rejected as project validation | CLI test |
| In-repo coincidence | cwd = repo root | Existing OK paths still pass | Existing `validate-phase.test.js` |
| Consumer inventory | Static check of approvals / lineage / recovery call sites | Confirm no unintended coupling to dual-hash or root split | Short markdown inventory at apply |

`tdd_mode` is focused (not strict): prefer failing tests first for the three REQs, then GREEN; no full Strict TDD evidence table required.

## Migration / Rollout

No migration of existing `last_payload_hash` values. Dual-accept covers v2.67 digests in place. New projections write canonical only. No feature flags. Rollback: revert reducer, validate-phase, and route-dispatcher commits on `fix/pp2-cx1-preflight-remediation`; leave hook launcher untouched.

## Consumer inventory (confirmation)

| Consumer | Path (representative) | Relation to this change |
|----------|----------------------|-------------------------|
| Approvals | `phase-completion-reducer.js` preserves `current.approvals` | Unaffected by dual-hash; still not taken from envelope |
| Lineage | `scripts/lib/review-lineage.js`, gate state under `gates.*` | Separate from payload-hash replay; no API change |
| Recovery | Go/Node backup/`.bak` + journal paths on interrupted write | Still required; noop-replay must not rewrite state |

## Compatibility risk (out of scope)

Canonical writers emit `last_payload_hash` as a quoted plain YAML scalar (`ospec-state.js`). If a future writer emitted YAML block scalars for that field, parsers could diverge—record only; no block-scalar parser work in this change.

## Open Questions

None blocking design. Residual apply detail: exact CLI flag name (`--workspace` vs env-only) may follow `route-dispatch-run.js` for consistency (`assumptions` if env-only is chosen).
