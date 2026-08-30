# Spec: tui-declarative-persistence

## Purpose

Define the declarative persistence and configuration engine in Go (`internal/config/`) for reading, parsing, mutating, and atomically writing `models.yaml`, `profiles/models/*.yaml`, and `openspec/config.yaml` using `gopkg.in/yaml.v3`.

## Requirements

### Requirement: Models Configuration Data Structures {#REQ-tui-declarative-persistence-001}

The configuration subsystem MUST provide typed Go data structures modeling `models.yaml` and profile YAMLs (`profiles/models/*.yaml`).

1. `models.yaml` data model MUST support:
   - `Agents`: map of agent names (`sdd-propose`, `sdd-design`, `sdd-apply`, `sdd-verify`, `review-*`, `_default`, etc.) to tier names (`premium`, `default`, `cheap`).
   - `Tiers`: map of tier names to target configurations (`claude`, `vscode`, `opencode`, `codex`, `cursor`, etc.).
2. Target configurations MUST support polymorphic formats without loss of structure:
   - `vscode`: string or sequence of strings (e.g. `["GPT-5.6 Sol (copilot)"]`).
   - `codex`: structured mapping (`model`, `model_reasoning_effort`, `model_verbosity`) or string.
   - `opencode`, `claude`, `cursor`: string definitions.
   - Arbitrary additional target definitions (forward compatibility).
3. Profile configuration (`profiles/models/*.yaml`) MUST model `profile` (name), `description`, and `routing` (agent name to model tier or reasoning role).

#### Scenario: Parse complete models.yaml configuration
- GIVEN a valid `models.yaml` containing agents and multi-target tier mappings
- WHEN unmarshaled into `ModelsConfig`
- THEN all agent-to-tier mappings and target configurations (including nested Codex attributes and VSCode lists) MUST be populated accurately

#### Scenario: Parse profile configuration
- GIVEN a valid profile file such as `profiles/models/cheap.yaml`
- WHEN unmarshaled into `ProfileConfig`
- THEN the profile name, description, and agent routing map MUST be correctly extracted

---

### Requirement: Models Manager and Granular Mutation {#REQ-tui-declarative-persistence-002}

The `ModelsManager` MUST provide programmatic access to query, mutate, and persist agent-to-tier assignments and tier configurations.

1. `LoadModels()` MUST load and parse `models.yaml` from the repository root.
2. `GetAgentTier(agent string)` MUST return the tier assigned to the specified agent, falling back to `_default` if not explicitly declared, or returning an empty string/error if unknown.
3. `SetAgentTier(agent string, tier string)` MUST update the tier assigned to the given agent in memory.
4. `SaveModels(cfg *ModelsConfig)` MUST write the configuration safely to disk.

#### Scenario: Query agent tier with fallback
- GIVEN a loaded `models.yaml` where `sdd-propose` is mapped to `premium` and `unregistered-agent` is not listed
- WHEN `GetAgentTier("sdd-propose")` is called
- THEN it MUST return `"premium"`
- WHEN `GetAgentTier("unregistered-agent")` is called
- THEN it MUST return the fallback tier configured under `_default`

#### Scenario: Granular agent tier update
- GIVEN a loaded `models.yaml` where `sdd-apply` is mapped to `default`
- WHEN `SetAgentTier("sdd-apply", "cheap")` is called and saved
- THEN `sdd-apply` in `models.yaml` MUST be updated to `"cheap"`

---

### Requirement: Preset Application Engine {#REQ-tui-declarative-persistence-003}

The `ModelsManager` MUST support applying standard model presets (`cheap`, `default`, `premium`) to configure agent tiers across the system.

1. `ApplyPreset(name string)` MUST resolve the preset strategy:
   - For `cheap`: assign cheap tiers to bounded/mechanical agents and light reasoning to exploratory agents.
   - For `default`: standard tier distribution for balanced daily development.
   - For `premium`: assign high reasoning/premium tiers across architecture, design, and verification agents.
