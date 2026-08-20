# Tasks: K5 Runtime Enforcement and Wiring Remediation

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-execution-budgets-001 (Uniform Node Execution Budget Quotas) | MUST | `scripts/lib/execution-budgets.js`, `isBudgetExhausted()` | covered-by-design | Evalúa exhaustivamente las 6 dimensiones de nodo (`turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines`, `allowed_paths`). |
| REQ-execution-budgets-002 (Authority Effect Budgets) | MUST | `scripts/lib/execution-budgets.js`, `isBudgetExhausted()` | covered-by-design | Evalúa las 4 dimensiones de autoridad (`effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`). |
| REQ-execution-budgets-004 (Zero-Delta Attempt Consumption) | MUST | `scripts/lib/lifecycle-kernel/index.js`, `reducer.js` | covered-by-design | Detección post-efecto y deducción monotónica de turnos/intentos pre-CAS. |
| REQ-failure-recovery-002 (Causal Failure Recovery Transition Matrix) | MUST | `scripts/lib/failure-recovery.js`, `transition-selector.js` | covered-by-design | Mapeo determinista `{repair, replan, escalate, stop}` sin sustitución silenciosa de `escalate` por `decide`. |
| REQ-failure-recovery-004 (Bounded Scope For Repair Transitions) | MUST | `scripts/lib/failure-recovery.js`, `lifecycle-kernel/index.js` | covered-by-design | `validateRepairScope()` fail-closed ante scopes vacíos/inválidos verificado en pre-efecto y pre-CAS. |
| REQ-lifecycle-kernel-runtime-005 (Honest Recovery Enforcement) | MUST | `scripts/lib/lifecycle-kernel/index.js`, `recovery.js` | covered-by-design | Validación pre-CAS con `validateRecoveryHonesty()` y avance de `blockingFingerprint()`. |
| REQ-lifecycle-kernel-runtime-025 (Budget Monotonicity in Reducers) | MUST | `scripts/lib/lifecycle-kernel/reducer.js`, `index.js` | covered-by-design | Integración de `isBudgetExhausted()` y marcado `exhausted: true` en reducer y runtime. |
| REQ-lifecycle-kernel-runtime-026 (Causal Priority & Transition Routing) | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js` | covered-by-design | Emisión de transiciones explícitas según precedencia de fallo y cuotas restantes. |
| REQ-lifecycle-model-conformance-011 (K5 Executable Invariants) | MUST | `scripts/lib/lifecycle-model.js` | covered-by-design | Los 7 checkers K5 reescritos para validar composición runtime/CAS/store real. |

### Reconciliation Verdict
- MUST coverage: complete (9/9 MUST requirements mapped and covered)
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 280-360 lines (additions + deletions) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (PR 1) |
| Delivery strategy | single-pr |
| Chain strategy | single-pr |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: single-pr
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | K5 Runtime Enforcement, Wiring Remediation & v2.45.8 Release | PR 1 | Implementación integral en un solo PR: pure functions, runtime wiring, model checkers, ADRs y versión 2.45.8. |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Pure Functions & Fail-Closed Guard Hardening

- [x] 1.1 Implementar `isBudgetExhausted(budget, consumed, options)` en `scripts/lib/execution-budgets.js` para evaluar exhaustivamente las 6 dimensiones de nodo (`turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines`, `allowed_paths`) y 4 de autoridad (`effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`). [REQ-execution-budgets-001, REQ-execution-budgets-002]
- [x] 1.2 Endurecer `validateRepairScope({ scope, targetNodeId, modifiedPaths, resolvedFindingIds })` en `scripts/lib/failure-recovery.js` para fallar cerrado (`ok: false`) ante scopes vacíos `{}` o sin arrays ante mutaciones, paths no permitidos o findings no congelados. [REQ-failure-recovery-004]
- [x] 1.3 Actualizar `getAllowlistedTransitions()` y `validateRecoveryTransition()` en `scripts/lib/failure-recovery.js` junto con `transition-selector.js` para garantizar la emisión explícita de `{repair, replan, escalate, stop}` sin sustitución silenciosa de `escalate` por `decide`. [REQ-failure-recovery-002, REQ-lifecycle-kernel-runtime-026]

## Phase 2: Lifecycle Kernel Runtime Wiring

- [x] 2.1 Integrar `isBudgetExhausted()` en `scripts/lib/lifecycle-kernel/reducer.js` y `scripts/lib/lifecycle-kernel/transition-selector.js` para marcar `exhausted: true` y podar transiciones de ejecución en nodos o autoridades agotadas. [REQ-lifecycle-kernel-runtime-025, REQ-execution-budgets-001, REQ-execution-budgets-002]
- [x] 2.2 Conectar `validateRepairScope()` en `runKernelOperation()` de `scripts/lib/lifecycle-kernel/index.js` como guard pre-efecto y validación pre-CAS para rechazar scopes inválidos o mutaciones fuera de ownership. [REQ-failure-recovery-004, REQ-lifecycle-kernel-runtime-005]
- [x] 2.3 Integrar en `scripts/lib/lifecycle-kernel/index.js` la captura de `beforeFingerprint`, evaluación post-efecto de `isZeroDeltaMutation()` con deducción monotónica pre-CAS y validación de avance con `validateRecoveryHonesty()`. [REQ-lifecycle-kernel-runtime-005, REQ-execution-budgets-004]

## Phase 3: Model Invariant Checkers Hardening

- [x] 3.1 Reimplementar los 7 checkers de invariantes K5 (`inv-k5-budget-monotonicity`, `inv-k5-causal-priority`, `inv-k5-allowlist-enforcement`, `inv-k5-zero-delta-consumption`, `inv-k5-budget-exhaustion-terminal`, `inv-k5-honest-recovery-advancement`, `inv-k5-telemetry-isolation`) en `scripts/lib/lifecycle-model.js` para comprobar composición real con `createKernelRuntime`, `AuthorityStore`, CAS y ledger de permisos. [REQ-lifecycle-model-conformance-011]
- [x] 3.2 Extender y actualizar suites de pruebas unitarias e integración en `scripts/lib/execution-budgets.test.js`, `scripts/lib/failure-recovery.test.js`, `scripts/lib/lifecycle-kernel/transition-selector.test.js`, `scripts/lib/lifecycle-kernel/reducer.test.js`, `scripts/lib/lifecycle-kernel/recovery.test.js`, `scripts/lib/lifecycle-kernel/index.test.js` y `scripts/lib/lifecycle-model.test.js`. [REQ-execution-budgets-001, REQ-execution-budgets-002, REQ-execution-budgets-004, REQ-failure-recovery-002, REQ-failure-recovery-004, REQ-lifecycle-kernel-runtime-005, REQ-lifecycle-kernel-runtime-025, REQ-lifecycle-kernel-runtime-026, REQ-lifecycle-model-conformance-011]

## Phase 4: Documentation, ADRs & Version Bump v2.45.8

- [x] 4.1 Actualizar el estado de los ADRs K5 (`docs/adr/adr-20260817-001-pure-decoupled-budget-evaluator-and-monotonic-state-accounting-with-telemetry-isolation.md`, `docs/adr/adr-20260817-002-structured-5-category-causal-failure-taxonomy-with-precedence.md`, `docs/adr/adr-20260817-003-closed-allowlisted-transition-matrix-bounded-repair-scopes-and-zero-delta-honesty-guarantees.md`) de `proposed` a `accepted`.
- [x] 4.2 Incrementar versión a `2.45.8` en `package.json`, `openspec/config.yaml`, `.plugin.json` y `.claude-plugin/plugin.json`.
- [x] 4.3 Redactar entrada de release `[2.45.8]` en `CHANGELOG.md` documentando la integración E2E y enforcement de K5 en runtime, evaluador unificado de presupuestos, repair scope fail-closed, honest recovery pre-CAS y hardening de invariantes.

## Phase 5: Full Test Suite & Quality Gates Verification

- [x] 5.1 Ejecutar suites específicas del kernel y K5 con `node --test scripts/lib/execution-budgets.test.js scripts/lib/failure-recovery.test.js scripts/lib/lifecycle-kernel/*.test.js scripts/lib/lifecycle-model.test.js`.
- [x] 5.2 Ejecutar verificación integral de la suite completa del repositorio mediante `npm test`.
- [x] 5.3 Validar que todos los quality gates y contratos pasan con cero advertencias o regresiones.
