# Apply Progress: TUI Declarative Persistence Engine (Option B: yaml.v3)

## Status Overview

All 11 tasks across 4 phases have been implemented following the Strict TDD (Red -> Green -> Refactor) lifecycle.

---

## Phase 1: Atomic Persistence & Data Models

- **Task 1.1 (RED):** Added `internal/config/atomic_test.go` verifying write success, file overwrite, directory validation, and concurrent atomic writes.
- **Task 1.2 (GREEN):** Implemented `AtomicWriteYAML` in `internal/config/atomic.go` with temporary file creation, disk sync (`file.Sync()`), permission preservation, and atomic `os.Rename`.
- **Task 1.3 (RED):** Added `internal/config/models_test.go` testing parsing of real repository `models.yaml`, parsing of all 3 profiles (`cheap.yaml`, `default.yaml`, `premium.yaml`), and full round-trip serialization.
- **Task 1.4 (GREEN):** Implemented `ModelsConfig`, `TierConfig`, `CodexTierConfig`, and `ProfileConfig` in `internal/config/models.go` with polymorphic unmarshaling for VSCode models and structured Codex configs.

---

## Phase 2: Models Manager & Preset Engine

- **Task 2.1 (RED):** Added `internal/config/models_manager_test.go` testing loading, agent querying, fallback to `_default`, mutating agent tier, and atomic persistence.
- **Task 2.2 (GREEN):** Implemented `ModelsManager` in `internal/config/models_manager.go` with thread-safe cached access (`sync.RWMutex`), `LoadModels`, `SaveModels`, `GetAgentTier`, and `SetAgentTier`.
- **Task 2.3 (RED):** Added unit tests in `internal/config/models_manager_test.go` for `ListProfiles`, `LoadProfile`, applying `cheap`, `default`, `premium` presets, and evaluating `GetActivePreset`.
- **Task 2.4 (GREEN):** Implemented `ApplyPreset` and heuristic `GetActivePreset` evaluator in `internal/config/models_manager.go`.

---

## Phase 3: OpenSpec Manager

- **Task 3.1 (RED):** Added `internal/config/openspec_manager_test.go` testing loading real `openspec/config.yaml`, querying version and project name, and mutating and persisting OpenSpec settings.
- **Task 3.2 (GREEN):** Implemented `OpenSpecConfig` in `internal/config/openspec.go` and `OpenSpecManager` in `internal/config/openspec_manager.go` with atomic save capabilities.

---

## Phase 4: Shell Integration & Verification

- **Task 4.1 (RED):** Updated `internal/tui/app_test.go` to test `NewAppModelWithRoot(repoRoot)` with dynamic version, preset, and git branch loading.
- **Task 4.2 (GREEN):** Integrated `OpenSpecManager` and `ModelsManager` into `internal/tui/app.go`, making version (`v2.57.0`) and active preset (`Default`) dynamic in the TUI header and exposing managers to future views.
- **Task 4.3 (REFACTOR):** Executed full Go test suites (`go test ./...`) and Node.js harness test suites (`npm test`) with 100% pass rate and 0 regressions.
