# Design: k6c-policy-selected-challenges

## Technical Approach

El objetivo técnico de este cambio (K6c) es implementar un subsistema de validación adversarial determinista y proporcional (`adversarial-challenges`), gobernado por políticas y evidencia (`PolicySnapshot`, estrategia declarada y `CandidateId` congelado). En lugar de aplicar una suite fija y costosa a todos los cambios, el sistema evalúa los riesgos inherentes de la estrategia (`bug`, `refactor`, `feature`, `migration`, `config-docs`, `strict-tdd`) y emite un `ChallengePlan` tipado que selecciona únicamente los desafíos pertinentes y descarta los restantes con justificaciones explícitas.

La solución abarca cuatro pilares técnicos fundamentales:
1. **Contratos canónicos del kernel (`challenge-plan/v1`, `challenge-result/v1`)**: Esquemas JSON Schema 2020-12 versionados, inmutables y registrados en `manifest.json` y `contract-claims.json` con fixtures canónicas válidas e inválidas, sin mutar las versiones K1 ni K6b existentes.
2. **Subsistema modular `scripts/lib/adversarial-challenges/`**:
   - `catalog.js`: Catálogo cerrado de 9 tipos de challenges (`revert`, `focal-mutation`, `independent-acceptance`, `regression-acceptance`, `compatibility-acceptance`, `test-inspection`, `structural-validation`, `behavior-equivalence`, `rollback`).
   - `planner.js`: Generador determinista de `ChallengePlan` vinculado a `CandidateId`, nodo, estrategia y digest de política.
   - `budget.js`: Controlador de `ChallengeBudget` (`max_challenges`, `mutation_budget`, `timeout_seconds`) con consumo monótono y transición a `causal-failure/v1` (`CHALLENGE_BUDGET_EXHAUSTED`).
   - `mutator.js`: Inyector de mutaciones focales de AST/operadores acotadas estrictamente a las líneas modificadas en el candidato.
   - `runner.js`: Ejecutor adversarial en entornos aislados efímeros que detecta defectos sembrados, refuta tests complacientes (`COMPLACENT_TEST_DETECTED`) y aserciones tautológicas (`TAUTOLOGICAL_TEST_DETECTED`).
3. **Integración limpia con `independent-verifier`**: El verifier consume `challenge-result/v1` como evidencia complementaria, aplicando fail-closed si algún challenge seleccionado falla o si el presupuesto se agota.
4. **Preservación estricta de la autoridad de entrega**: Los planes y resultados de challenges actúan como evidencia complementaria y jamás constituyen una segunda autoridad de ciclo de vida ni autorización de delivery (`REQ-harness-authority-canon-012`).

---

## Architecture Decisions

| Opción | Trade-off | Decisión |
|---|---|---|
| **Selección Proporcional vs Suite Universal Fija** | Mayor especificidad en el planificador vs riesgo de sobre-cómputo y latencia en cambios pequeños. | **Selección Proporcional**: Se deriva el plan de `PolicySnapshot` y la estrategia de evidencia, reduciendo costes y maximizando la cobertura relevante ([ADR-001](decisions/adr-001.md)). |
| **Inmutabilidad de Candidate vs Mutación In-Place** | Requiere copias efímeras de workspace vs riesgo de contaminación destructiva del candidato congelado. | **Instancias Aisladas Inmutables**: El candidate jamás se muta en disco; toda mutación/revert ocurre en workspaces temporales y los resultados son evidencia complementaria no-autoritativa ([ADR-002](decisions/adr-002.md)). |
| **Transición Causal en Budget Exhaustion vs Reintentos Ciegos** | Parada inmediata fail-closed vs reintentos iterativos que pueden agotar cuotas sin éxito. | **Causal Failure Inmediato**: Se emite `causal-failure/v1` con código `CHALLENGE_BUDGET_EXHAUSTED` y categoría `validation_gap`, prohibiendo reintentos idénticos no remediados ([ADR-003](decisions/adr-003.md)). |
| **Mutaciones Focales vs Chaos/Fuzzing Global** | Cobertura precisa de líneas cambiadas vs análisis estocástico no determinista de todo el repositorio. | **Mutaciones Focales Acotadas**: Mutaciones deterministas en líneas modificadas e inspección estática de aserciones para detectar tests complacientes y tautológicos ([ADR-004](decisions/adr-004.md)). |

