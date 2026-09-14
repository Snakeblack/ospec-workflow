Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: feature-branch-chain
400-line budget risk: Low

# Tasks: Remediate CX1 Envelope Projection Findings

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-hooks-015 / Invalid successful sdd-spec envelope becomes blocked status | MUST | `scripts/hooks/subagent-stop.js`, `resolveDispatchStatus` & `internal/hooks/subagentstop.go` | covered-by-design | Rechazo fail-closed si fallan ambiguity signals |
| REQ-hooks-015 / Prefixed sdd-spec dispatch enforces fail-closed validation | MUST | `scripts/hooks/subagent-stop.js`, `resolveCanonicalAgent` | covered-by-design | Normaliza prefijos antes de evaluar ambigüedad |
| REQ-hooks-015 / Valid envelope from prefixed dispatch projects state via PhaseCompletionReducer | MUST | `scripts/hooks/subagent-stop.js`, `persistResultEnvelope` | covered-by-design | Deriva phase key canónica y proyecta estado |
| REQ-hooks-015 / Unresolvable or foreign agent skips envelope persistence fail-safely | MUST | `scripts/hooks/subagent-stop.js`, `persistResultEnvelope` | covered-by-design | No-op seguro ante agente no reconocido |
| REQ-hooks-015 / Zero device id still matches transcript identity | MUST | `scripts/hooks/subagent-stop.js`, `sameFileIdentity` | covered-by-design | Soporte cross-device dev=0 preservado |
| REQ-hooks-015 / Legacy envelope without canonical fence is adapted and projected | MUST | `scripts/hooks/subagent-stop.js` & `internal/hooks/subagentstop.go`, fallback `adaptLegacyEnvelope` | covered-by-design | Normaliza raw text/transcript y proyecta |
| REQ-hooks-015 / Legacy sdd-spec success without ambiguity signals fails closed | MUST | `scripts/hooks/subagent-stop.js` & `internal/hooks/subagentstop.go`, phase-aware validation | covered-by-design | Rechazo fail-closed sin proyectar y status blocked |
| REQ-lifecycle-kernel-028 / Reducer computes valid phase advance from success envelope | MUST | `scripts/lib/lifecycle-kernel/phase-completion-reducer.js`, `reducePhaseCompletion` | covered-by-design | Proyección pura y determinista de estado |
| REQ-lifecycle-kernel-028 / Reducer projects blocked status with questions and blocker metadata | MUST | `scripts/lib/lifecycle-kernel/phase-completion-reducer.js`, `reducePhaseCompletion` | covered-by-design | Proyección de status blocked y questions |
| REQ-lifecycle-kernel-028 / Reducer rejects synthetic gate passes and uncommitted approvals | MUST | `scripts/lib/lifecycle-kernel/phase-completion-reducer.js`, `reducePhaseCompletion` | covered-by-design | Preservación de approvals/gates existentes |
| REQ-lifecycle-kernel-028 / Reducer advances to verified only with positive explicit verify_outcome | MUST | `scripts/lib/lifecycle-kernel/phase-completion-reducer.js`, `isPositiveVerifyOutcome` | covered-by-design | Gating estricto de PASS / PASS WITH WARNINGS |
| REQ-lifecycle-kernel-028 / Reducer projects blocked when verify_outcome is FAIL or omitted | MUST | `scripts/lib/lifecycle-kernel/phase-completion-reducer.js`, verify phase evaluation | covered-by-design | FAIL, ausente o inválido proyecta status blocked |
| REQ-kernel-contract-schemas-031 / Valid result-envelope v1 fixture passes validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Fixture valid-v1.json conforme al schema |
| REQ-kernel-contract-schemas-031 / Invalid fixture with missing required field fails validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Fixture invalid-v1.json rechazado |
| REQ-kernel-contract-schemas-031 / Valid blocked fixture with question_gate passes validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Fixture blocked-v1.json conforme al schema |
| REQ-kernel-contract-schemas-031 / Valid sdd-spec success fixture with ambiguity signals passes validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Fixture ambiguity-spec-v1.json conforme |
| REQ-kernel-contract-schemas-031 / Valid verify_outcome conforms to schema enum | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures/valid/verify-pass-v1.json | covered-by-design | PASS, PASS WITH WARNINGS y FAIL permitidos |
| REQ-kernel-contract-schemas-031 / Invalid verify_outcome enum fails schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures/invalid/verify-outcome-invalid.json | covered-by-design | Valores no enumerados rechazados fail-closed |
| REQ-kernel-contract-schemas-031 / Non-string elements in artifacts or risks fail schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures/invalid/non-string-artifacts.json | covered-by-design | Elementos no-string en arrays rechazados |
| REQ-kernel-contract-schemas-031 / Invalid skill_resolution enum fails schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures/invalid/invalid-skill-resolution.json | covered-by-design | Enum cerrado estricto validado |
| REQ-kernel-contract-schemas-031 / Malformed question_gate object fails schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures/invalid/malformed-question-gate.json | covered-by-design | Estructura interna requerida validada |
| REQ-skills-018 / Valid v1 envelope emitted on phase completion | MUST | `skills/sdd-verify/SKILL.md` & `agents/sdd-verify.agent.md` | covered-by-design | Emisión canónica v1 especificada |
| REQ-skills-018 / Blocked status includes required question gate and blocker type | MUST | `skills/sdd-verify/SKILL.md` & `agents/sdd-verify.agent.md` | covered-by-design | Formato blocked con question_gate |
| REQ-skills-018 / Successful sdd-spec envelope includes ambiguity signals | MUST | `skills/sdd-spec/SKILL.md` | covered-by-design | 4 señales obligatorias en éxito |
| REQ-skills-018 / sdd-verify emits mandatory canonical verify_outcome | MUST | `skills/sdd-verify/SKILL.md` & `agents/sdd-verify.agent.md` | covered-by-design | Obligatoriedad contractual de verify_outcome |
| REQ-skills-018 / JS and Go validators require schema_version == 1 | MUST | `scripts/lib/result-envelope.js` & `internal/resultenvelope/resultenvelope.go` | covered-by-design | Validación const 1 en ambos runtimes |
| REQ-skills-018 / JS and Go validators enforce array item string types | MUST | `scripts/lib/result-envelope.js` & `internal/resultenvelope/resultenvelope.go` | covered-by-design | Chequeo de tipo string en cada item de array |
| REQ-skills-018 / JS and Go validators enforce skill_resolution enum | MUST | `scripts/lib/result-envelope.js` & `internal/resultenvelope/resultenvelope.go` | covered-by-design | Validación contra enum cerrado |
| REQ-skills-018 / JS and Go validators enforce question_gate structure | MUST | `scripts/lib/result-envelope.js` & `internal/resultenvelope/resultenvelope.go` | covered-by-design | Validación de reason y questions requeridas |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~320 lines (220 additions, 100 deletions) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | feature-branch-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: feature-branch-chain
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Remediación de proyección y validación de envelopes CX1 en schema, validadores, reducer, hooks y skills con tests de paridad | PR 1 | Base branch: `fix/remediate-cx1-envelope-projection`; entrega atómica completa bajo presupuesto de 400 líneas |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Schema & Fixtures

