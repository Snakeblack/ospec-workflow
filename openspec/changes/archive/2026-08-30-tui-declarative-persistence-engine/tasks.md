# Tasks: TUI Declarative Persistence Engine (Option B: yaml.v3)

## Workload Assessment

- **Total Tasks:** 11 tasks across 4 phases
- **TDD Workflow:** Strict TDD (Red -> Green -> Refactor)
- **Forecast:** Low complexity, focused Go package in `internal/config/` and light wiring in `internal/tui/app.go`. Single review workload slice recommended.

---

## Phase 1: Atomic Persistence & Data Models

- [x] **Task 1.1 (RED):** Write unit tests for atomic file persistence in `internal/config/atomic_test.go` (successful atomic write, temp file cleanup on error, permission preservation).
- [x] **Task 1.2 (GREEN):** Implement `AtomicWriteYAML` in `internal/config/atomic.go` using `gopkg.in/yaml.v3`, temporary file sync, and atomic `os.Rename`.
- [x] **Task 1.3 (RED):** Write unit and round-trip tests for `ModelsConfig`, `TierConfig`, and `ProfileConfig` in `internal/config/models_test.go` (polymorphic VSCode array/string, structured Codex fields, inline unknown target fields, profile parsing).
- [x] **Task 1.4 (GREEN):** Implement `models.go` with Go structs and YAML codecs in `internal/config/models.go`.

---

## Phase 2: Models Manager & Preset Engine

- [x] **Task 2.1 (RED):** Write unit tests for `ModelsManager` CRUD operations in `internal/config/models_manager_test.go` (`LoadModels`, `SaveModels`, `GetAgentTier` with fallback to `_default`, `SetAgentTier`).
- [x] **Task 2.2 (GREEN):** Implement `ModelsManager` query and mutation methods in `internal/config/models_manager.go`.
- [x] **Task 2.3 (RED):** Write unit tests for `ApplyPreset` (`cheap`, `default`, `premium`) and `GetActivePreset` in `internal/config/models_manager_test.go`.
- [x] **Task 2.4 (GREEN):** Implement `ApplyPreset` and `GetActivePreset` heuristic evaluator in `internal/config/models_manager.go`.

---

## Phase 3: OpenSpec Manager

- [x] **Task 3.1 (RED):** Write unit and round-trip tests for `OpenSpecConfig` and `OpenSpecManager` in `internal/config/openspec_manager_test.go` (`LoadConfig`, `SaveConfig`, `GetProjectVersion`, `GetProjectName`, baseline & testing config access).
- [x] **Task 3.2 (GREEN):** Implement `OpenSpecConfig` in `internal/config/openspec.go` and `OpenSpecManager` in `internal/config/openspec_manager.go`.

---

## Phase 4: Shell Integration & Verification

- [x] **Task 4.1 (RED):** Update `internal/tui/app_test.go` to test dynamic version and preset loading into the TUI header.
- [x] **Task 4.2 (GREEN):** Integrate `OpenSpecManager` and `ModelsManager` into `internal/tui/app.go` to populate real project version and active preset.
- [x] **Task 4.3 (REFACTOR):** Run full Go test suite with coverage (`go test -v -cover ./...`) and Node.js harness suite (`npm test`) to ensure zero regressions.
