# Proposal: TUI Declarative Persistence Engine (Option B: yaml.v3)

## Intent

Implement Milestone 2 of the `ospec` Go TUI roadmap: a declarative, high-fidelity persistence and configuration engine in Go (`internal/config/`) using `gopkg.in/yaml.v3`. This engine enables reading, inspecting, applying presets, modifying granular agent/tier mappings, and atomically persisting `models.yaml`, model profiles (`profiles/models/*.yaml`), and `openspec/config.yaml` with total decoupling from the Node.js runtime.

## Scope

### In Scope
- Go data structures (`internal/config/models.go`, `internal/config/openspec.go`) representing:
  - `models.yaml` (per-agent tier policy table, multi-target tier mappings with polymorphic fields, Codex reasoning effort/verbosity, and arbitrary target extensibility).
  - `profiles/models/*.yaml` (`cheap.yaml`, `default.yaml`, `premium.yaml`).
  - `openspec/config.yaml` (project metadata, testing runner parameters, baseline status, rules, and routing).
- Models Manager (`internal/config/models_manager.go`):
  - Reading and parsing `models.yaml` and profile YAMLs.
  - Preset application (`ApplyPreset("cheap" | "default" | "premium")`) with agent tier policy updates.
  - Granular agent-to-tier modification (`SetAgentTier(agent, tier)` / `GetAgentTier(agent)`).
  - Active profile detection heuristic / state inspection (`GetActivePreset()`).
  - Atomic, corruption-safe file writes (temp file + rename pattern with preserved permissions).
- OpenSpec Manager (`internal/config/openspec_manager.go`):
  - Reading `openspec/config.yaml` metadata (`version`, `name`, `scale`, `testing`, `baseline`).
  - Safe atomic persistence for OpenSpec configuration updates.
- App and Header dynamic integration (`internal/tui/app.go`):
  - Integrate configuration manager to populate real project version and active profile into TUI header.
- Unit and round-trip test suite (`internal/config/*_test.go`) validating lossless YAML round-trips and error handling.

### Out of Scope
- Milestones 3–7: Visual interactive views (Dashboard, Models Hub, Targets Manager, System Doctor), footer modals, and binary release packaging.
- Modifying Node.js build scripts or generator internals.

## Capabilities

### New Capabilities
- `tui-declarative-persistence`: Declarative configuration parser, models manager with preset application and granular agent tier mutation, openspec configuration manager, and atomic file persistence in Go.

### Modified Capabilities
None

## Approach

- Create package `internal/config/` with typed Go structs modeling YAML schemas.
- Implement polymorphic YAML unmarshaling / marshaling for target definitions in `tiers` (e.g. `vscode` string vs array of strings, `codex` struct vs string) using `yaml.Node` or custom `UnmarshalYAML`/`MarshalYAML` to ensure 100% round-trip fidelity.
- Implement atomic file operations in `internal/config/atomic.go` to guarantee zero file corruption if a write is interrupted.
- Provide clean API interfaces (`ModelsManager`, `OpenSpecManager`) suitable for Bubble Tea Elm update handlers in Milestones 3–6.
- Integrate dynamic config reading in `internal/tui/app.go` to feed `header.Model` with live data.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/config/models.go` | New | Structs and custom YAML codecs for `models.yaml` and profile files |
| `internal/config/models_manager.go` | New | Manager for reading, mutating, applying presets, and saving model configs |
| `internal/config/openspec.go` | New | Structs for `openspec/config.yaml` |
| `internal/config/openspec_manager.go` | New | Manager for reading and writing `openspec/config.yaml` |
| `internal/config/atomic.go` | New | Atomic file writing and directory sync utility |
| `internal/config/*_test.go` | New | Comprehensive unit and round-trip test suites |
| `internal/tui/app.go` | Modified | Dynamically load version and profile via `internal/config` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| YAML formatting or comment loss on rewrite | Medium | Use structured `yaml.Node` or clean structured serialization; validate round-trips against golden fixtures in unit tests |
| Concurrent file writes or crash during write | Low | Atomic write via temporary file in the same directory followed by atomic `os.Rename` |
| Polymorphic target formats (e.g. array vs string for `vscode`) | Low | Custom YAML unmarshaler / `TargetConfig` handling flexible scalar/sequence/mapping node types |

## Rollback Plan

Delete directory `internal/config/` and revert changes to `internal/tui/app.go` using `git checkout -- internal/tui/app.go`. No Node.js runtime code or existing harness hooks are touched.

## Dependencies

- `gopkg.in/yaml.v3` (already in `go.mod`)
- Go 1.24+ standard library (`os`, `path/filepath`, `fmt`, `errors`, `sync`)

## Success Criteria

- [ ] `internal/config` successfully loads, parses, and serializes `models.yaml`, `profiles/models/*.yaml`, and `openspec/config.yaml`.
- [ ] `ApplyPreset` accurately updates agent tier assignments in `models.yaml`.
- [ ] `SetAgentTier` and `GetAgentTier` permit granular updates.
- [ ] All writes are atomic and resilient to process interruption.
- [ ] Round-trip tests prove zero data loss on real repository YAML configuration files.
- [ ] `go test ./...` and `npm test` execute with 100% pass rate.
