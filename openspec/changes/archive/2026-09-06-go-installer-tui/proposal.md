# Proposal: Go Installer TUI

## Intent

Provide a minimal terminal installer that makes target and supported per-agent model choices visible, preserves navigation state, and writes nothing before explicit confirmation.

## Scope

### In Scope
- Go TUI: menu, target, conditional per-agent models, final summary, and Install/Confirm.
- Back navigation with retained selections and zero destination writes before confirmation.
- Reuse of all seven target profiles and installers through a thin Node adapter.
- Capability-based model steps; Antigravity currently installs with inherited model behavior and no multi-model step.

### Out of Scope
- Rewriting installer transaction, validation, manifest, or rollback behavior in Go.
- Adding model controls without proven target support.
- Multi-target runs, remote distribution, or global `models.yaml` redesign.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `install`: Add a Go TUI, supported per-agent model choices, review-before-write, and existing-installer delegation.

## Approach

Build a small state machine with explicit forward/back transitions. Add a machine-readable Node adapter that derives targets and model capabilities from existing configuration, applies per-run overrides without mutating canonical `models.yaml`, and invokes existing installer entry points. Established installers retain diagnostics, dry-run, and rollback ownership. Use resumable implementation slices if the review budget is exceeded.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `cmd/ospec-install/`, `internal/installer/` | New | Go TUI, state, and adapter client. |
| `scripts/configure/`, `scripts/lib/model-resolver.js` | Modified | Plan/install protocol and per-run overrides. |
| `package.json`, installer docs | Modified | Entry points and guidance. |
| Go and Node tests | Modified | Navigation, capability, adapter, and install coverage. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| TUI and installer state diverge | Medium | Revalidate the plan before confirmation. |
| Model support is overstated | Medium | Require explicit capability evidence; otherwise inherit. |
| Subprocess failure obscures recovery | Low | Preserve exit codes, diagnostics, and rollback. |

## Rollback Plan

Remove the TUI and adapter/override path; existing `npm run setup:<target>` commands remain the fallback.

## Dependencies

- Go toolchain, Node.js 22+, and existing installer components.

## Success Criteria

- [ ] All seven targets install through existing target-specific behavior.
- [ ] Per-agent models appear only for verified targets; Antigravity reports inheritance.
- [ ] Back preserves choices, the summary is accurate, and no destination writes precede confirmation.
- [ ] Navigation, capabilities, adapter, and confirmed installation have automated coverage.
