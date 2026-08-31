# Tasks: Remediación Quirúrgica K6c de Integridad de Specs y Runner Seam

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| `REQ-adversarial-challenges-003` / Scenario: Monotonic budget consumption during challenge execution | MUST | `scripts/lib/adversarial-challenges/runner.js`, `createChallengeBudgetTracker` | covered-by-design | Verificado en runner unit tests |
| `REQ-adversarial-challenges-003` / Scenario: Budget exhaustion triggers causal failure transition without blind restart | MUST | `scripts/lib/adversarial-challenges/runner.js` (`runIsolatedMutation`, `executeChallengePlan`) | covered-by-design | Emite causal failure con razón `CHALLENGE_BUDGET_EXHAUSTED` |
| `REQ-adversarial-challenges-004` / Scenario: Focal mutation detects seeded defect and challenge passes | MUST | `scripts/lib/adversarial-challenges/runner.js` (`runIsolatedMutation`) | covered-by-design | Mutación focal en sandbox aislado |
| `REQ-adversarial-challenges-004` / Scenario: Complacent test suite passes on seeded defect and challenge fails | MUST | `scripts/lib/adversarial-challenges/runner.js` (`runIsolatedMutation`) | covered-by-design | Detecta `COMPLACENT_TEST_DETECTED` |
| `REQ-adversarial-challenges-004` / Scenario: Test inspection detects tautological assertion | MUST | `scripts/lib/adversarial-challenges/runner.js` (`inspectTestAssertions`) | covered-by-design | Rechaza aserciones tautológicas |
| `REQ-adversarial-challenges-004` / Scenario: executeChallengePlan ignores caller context test runner seam | MUST | `scripts/lib/adversarial-challenges/runner.js` (`executeChallengePlan`, `runIsolatedMutation`) | covered-by-design | ADR-001: ignora `context.runWorkspaceTests` y usa runner aislado |
| `REQ-archive-plan-contract-002` / Scenario: Wrong content hash blocks | MUST | `scripts/lib/archive-plan.js` (`validatePlanAgainstSnapshot`) | covered-by-design | Rechazo fail-closed por mismatch de hash |
| `REQ-archive-plan-contract-002` / Scenario: Stale target_before_sha256 blocks | MUST | `scripts/lib/archive-plan.js` (`validatePlanAgainstSnapshot`) | covered-by-design | Rechazo fail-closed ante drift en target previo |
| `REQ-archive-plan-contract-002` / Scenario: Prepared spec containing literal undefined token is rejected fail-closed | MUST | `scripts/lib/archive-plan.js` (`hasCorruptedSpecContent`, `validatePlanAgainstSnapshot`) | covered-by-design | ADR-002: emite código `corrupted-spec-content` |
| `REQ-archive-plan-contract-002` / Scenario: Undeclared dropped requirement ID is rejected fail-closed | MUST | `scripts/lib/archive-plan.js` (`extractRequirementIds`, `extractRemovedRequirementIds`, `validatePlanAgainstSnapshot`) | covered-by-design | ADR-002: emite código `dropped-requirement-id` |
| `REQ-archive-plan-contract-003` / Scenario: Rejection uses allowlisted code only | MUST | `scripts/lib/archive-plan.js` (`PLAN_REJECTION_CODES`) | covered-by-design | Lista inmutable extendida con nuevos códigos |
| `REQ-archive-plan-contract-003` / Scenario: Unknown future code still fails closed | MUST | `scripts/lib/archive-plan.js` (`isKnownRejectionCode`) | covered-by-design | Fallback fail-closed ante códigos desconocidos |
| `REQ-archive-transaction-runtime-001` / Scenario: Failure before commit leaves origin intact | MUST | `scripts/lib/archive-transaction.js` (`runArchiveTransaction`) | covered-by-design | Preflight aborta antes de staging/commit |
| `REQ-archive-transaction-runtime-001` / Scenario: No delete before full match | MUST | `scripts/lib/archive-transaction.js` (`runArchiveTransaction`) | covered-by-design | Verificación de 3 vías antes de eliminar origin |
| `REQ-archive-transaction-runtime-001` / Scenario: Full match commits then deletes origin | MUST | `scripts/lib/archive-transaction.js` (`runArchiveTransaction`) | covered-by-design | Commit atómico y eliminación segura post-match |
| `REQ-archive-transaction-runtime-001` / Scenario: Preflight halts on spec content integrity failure | MUST | `scripts/lib/archive-transaction.js` (`buildSnapshot`, `runArchiveTransaction`) | covered-by-design | Preflight detiene ejecución fail-closed ante spec corrupta |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150-220 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Canonical Spec Restoration & Invariant Audit | PR 1 | Restaura `openspec/specs/adversarial-challenges/spec.md` y añade test de invariantes en `scripts/manifest-sync.test.js` |
| 2 | Fail-Closed Spec Integrity Validation in Archive | PR 1 | Implementa validación de integridad en `archive-plan.js`, `archive-transaction.js` y sus tests unitarios/integración |
| 3 | Runner Seam Elimination & Sandboxed Confinement | PR 1 | Elimina seam `context.runWorkspaceTests` en `runner.js`, migra tests unitarios con `_testRunner` y añade test adversarial |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Canonical Spec Restoration & Global Invariant Testing