### Decision: Proportional Policy-Selected Challenges vs Universal Fixed Suite
**Choice**: Selección proporcional determinista basada en `PolicySnapshot` y `evidence_strategy`.
**Alternatives considered**: Suite universal fija de 4 challenges obligatorios para todos los commits.
**Rationale**: Una suite universal quema tokens innecesarios en cambios de documentación o fixes simples, mientras que ignora validaciones críticas de compatibilidad en migraciones. La selección proporcional equilibra rigor y eficiencia computacional.

### Decision: Candidate Immutability and Non-Authoritative Complementary Evidence
**Choice**: Ejecución en workspaces aislados efímeros; planes y resultados como evidencia complementaria sin autoridad de delivery.
**Alternatives considered**: Permitir que el runner de challenges autorice entregas o modifique el workspace del candidato directamente.
**Rationale**: OpenSpec, Git y Candidate v2 son la única autoridad semántica. Los challenges no deben usurpar la autoridad del verifier ni del harness.

### Decision: Causal Failure Transition on Challenge Budget Exhaustion
**Choice**: Detención inmediata y emisión de `causal-failure/v1` con razón `CHALLENGE_BUDGET_EXHAUSTED`.
**Alternatives considered**: Reintentos infinitos o degradación a advertencias informativas.
**Rationale**: Repetir la misma suite sobre el mismo candidato congelado reproduce el mismo agotamiento. Se requiere remediación explícita antes de relanzar.

### Decision: Focal Seeded Mutations and Rejection of Complacent/Tautological Tests
**Choice**: Mutaciones focales acotadas al diff e inspección de aserciones tautológicas con códigos `COMPLACENT_TEST_DETECTED` y `TAUTOLOGICAL_TEST_DETECTED`.
**Alternatives considered**: Análisis estático de cobertura simple (line coverage).
**Rationale**: La cobertura de líneas no garantiza que los tests fallen ante regresiones reales; sembrar defectos en las líneas cambiadas prueba la capacidad de detección efectiva del test.

---

## Data Flow

```
+─────────────────────────────────────────────────────────────────────────────+
|                         DETERMINISTIC PLANNING FLOW                         |
+─────────────────────────────────────────────────────────────────────────────+

  +────────────────────────+      +────────────────────────+
  | Frozen Candidate (v2)  |      | PolicySnapshot (v1)    |
  | - candidate_id         |      | - policy_snapshot_id   |
  | - patch / diff_hash    |      | - policy_bundle_digest |
  +───────────┬────────────+      +───────────┬────────────+
              │                               │
              ▼                               ▼
       +─────────────────────────────────────────────+
       |   adversarial-challenges/planner.js         |
       |   - Strategy matrix evaluation              |
       |   - Proportional selection & skip reasons   |
       |   - Budget calculation & plan_id minting    |
       +──────────────────────┬──────────────────────+
                              │
                              ▼
                  +────────────────────────+
                  |  ChallengePlan (v1)    |
                  |  - plan_id             |
                  |  - selected / skipped  |
                  |  - budget quotas       |
                  +────────────────────────+

+─────────────────────────────────────────────────────────────────────────────+
|                      EXECUTION & SEEDED DEFECT FLOW                         |
+─────────────────────────────────────────────────────────────────────────────+

  +────────────────────────+      +────────────────────────+
  |  ChallengePlan (v1)    |      | Ephemeral Copy of Repo |
  +───────────┬────────────+      +───────────┬────────────+
              │                               │
              ▼                               ▼
       +─────────────────────────────────────────────+
       |   adversarial-challenges/runner.js          |
       |   - Monotonic ChallengeBudget tracker       |
       |   - Focal mutation / patch revert           |
       |   - Test inspection for tautologies         |
       +───────┬─────────────────────────────┬───────+
               │ (Budget Exhaustion)         │ (Execution Completed)
               ▼                             ▼
  +─────────────────────────+   +────────────────────────────+
  | causal-failure/v1       |   | Array<ChallengeResult (v1)>|
  | code:                   |   | - result_id                |
  | CHALLENGE_BUDGET_       |   | - outcome: passed/failed   |
  |   EXHAUSTED             |   | - details (complacent/     |
  +─────────────────────────+   |            tautological)   |
                                +─────────────┬──────────────+
                                              │
+─────────────────────────────────────────────┼───────────────────────────────+
|               INDEPENDENT VERIFIER INTEGRATION & PROJECTION                 |
+─────────────────────────────────────────────┼───────────────────────────────+
                                              │
                                              ▼
  +────────────────────────+      +──────────────────────────+
  | Strategy Evidence &    |      | Complementary Challenge  |
  | MUST Obligations       |      | Results & Plan           |
  +───────────┬────────────+      +───────────┬──────────────+
              │                               │
              ▼                               ▼
       +─────────────────────────────────────────────+
       |   independent-verifier/index.js             |
       |   - Validates all selected challenges passed|
       |   - Fail-closed if failed/error/exhausted   |
       |   - Complementary check only (no delivery)  |
       +──────────────────────┬──────────────────────+
                              │
              +───────────────┴───────────────+
              ▼                               ▼
  +────────────────────────+     +───────────────────────────+
  |  Verification (v2)     |     | Assurance Graph (v1)      |
  |  - verdict: PASS /     |     | - verified-by edges       |
  |    PASS WITH WARNINGS  |     | - derived projection only |
  +────────────────────────+     +───────────────────────────+
```

