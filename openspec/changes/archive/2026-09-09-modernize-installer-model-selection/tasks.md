# Tasks: Modernize Installer Model Selection

## Spec/Design Reconciliation

| Requirement | Priority | Design allocation | Status | Verification |
|---|---|---|---|---|
| REQ-install-019 | MUST | `internal/installer/{client,model,view}.go`, protocol v2 | covered-by-design | Go TUI tests for target/preset/custom/inherited/Back |
| REQ-install-020 | MUST | `model-resolver.js`, adapter, Go opaque selections | covered-by-design | forged IDs, Copilot parity, inheritance tests |
| REQ-install-021 | MUST | Go review/action boundary and adapter delegation | covered-by-design | no call before Install; edited summary |
| REQ-install-022 | MUST | adapter plan/revalidation and existing `main` seam | covered-by-design | read-only snapshots, one delegation, stale-plan rejection |
| REQ-install-024 | MUST | Go filtering/control state plus protocol choices | covered-by-design | search, finite controls, retention and unsupported-control tests |
| REQ-install-025 | MUST/ MAY discovery | static-first adapter rollout | covered-by-design | prove no discovery invocation; static fallback; activation obligations documented |
| REQ-generator-015 | MUST | `models.yaml`, resolver/CLI validation, profiles | covered-by-design | structured errors and Antigravity inheritance |
| REQ-generator-016 | MUST | target profiles and `target-transform.js` | covered-by-design | native fields, stale clearing, no leakage/no writes |
| REQ-verify-lineage-013 | MUST | `verify-lineage.js`, new recovery audit/journal module | covered-by-design | exhaustive audit, approval checks, immutable terminal predecessor |
| REQ-verify-lineage-014 | MUST | candidate store, new snapshot/recheck modules, `verify-lineage.js` | covered-by-design | snapshot-bound B, directed recipe execution, inherited budget and exact reconciliation |

### Reconciliation Verdict
- MUST coverage: complete; no missing-design or ambiguous MUST scenarios.
- SHOULD/MAY gaps: dynamic discovery is intentionally deferred; this delivery verifies static-first behavior and records activation criteria.

## Review Workload Forecast

Estimated changed lines: 1,150–1,550 (Go/Node protocol, lineage recovery, fixtures, tests, docs)
Delivery strategy: single-pr (size:exception approved)
Estimated additional delta for successor reconciliation: 420–560 lines (Node recovery/recheck, fixtures and routing/state tests)
Suggested split: one feature branch with independently reviewable work units; recovery extension remains in the approved single PR.
Work units: catalog/policy; protocol/adapter; Go TUI; target emission; lineage recovery/successor; integration tests/docs.

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

## Suggested Work Units

| Unit | Goal | Dependencies | Verification |
|---|---|---|---|
| 1 | Extend `models.yaml` and resolver normalization/validation for groups, presets, finite controls and opaque IDs. | None | resolver and contract tests (REQ-generator-015, REQ-install-020) |
| 2 | Implement protocol v2 in `scripts/configure/installer-adapter.js`, CLI validation, and boundary fixture tests. | 1 | read-only plan, fresh-plan revalidation, one delegation (REQ-install-022) |
| 3 | Add target profile allowlists and safe native emission/stale-field clearing in profile files and `scripts/lib/target-transform.js`. | 1 | target transform/CLI tests (REQ-generator-016) |
| 4 | Replace flat navigation with preset/group/custom flow, search, controls, review and opaque request handling in `internal/installer/*.go`. | 2 | `go test ./internal/installer` scenarios (REQ-install-019, 024) |
| 5 | Add cross-language integration fixtures and update installation docs. | 2–4 | `npm test`, protocol boundary tests (REQ-install-021, 025) |

## Phase 1: Policy and Catalog Foundation

- [x] 1.1 Add groups, presets, target-scoped catalogs and capability controls to `models.yaml`; retain current defaults [REQ-generator-015]
- [x] 1.2 Implement immutable normalization, reference checks, structured errors and opaque choice IDs in `scripts/lib/model-resolver.js` [REQ-generator-015, REQ-install-020]
- [x] 1.3 RED: add resolver fixtures for duplicate/malformed/unknown references and complete valid presets; GREEN then REFACTOR [REQ-generator-015]

