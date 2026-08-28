# Archive Report: K6c Policy-Selected Challenges

**Change**: `k6c-policy-selected-challenges`  
**Date**: 2026-08-28  
**Status**: Ready for Archive Transaction Commit (Plan-and-Report)  
**Verification Verdict**: `PASS` (0 critical issues, 0 warnings, 0 suggestions)  

---

## Executive Summary

El cambio `k6c-policy-selected-challenges` entrega la capacidad completa de verificación adversarial proporcional determinista (K6c), asegurando la detección efectiva de defectos sembrados y el rechazo estricto de tests complacientes o tautológicos:

1. **Catálogo Tipado de Challenges Adversariales (REQ-001)**:
   - Catálogo cerrado de 9 tipos: `revert`, `focal-mutation`, `independent-acceptance`, `regression-acceptance`, `compatibility-acceptance`, `test-inspection`, `structural-validation`, `behavior-equivalence` y `rollback`.
   - Validación fail-closed con `UNSUPPORTED_CHALLENGE_TYPE` y preservación estricta de los bytes del `Candidate` congelado (aislamiento en workspaces efímeros).

2. **Planificador Proporcional y Determinismo Criptográfico (REQ-002)**:
   - Emisión determinista de `ChallengePlan` a partir de `CandidateId`, estrategia de evidencia (`bug`, `feature`, `refactor`, `migration`, `config-docs`, `strict-tdd`) y `PolicySnapshot`.
   - Cálculo determinista de `plan_id` (`sha256:...`) y registro explícito de motivos en `skipped[]` para cada challenge type omitido.

3. **Presupuesto Monótono y Transición Causal ante Agotamiento (REQ-003)**:
   - Control estricto de cuotas en `ChallengeBudget` (`max_challenges`, `mutation_budget`, `timeout_seconds`).
   - Al agotarse el presupuesto, transición inmediata a fallo causal tipado `causal-failure/v1` (`CHALLENGE_BUDGET_EXHAUSTED`) con categoría `validation_gap`, erradicando bucles y reintentos ciegos idénticos.

4. **Mutación Focal Sembrada y Rechazo de Tests Complacientes/Tautológicos (REQ-004)**:
   - Inyección focal de mutaciones de operadores acotada estrictamente a las líneas y ramas modificadas en el diff.
   - Detección y rechazo de suites que pasan sobre defectos sembrados con `COMPLACENT_TEST_DETECTED` e inspección de aserciones constantes/vacías con `TAUTOLOGICAL_TEST_DETECTED`.

5. **Publicación de Esquemas Kernel K6c (REQ-029)**:
   - Publicación de `challenge-plan/v1.schema.json` y `challenge-result/v1.schema.json` con `additionalProperties: false`, `$id` canónicos e indexación en manifest y contract-claims.
   - Inmutabilidad estricta de las líneas base K1 y pines de esquemas K6b.

6. **Integración en Independent Verifier y Frontera de Autoridad (REQ-010, REQ-011, REQ-012)**:
   - Integración fail-closed de los resultados de challenges en el `independent-verifier` como evidencia complementaria.
   - Prohibición estricta de conferir autoridad autónoma de entrega o promoción a los challenges (`CHALLENGE_AUTHORITY_MISUSE`), preservando la autoridad canónica exclusiva de OpenSpec/Git/Candidate.

---

## Verification & Quality Gates Summary

- **Verdict**: `PASS`
- **Tasks Complete**: 27 / 27 (100% de tareas TDD completadas)
- **Scenarios Satisfied**: 29 / 29 (100% de cumplimiento en matriz de requerimientos en nivel `runtime-test`)
- **Targeted Automated Suite**: 134 passed / 0 failed (suites de schemas, catalog, planner, budget, mutator, runner, verifier y roadmap)
- **Full Repository Test Suite (`npm test` / `node --test scripts/**/*.test.js`)**: 2863 passed / 0 failed / 2 skipped
- **Contract Lint**: 0 offenders
- **4R Review Gate**: `lineage_status: approved` (0 Blocker, 0 Critical, 0 Warning)
- **Accepted Warnings**: Ninguno (0 warnings)

---

## Merged Specifications Summary (Change-Local Preparation)

Se prepararon las siguientes especificaciones principales integrando los deltas del cambio sobre las especificaciones maestras correspondientes:

| Domain | Action | Requirements Modified / Preserved | Status |
|--------|--------|-----------------------------------|--------|
| `adversarial-challenges` | Prepared (New Capability) | `REQ-adversarial-challenges-001`, `REQ-002`, `REQ-003`, `REQ-004`. | ✅ Ready for runtime commit |
| `independent-verification` | Prepared (Merged) | `REQ-independent-verification-010` (consumo de challenges como evidencia complementaria fail-closed); REQ-001 a 009 preservados intactos. | ✅ Ready for runtime commit |
| `kernel-contract-schemas` | Prepared (Merged) | `REQ-kernel-contract-schemas-001` (incorporación de challenge-plan y challenge-result), `REQ-029` (publicación de schemas v1); REQ-002 a 028 preservados intactos. | ✅ Ready for runtime commit |
| `harness-authority-canon` | Prepared (Merged) | `REQ-harness-authority-canon-011` (madurez K6c implemented sin autoridad de delivery), `REQ-012` (challenges como evidencia complementaria no-autoritativa); REQ-001 a 010 preservados intactos. | ✅ Ready for runtime commit |

---

## Proposed ADR Promotions

Se proponen las siguientes 4 decisiones arquitectónicas para su promoción formal a `docs/adr/` durante la ejecución de la transacción de archivo:

| Source | Proposed Target | Title |
|--------|-----------------|-------|
| `decisions/adr-001.md` | `docs/adr/adr-20260828-019-proportional-policy-selected-challenges.md` | Proportional Policy-Selected Challenges vs Universal Fixed Suite |
| `decisions/adr-002.md` | `docs/adr/adr-20260828-020-candidate-immutability-complementary-evidence.md` | Candidate Immutability and Non-Authoritative Complementary Evidence |
| `decisions/adr-003.md` | `docs/adr/adr-20260828-021-causal-failure-transition-budget-exhaustion.md` | Causal Failure Transition on Challenge Budget Exhaustion |
| `decisions/adr-004.md` | `docs/adr/adr-20260828-022-focal-seeded-mutations-complacent-test-rejection.md` | Focal Seeded Mutations and Rejection of Complacent/Tautological Tests |

---

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k6c-policy-selected-challenges/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

---

## Change Inventory

- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `decisions/adr-003.md`
- `decisions/adr-004.md`
- `design.md`
- `proposal.md`
- `specs/adversarial-challenges/spec.md`
- `specs/harness-authority-canon/spec.md`
- `specs/independent-verification/spec.md`
- `specs/kernel-contract-schemas/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

---

## Archive Transaction & Closure Authority

1. Este reporte y el plan `archive-plan.json` han sido emitidos bajo el protocolo **Plan-and-Report**.
2. Las escrituras finales en `openspec/specs/**` y `docs/adr/**`, así como el traslado atómico de la carpeta activa a `openspec/changes/archive/2026-08-28-k6c-policy-selected-challenges` y la eliminación del directorio de origen tras verificación íntegra, son responsabilidad exclusiva del runtime determinista de transacción:
   ```bash
   node scripts/archive-transaction-run.js k6c-policy-selected-challenges
   ```
3. El recibo estructurado (`receipt.json`) con `outcome: "success"` emitido por el runtime es la única autoridad de cierre para el cambio.
