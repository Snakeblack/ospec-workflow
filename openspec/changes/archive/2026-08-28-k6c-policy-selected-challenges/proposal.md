# Proposal: k6c-policy-selected-challenges

## Intent

Implementar la iniciativa K6c ("adversarial challenges policy-selected") para someter la evidencia e implementación del candidato congelado a pruebas adversariales proporcionales. Sustituir suites fijas universales por un `ChallengePlan` determinista emitido a partir de `PolicySnapshot`, estrategia de evidencia y `CandidateId`, detectando defectos sembrados y tests complacientes sin quemar tokens innecesarios.

## Scope

### In Scope
- Catálogo tipado de `ChallengeType` (`revert`, `focal-mutation`, `independent-acceptance`, `regression-acceptance`, `compatibility-acceptance`, `test-inspection`, `structural-validation`, `behavior-equivalence`, `rollback`).
- Emisión determinista de `ChallengePlan` (`selected`, `skipped`, `reasons`, `budget`) ligado a `CandidateId`, nodo, estrategia y `policy_digest`.
- Control de `ChallengeBudget` y transición a causal failure al agotarse (sin reintentos ciegos idénticos).
- Detección de defectos sembrados y refutación de tests complacientes o tautológicos.
- Esquemas de contrato kernel (`challenge-plan/v1`, `challenge-result/v1`), fixtures y claims.
- Integración con el verifier independiente y proyección de edges en el Assurance Graph si corresponde.

### Out of Scope
- Ejecución universal de cuarteto rígido en todos los candidates (la selección es proporcional a la estrategia).
- `ChallengePlan` o resultados como segunda autoridad de lifecycle/delivery.
- Refutación adversaria de findings de review de código (reservado a K7).
- Deltas de complejidad (K6d), Evaluation Attestation (K8) y promoción a kernel (K9).

## Capabilities

### New Capabilities
- `adversarial-challenges`: Catálogo de challenges, emisión determinista de `ChallengePlan`, gestión de `ChallengeBudget`, ejecución adversaria y detección de defectos sembrados.

### Modified Capabilities
- `independent-verification`: Consumo e integración de resultados de challenges dentro de la verificación de evidencia del candidato.
- `kernel-contract-schemas`: Nuevos esquemas y fixtures canónicas para contratos `challenge-plan/v1` y `challenge-result/v1`.
- `harness-authority-canon`: Ratificación de que los planes/resultados de challenges son evidencia suplementaria, nunca autoridad de entrega.

## Approach

1. Definir los esquemas `challenge-plan/v1` y `challenge-result/v1` en `schemas/kernel/` y registrar claims.
2. Implementar planificador determinista que derive `selected`/`skipped`/`budget` según estrategia y `PolicySnapshot`.
3. Implementar ejecutor de challenges adversariales con sembrado de mutaciones focales y validación de fallos esperados.
4. Conectar con el verifier independiente y Assurance Graph garantizando fail-closed ante budget exhaustion o tests complacientes.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `schemas/kernel/{challenge-plan,challenge-result}/` | New | Esquemas de contrato y fixtures K6c |
| `schemas/kernel/{manifest.json,contract-claims.json}` | Modified | Registro de contratos y familias |
| `scripts/lib/adversarial-challenges/` | New | Planificador, catálogo y ejecutor de challenges |
| `scripts/lib/independent-verifier/` | Modified | Integración de evidencia y resultados de challenges |
| `scripts/lib/assurance-graph/` | Modified | Proyección de edges de challenges si aplica |
| `openspec/specs/{adversarial-challenges,...}/` | New/Modified | Especificaciones de capabilities |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Explosión de costes por challenges exhaustivos | Med | `ChallengeBudget` estricto y selección proporcional según estrategia |
| Falsos positivos por mutaciones no equivalentes | Med | Mutación focal acotada a AST/código modificado con assertions dirigidas |
| Incoherencia determinista en replay | Low | Binding estricto a `CandidateId`, `policy_digest` y semilla determinista |

## Rollback Plan

Revertir módulos en `scripts/lib/adversarial-challenges/`, schemas K6c y extensiones al verifier en un único commit sin alterar la verificación base ni schemas K1/K6b.

## Dependencies

- K6b archivado y cerrado (`independent-verification`, `runner-receipt/v1`, `assurance-graph`).
- `PolicySnapshot` y Execution Graph K4a/K4b.

## Success Criteria

- [ ] `ChallengePlan` emite selecciones y omisiones reproducibles según estrategia (bug, refactor, feature, etc.).
- [ ] Detección exitosa de defectos sembrados rechazando tests complacientes.
- [ ] Agotamiento de `ChallengeBudget` genera causal failure transition sin relanzar idéntico.
- [ ] Schemas y contratos `challenge-plan/v1` y `challenge-result/v1` validados con fixtures canónicas.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