2. If corresponding profile files exist in `profiles/models/*.yaml`, `ApplyPreset` MUST incorporate routing specifications or reconcile known agent mappings.
3. `GetActivePreset()` MUST evaluate current agent assignments and return the best matching preset name (`"cheap"`, `"default"`, `"premium"`, or `"custom"`).

#### Scenario: Applying the Cheap preset
- GIVEN a repository with `models.yaml`
- WHEN `ApplyPreset("cheap")` is executed
- THEN `sdd-apply`, `sdd-init`, `sdd-tasks`, and `sdd-explore` MUST be configured to cost-efficient tiers and persisted

#### Scenario: Detecting active preset profile
- GIVEN `models.yaml` configured with all standard default tier assignments
- WHEN `GetActivePreset()` is evaluated
- THEN it MUST return `"default"`
- WHEN an agent assignment is manually diverged to an unaligned tier
- THEN `GetActivePreset()` MUST return `"custom"`

---

### Requirement: OpenSpec Configuration Manager {#REQ-tui-declarative-persistence-004}

The `OpenSpecManager` MUST provide capabilities to read, inspect, and update `openspec/config.yaml`.

1. `LoadConfig()` MUST parse `openspec/config.yaml` into typed structures including:
   - `Project`: `name`, `version`, `status`.
   - `Testing`: `tdd_mode`, `runner`, `test_command`, `raw_command`, `framework`, `layers`, `coverage`, `quality`.
   - `Baseline`: `status`, `domains_done`, `domains_pending`, `last_checked`.
   - `Rules`, `Routing`, `Context`, `ArtifactStore`.
2. Helper getters MUST provide instant access to `GetProjectVersion()` and `GetProjectName()`.
3. `SaveConfig(cfg *OpenSpecConfig)` MUST persist modifications atomically.

#### Scenario: Inspect project version and baseline
- GIVEN a valid `openspec/config.yaml` with version `2.57.0` and baseline status `done`
- WHEN loaded via `OpenSpecManager`
- THEN `GetProjectVersion()` MUST return `"2.57.0"` and `Baseline.Status` MUST equal `"done"`

---

### Requirement: Atomic and Corruption-Safe Persistence {#REQ-tui-declarative-persistence-005}

All disk writes performed by `ModelsManager` and `OpenSpecManager` MUST be atomic and protect configuration files against partial writes, process termination, or concurrent access corruption.

1. Write operations MUST write data to a temporary file (`.<filename>.tmp.<pid-or-random>`) in the same directory as the destination file.
2. The temporary file MUST be flushed to disk before closing.
3. The temporary file MUST be renamed to the target filename using atomic `os.Rename`.
4. File permissions (mode `0644` or original file mode) MUST be preserved.
5. In case of failure before rename, temporary files MUST be cleaned up and the original file left unmodified.

#### Scenario: Atomic file overwrite
- GIVEN an existing `models.yaml`
- WHEN `SaveModels()` is called with updated configuration
- THEN a temporary file MUST be created in the same directory, written, flushed, and renamed over `models.yaml` atomically

---

### Requirement: Lossless Serialization and Harness Isolation {#REQ-tui-declarative-persistence-006}

The configuration engine MUST guarantee lossless serialization across round-trips and maintain total decoupling from the Node.js test harness.

1. Unmarshaling and re-marshaling repository YAML configurations MUST preserve all structural keys, nested mappings, and array elements.
2. The package MUST operate purely using Go standard libraries and `gopkg.in/yaml.v3` without invoking Node.js.
3. Running `go test ./internal/config/...` and `npm test` MUST pass with 100% success and zero regressions.

#### Scenario: Round-trip YAML fidelity
- GIVEN the repository's existing `models.yaml` and `openspec/config.yaml`
- WHEN parsed into structs and re-serialized
- THEN the deserialized objects of both original and serialized outputs MUST be structurally identical

#### Scenario: Harness isolation
- GIVEN the addition of `internal/config`
- WHEN running `npm test`
- THEN all 20+ Node.js test suites MUST execute unaffected and pass