## Phase 2: Protocol and Adapter

- [x] 2.1 Define protocol v2 wire types and complete preset/custom/inherited request validation in `scripts/configure/installer-adapter.js` and `scripts/configure/cli.js` [REQ-install-020, REQ-install-022]
- [x] 2.2 Implement fresh-plan revalidation, in-memory overrides and exactly-once selected `main(argv, deps)` delegation without duplicating transaction behavior [REQ-install-022]
- [x] 2.3 RED/GREEN/REFACTOR adapter tests for read-only planning, forged selections, diagnostics, static fallback and no discovery for IDE targets [REQ-install-022, REQ-install-025]

## Phase 3: Target Emission

- [x] 3.1 Declare selectability, Copilot alias semantics, Antigravity inheritance and native-field allowlists in target profile modules [REQ-generator-015, REQ-generator-016]
- [x] 3.2 Validate selected metadata before writes; emit Claude `effort`, Codex `model_reasoning_effort`, OpenCode `variant`/empty default and strip stale/foreign fields in `scripts/lib/target-transform.js` [REQ-generator-016]
- [x] 3.3 RED/GREEN/REFACTOR transform and CLI tests proving invalid values fail closed and no files are written [REQ-generator-016]

## Phase 4: Go TUI Integration

- [x] 4.1 Update `internal/installer/client.go` wire models while keeping target/model/control values opaque [REQ-install-019, REQ-install-020]
- [x] 4.2 Implement preset-first target flow, grouped phase editing, inherited Antigravity path and reversible Back state in `internal/installer/model.go` [REQ-install-019]
- [x] 4.3 Implement case-insensitive per-agent search, finite compatible controls and review rendering in `internal/installer/view.go` [REQ-install-024]
- [x] 4.4 RED/GREEN/REFACTOR Go tests for all navigation, selection retention, unsupported controls and explicit Install boundary scenarios [REQ-install-019, REQ-install-021, REQ-install-024]

## Phase 5: Integration and Documentation

- [x] 5.1 Create `scripts/configure/installer-protocol.test.js` fixtures consuming actual Node plan JSON and Go-generated requests [REQ-install-020, REQ-install-022]
- [x] 5.2 Update `docs/plugin-installation.md` and `.es.md` with preset/custom navigation, Copilot parity, Antigravity inheritance and static-discovery fallback [REQ-install-019, REQ-install-025]
- [x] 5.3 Run focused Node tests, `go test ./internal/installer`, then `npm test`; reconcile failures before verification [REQ-install-021, REQ-install-022, REQ-install-025]

## Phase 6: Audited Lineage Recovery and Successor Recheck

- [x] 6.1 RED: test `candidate-recovery-audit/v1`, exhaustive source inventory, approval gates, unknown/tampered evidence and zero-mutation failure; implement `collectCandidateRecoveryAudit`/`validateCandidateRecoveryAudit` with bounded probes and digest-addressed evidence [REQ-verify-lineage-013]
- [x] 6.2 RED: test exact canonical bytes, Git tree OIDs/object types/recomputed digests and complete non-Git manifests; implement `persistCandidateSnapshot`/`recoverCandidateSnapshot` with no-clobber publication and restart-safe readback [REQ-verify-lineage-014]
- [x] 6.3 RED: deep-compare predecessor preservation of V001–V004, recipes, paths, counters, history and late observations; implement `terminalizeIrrecoverableLineage` and `startRecoverySuccessor` with approval resolution, terminal reason, new generation/lineage identity and inherited budget [REQ-verify-lineage-013, REQ-verify-lineage-014]
- [x] 6.4 RED: test pending-before-side-effect, stale/unknown outcomes, exact reconciliation, completed-operation replay and no command replay; implement the change-root operation journal and reconciliation [REQ-verify-lineage-013, REQ-verify-lineage-014]
- [x] 6.5 RED: test a real temporary Git repository and separate-process restart, one invocation per frozen recipe entry, B/snapshot/contract validation, pass closure, failure routing and unchanged attempts; implement `runRecoverySuccessorRecheck` without Full Discovery or caller-supplied results [REQ-verify-lineage-014]
- [x] 6.6 Add minimal routing instructions to `skills/sdd-verify/SKILL.md` and `skills/sdd-apply/SKILL.md`; run the four focal Node test files, `go test ./internal/installer`, `npm test` and `git diff --check` [REQ-verify-lineage-013, REQ-verify-lineage-014]
- [x] 6.7 Release hygiene: add `scripts/lib/verify-lineage-recovery.js`, `scripts/lib/verify-lineage-recovery.test.js`, `scripts/lib/verify-lineage-recheck.js` and `scripts/lib/verify-lineage-recheck.test.js` to `SUCCESSOR_K2_EXACT` in `scripts/lib/k1-scope-guard.test.js`, keep them excluded from the K1 allowlist, add explicit exclusion/partition tests, and run `npm test`; do not mutate the historical K1 inventory [REQ-verify-lineage-013, REQ-verify-lineage-014]
- [x] 6.8 RED/GREEN: normalize durable directed-recheck command outcomes into the finding-keyed result map consumed by `evaluateRecheck`; require exact reconciliation for a pre-existing pending/unknown operation and never replay a completed command [REQ-verify-lineage-014]