---

## File Changes

| File | Action | Description |
|---|---|---|
| `schemas/kernel/challenge-plan/v1.schema.json` | Create | Esquema JSON Schema 2020-12 para contrato `challenge-plan/v1`. |
| `schemas/kernel/challenge-plan/fixtures/valid/basic-plan.json` | Create | Fixture canónica válida de challenge-plan. |
| `schemas/kernel/challenge-plan/fixtures/invalid/missing-budget.json` | Create | Fixture inválida sin presupuesto. |
| `schemas/kernel/challenge-plan/fixtures/invalid/unknown-type.json` | Create | Fixture inválida con challenge type no soportado. |
| `schemas/kernel/challenge-result/v1.schema.json` | Create | Esquema JSON Schema 2020-12 para contrato `challenge-result/v1`. |
| `schemas/kernel/challenge-result/fixtures/valid/passed-result.json` | Create | Fixture canónica válida con outcome `passed`. |
| `schemas/kernel/challenge-result/fixtures/valid/failed-result.json` | Create | Fixture canónica válida con outcome `failed` (`COMPLACENT_TEST_DETECTED`). |
| `schemas/kernel/challenge-result/fixtures/invalid/invalid-outcome.json` | Create | Fixture inválida con outcome no tipado. |
| `schemas/kernel/manifest.json` | Modify | Registrar familias `challenge-plan` y `challenge-result` versión 1. |
| `schemas/kernel/contract-claims.json` | Modify | Registrar claims y campos requeridos para `challenge-plan` y `challenge-result`. |
| `scripts/lib/adversarial-challenges/catalog.js` | Create | Catálogo de tipos de challenges, objetivos y validador fail-closed. |
| `scripts/lib/adversarial-challenges/catalog.test.js` | Create | Pruebas unitarias para validación del catálogo de challenges. |
| `scripts/lib/adversarial-challenges/planner.js` | Create | Generador determinista de `ChallengePlan` según estrategia y `PolicySnapshot`. |
| `scripts/lib/adversarial-challenges/planner.test.js` | Create | Pruebas unitarias de selección proporcional, determinismo y omisiones justificadas. |
| `scripts/lib/adversarial-challenges/budget.js` | Create | Tracker monótono de `ChallengeBudget` y constructor de `CHALLENGE_BUDGET_EXHAUSTED`. |
| `scripts/lib/adversarial-challenges/budget.test.js` | Create | Pruebas unitarias de decremento monótono y transición a causal failure. |
| `scripts/lib/adversarial-challenges/mutator.js` | Create | Inyector de mutaciones focales de operadores/AST y reversión de parches. |
| `scripts/lib/adversarial-challenges/mutator.test.js` | Create | Pruebas unitarias para mutaciones focales y reversión de código. |
| `scripts/lib/adversarial-challenges/runner.js` | Create | Ejecutor de challenges adversariales, detección de complacencia y tautologías. |
| `scripts/lib/adversarial-challenges/runner.test.js` | Create | Pruebas unitarias del runner de challenges con mocks de ejecución. |
| `scripts/lib/adversarial-challenges/index.js` | Create | Punto de entrada público del subsistema y guard de autoridad no-delivery. |
| `scripts/lib/adversarial-challenges/index.test.js` | Create | Pruebas de integración del subsistema completo. |
| `scripts/lib/independent-verifier/index.js` | Modify | Integrar validación complementaria fail-closed de `challenge-plan` y `challenge-result`. |
| `scripts/lib/independent-verifier/index.test.js` | Modify | Pruebas de verifier con evidencia complementaria de challenges. |
| `scripts/lib/k6c-schema-fixtures.test.js` | Create | Pruebas de validación de esquemas y fixtures canónicas K6c e invariantes K1/K6b. |
| `scripts/lib/roadmap-boundary.test.js` | Modify | Asegurar tagging `implemented` de K6c sin invadir K7/K8 ni otorgar delivery authority. |
| `openspec/changes/k6c-policy-selected-challenges/decisions/adr-001.md` | Create | ADR-001: Selección proporcional de challenges vs suite universal. |
| `openspec/changes/k6c-policy-selected-challenges/decisions/adr-002.md` | Create | ADR-002: Inmutabilidad de CandidateId y naturaleza complementaria no-autoritativa. |
| `openspec/changes/k6c-policy-selected-challenges/decisions/adr-003.md` | Create | ADR-003: Causal Failure Transition en Budget Exhaustion. |
| `openspec/changes/k6c-policy-selected-challenges/decisions/adr-004.md` | Create | ADR-004: Mutaciones focales sembradas y rechazo de tests complacientes. |

