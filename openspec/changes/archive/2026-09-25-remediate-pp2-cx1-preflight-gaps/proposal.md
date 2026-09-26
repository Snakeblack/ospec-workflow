# Proposal: Remediate PP2/CX1 Preflight Gaps

## Intent

Close bounded preflight gaps on main `2.68.1`: v2.67.x hashes no longer noop-replay; globally installed `validate-phase.js` collapses plugin and project roots; new changes can continue without persisted `actual_route`. Corrective only — not a second PP2/CX1 or Adaptive delivery.

## Scope

### In Scope
- Recognize sha256 of `JSON.stringify(payload)` (insertion order) from v2.67.0–v2.67.3 as idempotent replay in Node and Go without bumping `revision`.
- Split plugin/runtime root vs project workspace in `scripts/validate-phase.js`; prove Claude Code plus ≥1 other globally installed target.
- Require persisted `route.actual_route` for new changes; keep an explicit, testable legacy exception.
- Short consumer inventory confirming approvals, lineage, and recovery.

### Out of Scope
- Second PP2/CX1; Adaptive global; `adaptive-operation-identity-binding`.
- YAML block-scalar parser work unless a current writer emits that form.
- BOM strip in `scripts/hooks/ospec-hooks-launch.js` (+ test) — leave untouched.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `lifecycle-kernel-runtime`: REQ-lifecycle-kernel-029 — accept stored v2.67 insertion-order hashes as zero-delta replay (Node + Go).
- `routing`: New changes MUST persist `route.actual_route` (REQ-routing-014); legacy absence keeps an explicit testable exception.
- `install`: Global installs MUST resolve plugin/runtime root separately from project workspace for `validate-phase`.

## Approach

1. Dual-accept replay: current canonical hash and frozen v2.67 `JSON.stringify` form; match → noop, no revision bump.
2. Resolve runtime under plugin root and `openspec/` under project cwd; fixtures for Claude and one other global target.
3. Require `actual_route` on create/update; document and test legacy absence.
4. Short inventory of approvals, lineage, and recovery consumers — confirmation only.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `phase-completion-reducer.js` / `.go` | Modified | Dual-hash replay parity |
| `scripts/validate-phase.js` | Modified | Plugin vs project roots |
| Route persistence / tests | Modified | `actual_route` + legacy exception |
| Change-local consumer inventory | New | Approvals / lineage / recovery |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Dual-hash collisions | Low | Bound to v2.67 algorithm; fixtures |
| Root split breaks in-repo | Med | Repo-relative fallback; dual-layout tests |
| Legacy exception widens | Low | Pre-policy states only; assert in tests |

## Rollback Plan

Revert dual-hash, root-resolution, and `actual_route` commits on `fix/pp2-cx1-preflight-remediation`. Leave BOM/hook files untouched.

## Dependencies

- Main `2.68.1`; branch `fix/pp2-cx1-preflight-remediation` exists.
- Node + Go parity tests for the reducer hash path.

## Success Criteria

- [ ] v2.67.x-hashed replay in Node and Go is a noop (no `revision` bump).
- [ ] Claude + ≥1 other global target resolve project `openspec/` correctly.
- [ ] New changes without `actual_route` fail closed; legacy absence is tested.
- [ ] Consumer inventory covers approvals, lineage, and recovery.
