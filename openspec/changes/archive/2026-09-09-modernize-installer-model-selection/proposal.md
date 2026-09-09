# Proposal: Modernize Installer Model Selection

## Intent

Replace the flat per-agent editor with preset-first, hierarchical model configuration, searchable choices, and target-compatible reasoning controls. GitHub Copilot gains VS Code-equivalent configuration; Antigravity keeps native inheritance without a selector.

## Scope

### In Scope
- Declare presets, catalogs, and model capabilities in `models.yaml`.
- Add preset selection, grouped phase customization, search, retained Back state, and review summaries to the Go TUI.
- Validate and emit target-supported `effort`, `model_reasoning_effort`, or `variant`; make `github-copilot` selectable like `vscode` and keep `antigravity` inherited.
- Evaluate bounded Codex/OpenCode discovery in the adapter, always retaining static fallback.

### Out of Scope
- Replacing target installers, rollback ownership, or confirmation-before-write.
- Requiring local CLIs/discovery, adding Antigravity selection, or inventing unsupported controls.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `install`: Preset-first configuration, search, reasoning controls, Copilot parity, and discovery fallback.
- `generator`: Validated model and effort/variant policy across target transforms.

## Approach

Keep `models.yaml` authoritative for static defaults and capabilities. The adapter exposes opaque preset/choice IDs, optionally merges bounded discovery, and revalidates installation requests. The Go flow becomes preset → grouped customization → search/reasoning → review. Profiles emit only supported reasoning fields and clear stale/default values.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `models.yaml`, `scripts/lib/model-resolver.js` | Modified | Presets, capabilities, validation. |
| `scripts/configure/installer-adapter.js` | Modified | Plan protocol, Copilot, discovery. |
| `internal/installer/` | Modified | Hierarchical navigation and search. |
| `scripts/lib/target-transform.js`, `scripts/lib/target-profiles/` | Modified | Target reasoning emission. |
| Tests and installer docs | Modified | Contract and guidance coverage. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Adapter/TUI drift | Medium | Version and revalidate selections. |
| Unsupported metadata leaks | Medium | Capability gates and golden tests. |
| Discovery destabilizes plans | Medium | Time bounds, deduplication, static fallback. |

## Rollback Plan

Revert the plan/transform schema and restore the flat selector; existing installers and static resolution remain usable.

## Dependencies

- Existing Bubble Tea TUI, Node adapter, profiles, and optional local Codex/OpenCode CLIs.

## Success Criteria

- [ ] Presets and grouped customization avoid linear agent traversal.
- [ ] Search/reasoning selections survive Back and match review.
- [ ] Copilot matches VS Code configurability; Antigravity remains inherited.
- [ ] Generated targets contain only supported, non-stale metadata.
- [ ] Failed discovery yields a valid static plan.
- [ ] Go/Node tests preserve confirmation and revalidation boundaries.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