---

## Interfaces / Contracts

### 1. Challenge Types Catalog (`scripts/lib/adversarial-challenges/catalog.js`)

```javascript
"use strict";

const CHALLENGE_TYPES = Object.freeze([
  "revert",
  "focal-mutation",
  "independent-acceptance",
  "regression-acceptance",
  "compatibility-acceptance",
  "test-inspection",
  "structural-validation",
  "behavior-equivalence",
  "rollback",
]);

const CHALLENGE_OBJECTIVES = Object.freeze({
  "revert": "Revert candidate patch to verify that original tests fail on unpatched codebase.",
  "focal-mutation": "Apply AST or code mutations to changed files to verify tests fail on seeded defects.",
  "independent-acceptance": "Execute independently generated acceptance assertions against candidate outputs.",
  "regression-acceptance": "Execute baseline regression test suites against candidate modifications.",
  "compatibility-acceptance": "Validate backward and forward compatibility against historical fixtures.",
  "test-inspection": "Inspect test assertions to detect tautological, empty, or complacent checks.",
  "structural-validation": "Validate schema, syntax, and structural integrity of non-code or config assets.",
  "behavior-equivalence": "Validate identical observable behavior across refactored components.",
  "rollback": "Execute dry-run and reverse migration operations to ensure safe rollback.",
});

function isValidChallengeType(type) {
  return typeof type === "string" && CHALLENGE_TYPES.includes(type);
}

function validateChallengeType(type) {
  if (!isValidChallengeType(type)) {
    return { ok: false, reason_code: "UNSUPPORTED_CHALLENGE_TYPE", error: `Unsupported challenge type: ${type}` };
  }
  return { ok: true, type, objective: CHALLENGE_OBJECTIVES[type] };
}

module.exports = {
  CHALLENGE_TYPES,
  CHALLENGE_OBJECTIVES,
  isValidChallengeType,
  validateChallengeType,
};
```

### 2. Challenge Plan Generator (`scripts/lib/adversarial-challenges/planner.js`)

