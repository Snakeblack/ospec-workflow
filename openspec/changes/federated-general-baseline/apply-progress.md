# Apply Progress: Detección de Base Compartida Cross-Repo (C4)

**Change**: federated-general-baseline
**Mode**: Strict TDD

## Completed Tasks

- [x] 1.1 Crear el fichero de pruebas `scripts/federated-general-baseline.test.js` e implementar tests RED para la extracción de dependencias de `package.json` y `go.mod`.
- [x] 1.2 Implementar test RED que valide la clasificación de dependencias alineadas vs desalineadas (desviaciones).
- [x] 1.3 Implementar test RED que valide la generación del reporte `docs/architecture/shared-baseline.md`.
- [x] 2.1 Crear el módulo `scripts/lib/workspace-general-baseline.js` con las funciones de extracción y análisis de dependencias de miembros.
- [x] 2.2 Implementar en `scripts/lib/workspace-general-baseline.js` el formateo de tablas markdown para la síntesis de `shared-baseline.md`.
- [x] 2.3 Modificar `skills/sdd-workspace/SKILL.md` para incluir el contrato de la operación `general-baseline`.
- [x] 2.4 Modificar `agents/sdd-workspace.agent.md` para documentar la aceptación de la operación `general-baseline`.
- [x] 3.1 Ejecutar los nuevos tests unitarios y asegurar que pasen en verde (`node --test scripts/federated-general-baseline.test.js`).
- [x] 3.2 Correr la suite de pruebas completa del proyecto y corregir cualquier regresión (`node scripts/check.js`).

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/federated-general-baseline.test.js` | Created | Test suite defining extraction, alignment classification, and synthesis scenarios. |
| `scripts/lib/workspace-general-baseline.js` | Created | Logic module parsing `package.json` and `go.mod`, resolving relative paths from `coordinatorRoot`, sorting alphabetically, and writing reports. |
| `skills/sdd-workspace/SKILL.md` | Modified | Documented `general-baseline` command contract. |
| `agents/sdd-workspace.agent.md` | Modified | Added `general-baseline` subcommand routing and execution mapping. |

## TDD Cycle Evidence

| Task ID | RED | GREEN | REFACTOR | Notes |
|---------|-----|-------|----------|-------|
| 1.1 - 1.3 | [x] | [x] | [x] | Wrote test suite structure and mock workspace before implementing. |
| 2.1 - 2.2 | [x] | [x] | [x] | Implemented core parser and markdown synthesis logic. |
| 2.3 - 2.4 | [x] | [x] | [x] | Integrated contracts and updated agent markdown specifications. |
| 3.1 - 3.2 | [x] | [x] | [x] | Verified unit tests locally and ran full check.js build suite. |

## Deviations from Design
None — implementation matches design.

## Issues Found
None.

## Remaining Tasks
None. All tasks are completed.

## Workload / PR Boundary
- Mode: size:exception
- Current work unit: Complete implementation of baseline detection (C4)
- Boundary: Starts at test creation and ends at project compilation check.js verification.
- Estimated review budget impact: Within ~300 changed lines, well within the 400-line budget limit.
