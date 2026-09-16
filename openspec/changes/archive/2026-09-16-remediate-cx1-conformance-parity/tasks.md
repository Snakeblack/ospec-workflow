Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: feature-branch-chain
400-line budget risk: Low

# Tasks: Remediate CX1 Conformance Parity

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-kernel-contract-schemas-031 / Valid result-envelope v1 fixture passes validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Fixtures válidos existentes continúan pasando sin regresión |
| REQ-kernel-contract-schemas-031 / Invalid fixture with missing required field fails validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Propiedades requeridas de primer nivel rechazadas fail-closed |
| REQ-kernel-contract-schemas-031 / Valid blocked fixture with question_gate passes validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Payload bloqueado con `question_gate` completo es válido |
| REQ-kernel-contract-schemas-031 / Blocked status without question_gate fails schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json`, conditional `if/then` | covered-by-design | Regla `if status == blocked then required: ["question_gate"]` |
| REQ-kernel-contract-schemas-031 / Empty string in question_gate text fields fails schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json`, `minLength: 1` | covered-by-design | Restricción en `reason`, `header`, `question` y `label` |
| REQ-kernel-contract-schemas-031 / Empty string in assumptions text fields fails schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json`, `minLength: 1` | covered-by-design | Restricción en `id`, `phase`, `statement` y `basis` |
| REQ-kernel-contract-schemas-031 / Valid sdd-spec success fixture with ambiguity signals passes validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | 4 señales presentes con tipos correctos aprobadas |
| REQ-kernel-contract-schemas-031 / Valid verify_outcome conforms to schema enum | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Valores enumerados PASS / PASS WITH WARNINGS / FAIL |
| REQ-kernel-contract-schemas-031 / Invalid verify_outcome enum fails schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Enum cerrado estricto rechazado fail-closed |
| REQ-kernel-contract-schemas-031 / Non-string elements in artifacts or risks fail schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Tipos de array de strings validados |
| REQ-kernel-contract-schemas-031 / Invalid skill_resolution enum fails schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Enum cerrado de cuatro opciones validado |
| REQ-kernel-contract-schemas-031 / Malformed question_gate object fails schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Subpropiedades obligatorias en gate y preguntas |
| REQ-kernel-contract-schemas-031 / Root schema result-envelope.schema.json maintains identical parity | MUST | `schemas/kernel/result-envelope.schema.json` | covered-by-design | Compatibilidad 1:1 con v1 replicando restricciones |
| REQ-skills-018 / Valid v1 envelope emitted on phase completion | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & skills | covered-by-design | Emisión canónica v1 especificada |
| REQ-skills-018 / Blocked status includes required question gate and blocker type | MUST | `scripts/lib/result-envelope.js` & `internal/resultenvelope/resultenvelope.go` | covered-by-design | Validación consistente de `question_gate` obligatorio |
| REQ-skills-018 / Successful sdd-spec envelope includes ambiguity signals | MUST | `scripts/lib/result-envelope.js` & `internal/resultenvelope/resultenvelope.go` | covered-by-design | Validación phase-aware en JS y Go |
| REQ-skills-018 / sdd-verify emits mandatory canonical verify_outcome | MUST | `scripts/lib/result-envelope.js` & `internal/resultenvelope/resultenvelope.go` | covered-by-design | Validación de enum canónico verify_outcome |
| REQ-skills-018 / JS and Go validators require schema_version == 1 | MUST | `scripts/lib/result-envelope.js` & `internal/resultenvelope/resultenvelope.go` | covered-by-design | Restricción const 1 en ambos runtimes |
| REQ-skills-018 / JS and Go validators enforce array item string types | MUST | `scripts/lib/result-envelope.js` & `internal/resultenvelope/resultenvelope.go` | covered-by-design | Chequeo de items string en artifacts y risks |
| REQ-skills-018 / JS and Go validators enforce skill_resolution enum | MUST | `scripts/lib/result-envelope.js` & `internal/resultenvelope/resultenvelope.go` | covered-by-design | Validación contra enum cerrado |
| REQ-skills-018 / JS and Go validators enforce question_gate structure | MUST | `scripts/lib/result-envelope.js` & `internal/resultenvelope/resultenvelope.go` | covered-by-design | Validación de reason y questions requeridas |
| REQ-skills-018 / Automated differential conformance validation across all shared fixtures in Node and Go | MUST | `scripts/lib/result-envelope-conformance.test.js` & `internal/resultenvelope/conformance_test.go` | covered-by-design | Suites en ambos lenguajes sobre matriz unificada |
| REQ-skills-018 / Differential conformance rejects blocked fixture without question_gate across all runtimes | MUST | `scripts/lib/result-envelope-conformance.test.js` & `internal/resultenvelope/conformance_test.go` | covered-by-design | Comprobación `schema.valid == false && js.valid == false && go.valid == false` |
| REQ-skills-018 / Differential conformance rejects empty string fields across all runtimes | MUST | `scripts/lib/result-envelope-conformance.test.js` & `internal/resultenvelope/conformance_test.go` | covered-by-design | Comprobación de rechazo unánime en strings vacíos |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~250 lines (180 additions, 70 deletions) |
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
| 1 | Hardening de schemas v1 y raíz, fixtures negativos atómicos, tests de esquemas y suites simétricas de conformidad diferencial en Node y Go con sync de roadmap | PR 1 | Base branch: `fix/remediate-cx1-conformance-parity`; entrega atómica auto-contenida (< 300 líneas) |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Fixtures Negativos y Tests Existentes (RED)

- [x] 1.1 [RED] Crear fixture negativo `schemas/kernel/result-envelope/v1/fixtures/invalid/blocked-missing-question-gate.json` con `status: "blocked"` omitiendo `question_gate` [REQ-kernel-contract-schemas-031]
- [x] 1.2 [RED] Crear fixture negativo `schemas/kernel/result-envelope/v1/fixtures/invalid/empty-question-gate-fields.json` con cadenas vacías en `reason`, `header`, `question` y `label` [REQ-kernel-contract-schemas-031]
- [x] 1.3 [RED] Crear fixture negativo `schemas/kernel/result-envelope/v1/fixtures/invalid/empty-assumption-fields.json` con cadenas vacías en `id`, `phase`, `statement` y `basis` [REQ-kernel-contract-schemas-031]
- [x] 1.4 [RED] Actualizar `scripts/lib/result-envelope-schema-fixtures.test.js` registrando los tres nuevos fixtures negativos con sus reglas esperadas (`required` y `minLength`) y verificar que fallan contra el schema actual no endurecido [REQ-kernel-contract-schemas-031]

## Phase 2: Hardening de Schemas JSON (GREEN)

- [x] 2.1 [GREEN] Modificar `schemas/kernel/result-envelope/v1/envelope.schema.json` añadiendo la regla condicional `if: { properties: { status: { const: "blocked" } } }, then: { required: ["question_gate"] }` [REQ-kernel-contract-schemas-031, REQ-skills-018]
- [x] 2.2 [GREEN] Modificar `schemas/kernel/result-envelope/v1/envelope.schema.json` incorporando `minLength: 1` en `question_gate` (`reason`, `header`, `question`, `label`) y en `assumptions` (`id`, `phase`, `statement`, `basis`) [REQ-kernel-contract-schemas-031, REQ-skills-018]
- [x] 2.3 [GREEN] Modificar el schema raíz de compatibilidad `schemas/kernel/result-envelope.schema.json` replicando exactamente el bloque `if/then` y las restricciones `minLength: 1` para garantizar paridad 1:1 con v1 [REQ-kernel-contract-schemas-031]
- [x] 2.4 [VERIFY] Ejecutar `node --test scripts/lib/result-envelope-schema-fixtures.test.js` y confirmar que todos los fixtures válidos e inválidos pasan las aserciones [REQ-kernel-contract-schemas-031]

## Phase 3: Suite de Conformidad Diferencial Simétrica (TDD RED & GREEN)

- [x] 3.1 [RED] Crear suite de conformidad diferencial en Node.js `scripts/lib/result-envelope-conformance.test.js` que recorra todos los fixtures compartidos en `schemas/kernel/result-envelope/v1/fixtures/` (`valid/` e `invalid/`) comprobando paridad estricta `schema.valid === js.valid` [REQ-skills-018, REQ-kernel-contract-schemas-031]
- [x] 3.2 [RED] Crear suite de conformidad diferencial en Go `internal/resultenvelope/conformance_test.go` que cargue la misma matriz de fixtures compartidos y compruebe `resultenvelope.Validate(fixture)` [REQ-skills-018, REQ-kernel-contract-schemas-031]
- [x] 3.3 [GREEN] Ejecutar `node --test scripts/lib/result-envelope-conformance.test.js` y `go test -v ./internal/resultenvelope/...` asegurando paridad absoluta en ambas suites sin discrepancias ni dependencias externas [REQ-skills-018]

## Phase 4: Sincronización Documental del Roadmap

- [x] 4.1 Actualizar `docs/roadmaps/harness-evolution.md` marcando el slice CX1 como implementado/archivado (`implemented-archived`) y ajustando el texto de dependencia en la fila de CX0 [REQ-skills-018]

## Phase 5: Verificación Integral de la Suite Completa

- [x] 5.1 Ejecutar suite completa de Node.js `node --test` verificando que los tests de lifecycle kernel, hooks y schemas se ejecutan sin regresiones [REQ-kernel-contract-schemas-031, REQ-skills-018]
- [x] 5.2 Ejecutar suite completa de Go `go test ./...` asegurando que todos los paquetes Go compilan y pasan [REQ-skills-018]
- [x] 5.3 Ejecutar script de validación general `node scripts/check.js` para asegurar que el repositorio cumple con todas las reglas de consistencia e integridad [REQ-skills-018]