```javascript
"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");
const { CHALLENGE_TYPES } = require("./catalog.js");

const STRATEGY_CHALLENGE_SELECTION = Object.freeze({
  "bug": {
    selected: ["revert", "regression-acceptance"],
    skipped: {
      "focal-mutation": "STRATEGY_OMISSION_OUT_OF_SCOPE",
      "independent-acceptance": "STRATEGY_OMISSION_OUT_OF_SCOPE",
      "compatibility-acceptance": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "test-inspection": "STRATEGY_OMISSION_COVERED_BY_REVERT",
      "structural-validation": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "behavior-equivalence": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "rollback": "STRATEGY_OMISSION_NOT_APPLICABLE",
    },
  },
  "refactor": {
    selected: ["behavior-equivalence", "focal-mutation"],
    skipped: {
      "revert": "STRATEGY_OMISSION_IRRELEVANT_FOR_REFACTOR",
      "independent-acceptance": "STRATEGY_OMISSION_OUT_OF_SCOPE",
      "regression-acceptance": "STRATEGY_OMISSION_COVERED_BY_EQUIVALENCE",
      "compatibility-acceptance": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "test-inspection": "STRATEGY_OMISSION_OPTIONAL",
      "structural-validation": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "rollback": "STRATEGY_OMISSION_NOT_APPLICABLE",
    },
  },
  "migration": {
    selected: ["rollback", "compatibility-acceptance"],
    skipped: {
      "revert": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "focal-mutation": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "independent-acceptance": "STRATEGY_OMISSION_OUT_OF_SCOPE",
      "regression-acceptance": "STRATEGY_OMISSION_COVERED_BY_COMPATIBILITY",
      "test-inspection": "STRATEGY_OMISSION_OPTIONAL",
      "structural-validation": "STRATEGY_OMISSION_OPTIONAL",
      "behavior-equivalence": "STRATEGY_OMISSION_NOT_APPLICABLE",
    },
  },
  "config-docs": {
    selected: ["structural-validation", "test-inspection"],
    skipped: {
      "revert": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "focal-mutation": "STRATEGY_OMISSION_NO_CODE_LOGIC",
      "independent-acceptance": "STRATEGY_OMISSION_OUT_OF_SCOPE",
      "regression-acceptance": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "compatibility-acceptance": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "behavior-equivalence": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "rollback": "STRATEGY_OMISSION_NOT_APPLICABLE",
    },
  },
  "feature": {
    selected: ["independent-acceptance", "focal-mutation"],
    skipped: {
      "revert": "STRATEGY_OMISSION_FEATURE_ADDITION",
      "regression-acceptance": "STRATEGY_OMISSION_OPTIONAL",
      "compatibility-acceptance": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "test-inspection": "STRATEGY_OMISSION_COVERED_BY_FOCAL",
      "structural-validation": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "behavior-equivalence": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "rollback": "STRATEGY_OMISSION_NOT_APPLICABLE",
    },
  },
  "strict-tdd": {
    selected: ["independent-acceptance", "focal-mutation"],
    skipped: {
      "revert": "STRATEGY_OMISSION_COVERED_BY_RED_GREEN",
      "regression-acceptance": "STRATEGY_OMISSION_OPTIONAL",
      "compatibility-acceptance": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "test-inspection": "STRATEGY_OMISSION_COVERED_BY_RED_GREEN",
      "structural-validation": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "behavior-equivalence": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "rollback": "STRATEGY_OMISSION_NOT_APPLICABLE",
    },
  },
});

const DEFAULT_CHALLENGE_BUDGET = Object.freeze({
  max_challenges: 3,
  mutation_budget: 10,
  timeout_seconds: 60,
});

/**
 * Mint deterministic ChallengePlan.
 * @param {Object} params
 * @param {string} params.candidateId
 * @param {string} params.policySnapshotId
 * @param {string} params.evidenceStrategy
 * @param {Object} [params.budgetOverrides]
 * @returns {Object} ChallengePlanV1 payload
 */
function createChallengePlan({
  candidateId,
  policySnapshotId,
  evidenceStrategy,
  budgetOverrides = {},
}) {
  const normStrategy = STRATEGY_CHALLENGE_SELECTION[evidenceStrategy] ? evidenceStrategy : "strict-tdd";
  const selectionDef = STRATEGY_CHALLENGE_SELECTION[normStrategy];

  const selected = [...selectionDef.selected];
  const skipped = Object.entries(selectionDef.skipped).map(([challenge_type, reason]) => ({
    challenge_type,
    reason,
  }));
  const reasons = [
    `STRATEGY_${normStrategy.toUpperCase().replace(/-/g, "_")}_SELECTED`,
    ...skipped.map((s) => s.reason),
  ];

  const budget = {
    max_challenges: Math.max(1, Number(budgetOverrides.max_challenges || DEFAULT_CHALLENGE_BUDGET.max_challenges)),
    mutation_budget: Math.max(0, Number(budgetOverrides.mutation_budget !== undefined ? budgetOverrides.mutation_budget : DEFAULT_CHALLENGE_BUDGET.mutation_budget)),
    timeout_seconds: Math.max(1, Number(budgetOverrides.timeout_seconds || DEFAULT_CHALLENGE_BUDGET.timeout_seconds)),
  };

  const canonicalBody = {
    schema_version: 1,
    kind: "challenge-plan/v1",
    candidate_id: candidateId,
    policy_snapshot_id: policySnapshotId,
    evidence_strategy: normStrategy,
    selected,
    skipped,
    reasons,
    budget,
  };

  const plan_id = sha256Fingerprint("challenge-plan:v1", canonicalBody);

  return {
    ...canonicalBody,
    plan_id,
  };
}

module.exports = {
  createChallengePlan,
  STRATEGY_CHALLENGE_SELECTION,
  DEFAULT_CHALLENGE_BUDGET,
};
```

