# Apply Progress: fix-cx0-skill-registry-robustness

**Change**: fix-cx0-skill-registry-robustness
**Mode**: Focused TDD (Node native test runner — `node --test` and Go `go test`)
**Apply date**: 2026-09-05
**Workload / PR boundary**: size:exception (approved by user, single PR)

---

## Completed Tasks

### Phase 1: Node.js Test-Driven Implementation
- [x] 1.1 Add failing unit tests (RED) in `scripts/lib/skill-registry.test.js` for unreadable file degradation during discovery, direct calculateFingerprint resilience against read errors, single-snapshot I/O count verification, and fail-closed rejection of foreign-only external roots when requireSkills is true [REQ-skill-registry-004, REQ-skill-registry-002]
- [x] 1.2 Update existing external skills unit test in `scripts/lib/skill-registry.test.js` to include a canonical OSpec identity anchor [REQ-skill-registry-002]
- [x] 1.3 Implement single-snapshot in-memory buffering, unreadable file graceful degradation, and hasOspecIdentity anchor verification (GREEN) in `scripts/lib/skill-registry.js` [REQ-skill-registry-004, REQ-skill-registry-002]

### Phase 2: Go Test-Driven Implementation
- [x] 2.1 Add failing unit tests (RED) in `internal/skillreg/skillreg_test.go` for unreadable skill degradation during DiscoverSkills, direct CalculateFingerprint resilience, missing skills root, and foreign-only external skills root rejection [REQ-skill-registry-004, REQ-skill-registry-002]
- [x] 2.2 Implement explicit 0-byte Content on read error, direct CalculateFingerprint resilience, and hasOspecIdentity anchor verification (GREEN) in `internal/skillreg/skillreg.go` [REQ-skill-registry-004, REQ-skill-registry-002]

### Phase 3: Parity and Regression Verification
- [x] 3.1 Implement cross-runtime parity test in `internal/skillreg/skillreg_test.go` verifying identical SHA-256 fingerprint digests between Node and Go on fixtures with unreadable files [REQ-skill-registry-004]
- [x] 3.2 Run full Node.js test suite (`npm test`) and verify 100% pass with zero regressions [REQ-skill-registry-004, REQ-skill-registry-002]
- [x] 3.3 Run full Go test suite (`go test ./...`) and verify 100% pass with zero regressions [REQ-skill-registry-004, REQ-skill-registry-002]

---

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 1.1 | `scripts/lib/skill-registry.test.js` | Unit | ✅ 54/54 pass | ✅ Written | ✅ Passed | ✅ 4 cases | ✅ Clean | Pruebas de degradación elegante, snapshot único y fail-closed en Node |
| 1.2 | `scripts/lib/skill-registry.test.js` | Unit | ✅ 54/54 pass | ✅ Updated | ✅ Passed | ➖ Single | ✅ Clean | Ancla canónica de identidad OSpec añadida en test externo |
| 1.3 | `scripts/lib/skill-registry.test.js` | Unit | ✅ 54/54 pass | N/A (impl) | ✅ Passed | ➖ Single | ✅ Clean | Implementación single-snapshot, graceful degradation y hasOspecIdentity en JS |
| 2.1 | `internal/skillreg/skillreg_test.go` | Unit | ✅ 2/2 pkgs pass | ✅ Written | ✅ Passed | ✅ 4 cases | ✅ Clean | Pruebas de degradación, resiliencia directa y rechazo foreign-only en Go |
| 2.2 | `internal/skillreg/skillreg_test.go` | Unit | ✅ 2/2 pkgs pass | N/A (impl) | ✅ Passed | ➖ Single | ✅ Clean | Implementación Content de 0 bytes, CalculateFingerprint resiliente y hasOspecIdentity en Go |
| 3.1 | `internal/skillreg/skillreg_test.go` | Integration | ✅ All pass | ✅ Written | ✅ Passed | ✅ 2 checks | ✅ Clean | Paridad cruzada Go/Node verificada criptográficamente con fixtures de archivos ilegibles |
| 3.2 | `scripts/**/*.test.js` | Suite | ✅ 54/54 pass | N/A (suite) | ✅ Passed | ➖ Suite | ✅ Clean | Suite completa Node (`npm test`) 100% verde sin regresiones |
| 3.3 | `internal/...` | Suite | ✅ All pass | N/A (suite) | ✅ Passed | ➖ Suite | ✅ Clean | Suite completa Go (`go test ./...`) 100% verde sin regresiones |

---

## Test Summary

- **Total new tests written**: 8 tests (5 in Node, 3 in Go + parity assertions)
- **Total tests passing**: 59/59 in `scripts/lib/skill-registry.test.js` & `session-start.test.js`; 8/8 in `internal/skillreg`; full `npm test` and `go test` passing.
- **Layers used**: Unit, Integration.

---

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/skill-registry.js` | Modified | Single-snapshot en discoverSkills, degradación a 0 bytes en I/O error sin lanzar excepción, helper hasOspecIdentity y preservación de content en normalizeFingerprintPath. |
| `scripts/lib/skill-registry.test.js` | Modified | Tests RED/GREEN para degradación elegante, fingerprint directo, I/O count, rechazo foreign-only y ancla OSpec en test externo. |
| `internal/skillreg/skillreg.go` | Modified | Content explícito de 0 bytes en error de lectura, DiscoverSkills resiliente, CalculateFingerprint tolerante a cualquier error de lectura y helper hasOspecIdentity. |
| `internal/skillreg/skillreg_test.go` | Modified | Tests unitarios de degradación, CalculateFingerprint directo, rechazo de raíz externa sin anclas OSpec y paridad cruzada Node/Go. |
| `internal/hooks/sessionstart_test.go` | Modified | Actualización de fixture con ancla OSpec (.ospec-workflow-install.json) para coincidir con la guarda fail-closed en roots externos. |
| `openspec/changes/fix-cx0-skill-registry-robustness/tasks.md` | Modified | Tareas marcadas como completadas [x]. |
| `openspec/changes/fix-cx0-skill-registry-robustness/apply-progress.md` | Created | Registro de progreso de implementación y evidencia TDD. |
| `openspec/changes/fix-cx0-skill-registry-robustness/state.yaml` | Modified | Estado de fase apply actualizado a done y status a ready-for-verify. |

---

## Deviations from Design

None — implementation matches design.md exactly.

---

## Issues Found

None. Todas las pruebas de regresión y paridad cruzada pasaron satisfactoriamente.