- [x] 1.1 [RED] Añadir tests en `scripts/lib/result-envelope-schema-fixtures.test.js` para registrar fixtures válidos e inválidos de `verify_outcome`, items no-string en arrays, `skill_resolution` y malformación de `question_gate`. [REQ-kernel-contract-schemas-031]
- [x] 1.2 [GREEN] Actualizar `schemas/kernel/result-envelope/v1/envelope.schema.json` con la propiedad opcional `verify_outcome` y registrarla en `enum_values` de `schemas/kernel/contract-claims.json`. [REQ-kernel-contract-schemas-031]
- [x] 1.3 [GREEN] Crear fixtures de prueba `schemas/kernel/result-envelope/v1/fixtures/valid/verify-pass-v1.json`, `schemas/kernel/result-envelope/v1/fixtures/invalid/verify-outcome-invalid.json`, `non-string-artifacts.json`, `invalid-skill-resolution.json` y `malformed-question-gate.json`. [REQ-kernel-contract-schemas-031]
- [x] 1.4 [REFACTOR/VERIFY] Ejecutar `node --test scripts/lib/result-envelope-schema-fixtures.test.js` verificando que todos los fixtures válidos pasen y los inválidos fallen con path de error exacto. [REQ-kernel-contract-schemas-031]

## Phase 2: Validadores JS y Go

- [x] 2.1 [RED] Añadir casos de prueba que fallen en `scripts/lib/result-envelope.test.js` para items no-string en `artifacts`/`risks`, valores fuera de enum en `skill_resolution`, enum de `verify_outcome` y estructura de `question_gate`. [REQ-skills-018]
- [x] 2.2 [GREEN] Actualizar `scripts/lib/result-envelope.js` para validar elementos string en `artifacts` y `risks`, enum cerrado `skill_resolution`, enum `verify_outcome` y estructura de `question_gate`. [REQ-skills-018]
- [x] 2.3 [RED] Añadir casos de prueba en `internal/resultenvelope/resultenvelope_test.go` exigiendo `schema_version == 1`, items string en arrays, enums de `skill_resolution` y `verify_outcome`, estructura de `question_gate` y normalización vía `AdaptLegacyEnvelope`. [REQ-skills-018]
- [x] 2.4 [GREEN] Actualizar `internal/resultenvelope/resultenvelope.go` incorporando validación de `schema_version == 1`, items string en `artifacts`/`risks`, enums cerrados, estructura de `question_gate` e implementar la función `AdaptLegacyEnvelope`. [REQ-skills-018]
- [x] 2.5 [REFACTOR/VERIFY] Ejecutar `node --test scripts/lib/result-envelope.test.js` y `go test ./internal/resultenvelope/...` garantizando paridad cross-runtime de validación y mensajes de error deterministas. [REQ-skills-018]