### 3. Challenge Budget Tracker (`scripts/lib/adversarial-challenges/budget.js`)

```javascript
"use strict";

const { createCausalFailure, CAUSAL_CATEGORIES } = require("../causal-failure.js");

function createChallengeBudgetTracker(declaredBudget = {}) {
  let remainingChallenges = Math.max(1, Number(declaredBudget.max_challenges || 1));
  let remainingMutations = Math.max(0, Number(declaredBudget.mutation_budget !== undefined ? declaredBudget.mutation_budget : 0));
  let remainingTimeSeconds = Math.max(0.1, Number(declaredBudget.timeout_seconds || 60));

  return {
    consumeChallenge() {
      if (remainingChallenges <= 0) return false;
      remainingChallenges -= 1;
      return true;
    },
    consumeMutations(count = 1) {
      if (remainingMutations < count) return false;
      remainingMutations -= count;
      return true;
    },
    consumeTime(seconds = 0) {
      if (remainingTimeSeconds < seconds) return false;
      remainingTimeSeconds -= seconds;
      return true;
    },
    isExhausted() {
      if (remainingChallenges <= 0) return { exhausted: true, dimension: "max_challenges" };
      if (remainingMutations < 0) return { exhausted: true, dimension: "mutation_budget" };
      if (remainingTimeSeconds <= 0) return { exhausted: true, dimension: "timeout_seconds" };
      return { exhausted: false };
    },
    getRemaining() {
      return {
        max_challenges: remainingChallenges,
        mutation_budget: remainingMutations,
        timeout_seconds: remainingTimeSeconds,
      };
    },
    buildExhaustionFailure({ candidateId, planId, dimension }) {
      return createCausalFailure({
        category: CAUSAL_CATEGORIES.VALIDATION_GAP,
        code: "CHALLENGE_BUDGET_EXHAUSTED",
        blocking_fingerprint: `challenge-budget:${planId}:${dimension}`,
        details: {
          candidate_id: candidateId,
          plan_id: planId,
          exhausted_dimension: dimension,
        },
      });
    },
  };
}

module.exports = { createChallengeBudgetTracker };
```

### 4. Challenge Runner & Result Emitter (`scripts/lib/adversarial-challenges/runner.js`)