- [x] 1.1 RED: Añadir test de invariante en `scripts/manifest-sync.test.js` para auditar la ausencia de tokens `undefined` y la retención íntegra de `{#REQ-...}` en todas las especificaciones canónicas de `openspec/specs/**/spec.md` [REQ-adversarial-challenges-003, REQ-adversarial-challenges-004]
- [x] 1.2 GREEN: Restaurar `openspec/specs/adversarial-challenges/spec.md` reincorporando las secciones completas de `REQ-adversarial-challenges-003` y `REQ-adversarial-challenges-004` y eliminando el token espurio `undefined` [REQ-adversarial-challenges-003, REQ-adversarial-challenges-004]
- [x] 1.3 REFACTOR: Verificar que `scripts/manifest-sync.test.js` pasa al 100% y validar el formato y alineación de encabezados en las especificaciones canónicas [REQ-adversarial-challenges-003, REQ-adversarial-challenges-004]


## Phase 2: Archive Plan & Transaction Fail-Closed Spec Integrity

- [x] 2.1 RED: Añadir tests unitarios en `scripts/lib/archive-plan.test.js` para los nuevos códigos `corrupted-spec-content` y `dropped-requirement-id`, verificando su pertenencia a `PLAN_REJECTION_CODES` y el rechazo de snapshots con tokens `undefined` o REQ IDs no declarados como removidos [REQ-archive-plan-contract-002, REQ-archive-plan-contract-003]
- [x] 2.2 GREEN: Extender `scripts/lib/archive-plan.js` incorporando `corrupted-spec-content` y `dropped-requirement-id` a `PLAN_REJECTION_CODES`, e implementando `extractRequirementIds`, `extractRemovedRequirementIds`, `hasCorruptedSpecContent` y las validaciones de contenido en `validatePlanAgainstSnapshot` [REQ-archive-plan-contract-002, REQ-archive-plan-contract-003]
- [x] 2.3 RED: Añadir tests de integración en `scripts/lib/archive-transaction.test.js` verificando que el preflight de `runArchiveTransaction` rechaza fail-closed planes con especificaciones que contengan `undefined` o REQ IDs suprimidos sin mutar staging ni live paths [REQ-archive-transaction-runtime-001]
- [x] 2.4 GREEN: Modificar `scripts/lib/archive-transaction.js` para capturar `preparedTexts` y `targetTexts` en `buildSnapshot` y pasarlos a `validatePlanAgainstSnapshot` durante el preflight [REQ-archive-transaction-runtime-001]
- [x] 2.5 REFACTOR: Limpiar helpers de regex y validar la suite completa de archive en `scripts/lib/archive-plan.test.js` y `scripts/lib/archive-transaction.test.js` [REQ-archive-plan-contract-002, REQ-archive-plan-contract-003, REQ-archive-transaction-runtime-001]


## Phase 3: Runner Seam Elimination & Sandboxed Confinement

- [x] 3.1 RED: Actualizar tests unitarios en `scripts/lib/adversarial-challenges/runner.test.js` para invocar directamente `runIsolatedMutation` con el parámetro posicional `_testRunner`, y añadir test de integración adversarial que compruebe que `executeChallengePlan` ignora mocks pasados en `context.runWorkspaceTests` [REQ-adversarial-challenges-004]
- [x] 3.2 GREEN: Modificar `scripts/lib/adversarial-challenges/runner.js` para eliminar la lectura de `context.runWorkspaceTests` en `executeChallengePlan` y `runIsolatedMutation`, soportando `_testRunner` como parámetro opcional directo exclusivamente en `runIsolatedMutation` [REQ-adversarial-challenges-004]
- [x] 3.3 REFACTOR: Limpiar invocaciones internas de ejecución de tests y verificar que toda la suite de adversarial challenges en `scripts/lib/adversarial-challenges/runner.test.js` pase al 100% [REQ-adversarial-challenges-004]


## Phase 4: Full Verification & Quality Assurance

- [x] 4.1 Ejecutar `npm test` completo y verificar que todas las suites de prueba unitarias, de integración y de invariantes pasen limpiamente sin regresiones [REQ-adversarial-challenges-003, REQ-adversarial-challenges-004, REQ-archive-plan-contract-002, REQ-archive-plan-contract-003, REQ-archive-transaction-runtime-001]