## Phase 3: PhaseCompletionReducer

- [x] 3.1 [RED] Escribir tests en `scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js` verificando que en fase `verify` un `verify_outcome` ausente, `FAIL` o desconocido proyecte `status: "blocked"` con `blocking_questions`, mientras que `PASS` y `PASS WITH WARNINGS` proyecten `status: "verified"`. [REQ-lifecycle-kernel-028]
- [x] 3.2 [GREEN] Modificar `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` para condicionar `status: "verified"` exclusivamente a la presencia explícita de `verify_outcome` positivo (`PASS` o `PASS WITH WARNINGS`), proyectando `status: "blocked"` en cualquier otro caso. [REQ-lifecycle-kernel-028]
- [x] 3.3 [REFACTOR/VERIFY] Refactorizar la función `isPositiveVerifyOutcome` en `phase-completion-reducer.js` y ejecutar `node --test scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js` asegurando cobertura total de transiciones de estado. [REQ-lifecycle-kernel-028]

## Phase 4: SubagentStop Hook JS y Go

- [x] 4.1 [RED] Añadir pruebas en `scripts/hooks/subagent-stop.test.js` para delegación de texto crudo y transcripción a `adaptLegacyEnvelope()` en `persistResultEnvelope` y `resolveDispatchStatus`, verificando rechazo fail-closed de `sdd-spec` con éxito legacy sin señales de ambigüedad. [REQ-hooks-015]
- [x] 4.2 [GREEN] Actualizar `scripts/hooks/subagent-stop.js` conectando `adaptLegacyEnvelope` en `persistResultEnvelope` y `resolveDispatchStatus` cuando no se detecta fence canónico, aplicando validación phase-aware con el canonical agent resuelto. [REQ-hooks-015]
- [x] 4.3 [RED] Añadir pruebas en `internal/hooks/subagentstop_test.go` para delegación legacy a `AdaptLegacyEnvelope` y preservación de fail-closed para `sdd-spec` en Go. [REQ-hooks-015]
- [x] 4.4 [GREEN] Actualizar `internal/hooks/subagentstop.go` conectando `resultenvelope.AdaptLegacyEnvelope` en `persistResultEnvelope` y `resolveDispatchStatus` ante ausencia de fence canónico, garantizando fail-closed en `sdd-spec`. [REQ-hooks-015]
- [x] 4.5 [REFACTOR/VERIFY] Ejecutar `node --test scripts/hooks/subagent-stop.test.js` y `go test ./internal/hooks/...` asegurando que los hooks en ambos runtimes manejen envelopes legacy y canónicos sin excepciones ni divergencias. [REQ-hooks-015]

## Phase 5: Skill Contract & Documentation

- [x] 5.1 [GREEN] Modificar `skills/sdd-verify/SKILL.md` haciendo mandatoria la emisión de la propiedad canónica `verify_outcome` (`PASS`, `PASS WITH WARNINGS`, `FAIL`) en el return envelope de `sdd-verify`. [REQ-skills-018]
- [x] 5.2 [GREEN] Modificar `agents/sdd-verify.agent.md` alineando las instrucciones del agente con el contrato de retorno obligatorio de `verify_outcome`. [REQ-skills-018]
- [x] 5.3 [REFACTOR/VERIFY] Auditar que la documentación de `sdd-verify` refleje fielmente el esquema v1 y validar que no existan contradicciones en referencias cruzadas. [REQ-skills-018]

## Phase 6: Integration & Acceptance Tests

- [x] 6.1 [RED] Escribir test de integración de frontera en Node.js en `scripts/hooks/subagent-stop.test.js` simulando la ejecución completa de un subagente legacy `sdd-design` y un subagente `sdd-verify` validando proyección en `state.yaml`. [REQ-hooks-015, REQ-lifecycle-kernel-028]
- [x] 6.2 [GREEN] Implementar ajustes de integración necesarios para asegurar que la delegación end-to-end entre `SubagentStop`, `adaptLegacyEnvelope` y `projectPhaseCompletion` fluya limpiamente. [REQ-hooks-015, REQ-lifecycle-kernel-028]
- [x] 6.3 [RED] Escribir test de integración de frontera en Go en `internal/hooks/subagentstop_test.go` simulando el ciclo completo de despacho legacy y proyección de estado. [REQ-hooks-015]
- [x] 6.4 [GREEN] Ajustar integración en Go asegurando paridad estricta de comportamiento con la implementación en Node.js. [REQ-hooks-015, REQ-skills-018]
- [x] 6.5 [REFACTOR/VERIFY] Ejecutar las suites completas del repositorio (`node --test scripts/**/*.test.js` y `go test ./...`) para garantizar cero regresiones y conformidad total con los contratos. [REQ-hooks-015, REQ-lifecycle-kernel-028, REQ-kernel-contract-schemas-031, REQ-skills-018]