## Phase 7: Successor Reconciliation for Inconclusive Directed Operations

- [x] 7.1 En `scripts/lib/verify-lineage-recovery.js` y sus pruebas, clasificar las seis operaciones `directed-recheck-command` pendientes o desconocidas sin completion blob válido como disposiciones terminales `non-reconcilable` con `preserved: true`; conservar byte-equivalentes sus registros, digests y evidencia, sin invocar comandos, promover resultados ni sobrescribir operaciones originales [REQ-verify-lineage-015]
- [x] 7.2 En `scripts/lib/verify-lineage.js` y `scripts/lib/verify-lineage-recovery.js`, validar auditoría y aprobación `successor-reconciliation`, crear una sucesora con `lineage_id`/`generation` nuevos y `predecessor_id` exacto, heredar literalmente V001–V004, recetas, `allowed_paths`, observaciones, intentos y presupuesto restante, y publicar un journal nuevo en `recheck-pending` sin reutilizar operaciones o completions [REQ-verify-lineage-016]
- [x] 7.3 En `scripts/lib/candidate-store.js` (o el módulo de snapshots existente) y pruebas, capturar y validar el snapshot canónico Candidate C/B, bytes exactos, referencias/árbol Git o snapshot completo no-Git y `contract_digest`; rechazar ausencia, alteración o identidad no verificable antes de asignar identidad o journal de sucesora [REQ-verify-lineage-016, REQ-verify-lineage-017]
- [x] 7.4 En `scripts/lib/verify-lineage-recheck.js`, ejecutar exactamente una vez cada receta congelada del journal nuevo (incluidas recetas con comandos idénticos), persistir y validar cada completion antes de reducir resultados, conservarlo ante fallo posterior y cerrar únicamente cuando todas las recetas de V001–V004 sean `PASS` [REQ-verify-lineage-017, REQ-verify-lineage-018]
- [x] 7.5 Añadir pruebas de restart/no-replay/unknown/failure partial en `scripts/lib/verify-lineage-recovery.test.js` y `scripts/lib/verify-lineage-recheck.test.js`; verificar que pending/unknown/completed existentes no se reejecutan, fallos dejan findings afectadas `unresolved` y seleccionan `remediation-pending` o `exhausted` sin reset de contadores, y actualizar rutas/estado en `skills/sdd-apply/SKILL.md`, `skills/sdd-verify/SKILL.md` y `openspec/changes/modernize-installer-model-selection/state.yaml` [REQ-verify-lineage-015, REQ-verify-lineage-017, REQ-verify-lineage-018]
- [x] 7.6 Verificar la integración completa ejecutando `npm test`, `go test ./internal/installer` y `git diff --check`; confirmar en el diff la trazabilidad REQ-015..018, la preservación del historial y que el cierre de sucesora solo ocurre con cobertura PASS completa [REQ-verify-lineage-015, REQ-verify-lineage-016, REQ-verify-lineage-017, REQ-verify-lineage-018]

## Checklist Status Legend

- `[ ]` Not implemented yet; `[~]` implemented but not verified; `[x]` implemented and verified locally.