```javascript
"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");
const { createChallengeBudgetTracker } = require("./budget.js");

/**
 * Executes a ChallengePlan against an isolated workspace copy.
 * @param {Object} plan - ChallengePlanV1
 * @param {Object} context - Execution context (workspaceCopy, testRunner, candidate)
 * @returns {Promise<{ ok: boolean, results?: Array<Object>, causalFailure?: Object }>}
 */
async function executeChallengePlan(plan, context) {
  const tracker = createChallengeBudgetTracker(plan.budget);
  const results = [];

  for (const challengeType of plan.selected) {
    if (!tracker.consumeChallenge()) {
      return {
        ok: false,
        causalFailure: tracker.buildExhaustionFailure({
          candidateId: plan.candidate_id,
          planId: plan.plan_id,
          dimension: "max_challenges",
        }),
      };
    }

    const execResult = await runIndividualChallenge(challengeType, plan, context, tracker);
    if (!execResult.ok && execResult.budgetExhausted) {
      return {
        ok: false,
        causalFailure: tracker.buildExhaustionFailure({
          candidateId: plan.candidate_id,
          planId: plan.plan_id,
          dimension: execResult.exhaustedDimension || "mutation_budget",
        }),
      };
    }

    results.push(execResult.result);
  }

  return { ok: true, results };
}

function emitChallengeResult({
  planId,
  candidateId,
  challengeType,
  outcome,
  nodeId = "default",
  evidenceIds = [],
  details = {},
}) {
  const canonicalBody = {
    schema_version: 1,
    kind: "challenge-result/v1",
    plan_id: planId,
    candidate_id: candidateId,
    challenge_type: challengeType,
    outcome,
    node_id: nodeId,
    evidence_ids: evidenceIds,
    details,
  };

  const result_id = sha256Fingerprint("challenge-result:v1", canonicalBody);

  return {
    ...canonicalBody,
    result_id,
  };
}

module.exports = {
  executeChallengePlan,
  emitChallengeResult,
};
```

---

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| **Unit** | Validación del catálogo de challenges (`catalog.js`) | Verificar inclusión de los 9 tipos soportados y rechazo fail-closed de tipos desconocidos (`REQ-adversarial-challenges-001`). |
| **Unit** | Planificador determinista (`planner.js`) | Probar matrices de selección proporcional para las 6 estrategias (`bug`, `refactor`, `migration`, `config-docs`, `feature`, `strict-tdd`), hash determinista idéntico en replays y motivos de omisión (`REQ-adversarial-challenges-002`). |
| **Unit** | Presupuesto y agotamiento monótono (`budget.js`) | Verificar decremento estricto de cuotas y emisión de `causal-failure/v1` con `CHALLENGE_BUDGET_EXHAUSTED` (`REQ-adversarial-challenges-003`). |
| **Unit** | Inyector de mutaciones focales (`mutator.js`) | Validar mutación de operadores lógicos, relacionales y valores de retorno acotados al diff, y reversión de parches. |
| **Unit** | Ejecutor de challenges y detección de anomalías (`runner.js`) | Probar que defectos sembrados con tests pasando emiten `COMPLACENT_TEST_DETECTED` y aserciones tautológicas emiten `TAUTOLOGICAL_TEST_DETECTED` (`REQ-adversarial-challenges-004`). |
| **Integration** | Esquemas kernel y fixtures canónicas (`k6c-schema-fixtures.test.js`) | Validar fixtures válidas e inválidas de `challenge-plan/v1` y `challenge-result/v1`, registro en manifest y claims, e invariabilidad byte-identical de K1 y K6b (`REQ-kernel-contract-schemas-001/029`). |
| **Integration** | Verifier independiente con challenges (`independent-verifier/index.test.js`) | Validar consumo fail-closed de `challenge-result/v1`, rechazo si algún challenge falla o el budget se agota, y verificar que no sustituye strategy minimums ni MUST obligations (`REQ-independent-verification-010`). |
| **Integration** | Fronteras de autoridad y evolución del harness (`roadmap-boundary.test.js`) | Verificar que K6c se etiqueta como `implemented`, que los challenges no conceden delivery authority y que K7/K8 permanecen no-implementados (`REQ-harness-authority-canon-011/012`). |

---

## Migration / Rollout

No data migration required.

1. **Aditividad de esquemas**: `challenge-plan/v1.schema.json` y `challenge-result/v1.schema.json` se introducen como esquemas nuevos e independientes.
2. **Invariantes preservadas**: Los esquemas K1 (`K1_SCHEMA_BASELINE`) y K6b (`evidence/v2`, `verification/v2`, `assurance-graph/v1`, `assessment/v2`, `runner-receipt/v1`) permanecen byte-idénticos.
3. **Compatibilidad del Verifier**: El consumo de `challengePlan` y `challengeResults` en `independent-verifier` es opcional/progresivo; cuando no se proveen parámetros de challenges, el verifier opera normalmente con sus verificaciones de estrategia y obligaciones MUST.

---

## Open Questions

None. Todas las decisiones arquitectónicas están alineadas con las especificaciones locales y los requerimientos del kernel.
