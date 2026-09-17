Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

# Tasks: Remediate CX1 Strict String Parity

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-kernel-contract-schemas-031 / Valid result-envelope v1 fixture passes validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Fixtures válidos existentes continúan pasando sin regresión |
| REQ-kernel-contract-schemas-031 / Invalid fixture with missing required field fails validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Propiedades requeridas de primer nivel rechazadas fail-closed |
| REQ-kernel-contract-schemas-031 / Valid blocked fixture with question_gate passes validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Payload bloqueado con `question_gate` completo es válido |
| REQ-kernel-contract-schemas-031 / Blocked status without question_gate fails schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json`, conditional `if/then` | covered-by-design | Regla condicional de `question_gate` obligatorio en estado bloqueado |
| REQ-kernel-contract-schemas-031 / Empty string in question_gate text fields fails schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json`, `minLength: 1` | covered-by-design | Restricción de longitud mínima en `reason`, `header`, `question` y `label` |
| REQ-kernel-contract-schemas-031 / Empty string in assumptions text fields fails schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json`, `minLength: 1` | covered-by-design | Restricción de longitud mínima en `id`, `phase`, `statement` y `basis` |
| REQ-kernel-contract-schemas-031 / Whitespace-only string in required text fields fails schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json`, `"pattern": "\\S"` | covered-by-design | Rechaza cadenas formadas exclusivamente por espacios (`"   "`) con error `pattern` |
| REQ-kernel-contract-schemas-031 / Non-string detailed_report fails schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json`, `"type": "string"` | covered-by-design | Rechaza tipos no string (números, booleanos, objetos) con error `type` |
| REQ-kernel-contract-schemas-031 / Valid sdd-spec success fixture with ambiguity signals passes validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Señales de ambigüedad válidas aprobadas en schema |
| REQ-kernel-contract-schemas-031 / Valid verify_outcome conforms to schema enum | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Enum cerrado PASS / PASS WITH WARNINGS / FAIL |
| REQ-kernel-contract-schemas-031 / Invalid verify_outcome enum fails schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Valores fuera de enum rechazados fail-closed |
| REQ-kernel-contract-schemas-031 / Non-string elements in artifacts or risks fail schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Tipos de array de strings validados estrictamente |
| REQ-kernel-contract-schemas-031 / Invalid skill_resolution enum fails schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Validación contra enum cerrado de resolución de skills |
| REQ-kernel-contract-schemas-031 / Malformed question_gate object fails schema validation | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & fixtures | covered-by-design | Estructura interna de `question_gate` validada |
| REQ-kernel-contract-schemas-031 / Root schema result-envelope.schema.json maintains identical parity | MUST | `schemas/kernel/result-envelope.schema.json` | covered-by-design | Sincronización idéntica 1:1 con v1 (`pattern: "\\S"`, `type: "string"`) |
| REQ-skills-018 / Valid v1 envelope emitted on phase completion | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json` & runtimes | covered-by-design | Emisión v1 estandarizada conforme a schema |
| REQ-skills-018 / Blocked status includes required question gate and blocker type | MUST | `scripts/lib/result-envelope.js` & `internal/resultenvelope/resultenvelope.go` | covered-by-design | Validación runtime de `question_gate` obligatorio en blocked |
| REQ-skills-018 / Successful sdd-spec envelope includes ambiguity signals | MUST | `scripts/lib/result-envelope.js` & `internal/resultenvelope/resultenvelope.go` | covered-by-design | Validación phase-aware en JS y Go para señales de ambigüedad |
| REQ-skills-018 / sdd-verify emits mandatory canonical verify_outcome | MUST | `scripts/lib/result-envelope.js` & `internal/resultenvelope/resultenvelope.go` | covered-by-design | Validación runtime de enum canonical verify_outcome |
| REQ-skills-018 / JS and Go validators require schema_version == 1 | MUST | `scripts/lib/result-envelope.js` & `internal/resultenvelope/resultenvelope.go` | covered-by-design | Restricción estricta de schema_version 1 en ambos runtimes |
| REQ-skills-018 / JS and Go validators enforce array item string types | MUST | `scripts/lib/result-envelope.js` & `internal/resultenvelope/resultenvelope.go` | covered-by-design | Validación de items string en artifacts y risks |
| REQ-skills-018 / JS and Go validators enforce skill_resolution enum | MUST | `scripts/lib/result-envelope.js` & `internal/resultenvelope/resultenvelope.go` | covered-by-design | Validación runtime contra enum cerrado |
| REQ-skills-018 / JS and Go validators enforce question_gate structure | MUST | `scripts/lib/result-envelope.js` & `internal/resultenvelope/resultenvelope.go` | covered-by-design | Validación de reason y questions en runtimes |
| REQ-skills-018 / JS and Go validators enforce string type on detailed_report when present | MUST | `scripts/lib/result-envelope.js` & `internal/resultenvelope/resultenvelope.go` | covered-by-design | Chequeo estricto `typeof === "string"` en JS y `v.(string)` en Go |
| REQ-skills-018 / Automated differential conformance validation across all shared fixtures in Node and Go | MUST | `scripts/lib/result-envelope-conformance.test.js` & `internal/resultenvelope/conformance_test.go` | covered-by-design | Suites diferenciales en ambos lenguajes sobre matriz unificada de fixtures |
| REQ-skills-018 / Differential conformance rejects blocked fixture without question_gate across all runtimes | MUST | `scripts/lib/result-envelope-conformance.test.js` & `internal/resultenvelope/conformance_test.go` | covered-by-design | Paridad trifásica `schema === js === go === false` |
| REQ-skills-018 / Differential conformance rejects empty string fields across all runtimes | MUST | `scripts/lib/result-envelope-conformance.test.js` & `internal/resultenvelope/conformance_test.go` | covered-by-design | Paridad trifásica `schema === js === go === false` en strings vacíos |
| REQ-skills-018 / Differential conformance rejects whitespace-only strings and non-string detailed_report across all runtimes | MUST | `scripts/lib/result-envelope-conformance.test.js` & `internal/resultenvelope/conformance_test.go` | covered-by-design | Paridad trifásica estricta asegurada en nuevos fixtures negativos |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~140 lines (schemas ~35, JS runtime ~6, Go runtime ~6, fixtures ~45, tests ~48) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Endurecimiento simétrico de schemas JSON (pattern `\S`), validadores runtime JS/Go (`detailed_report`), fixtures negativos dedicados y suites de conformidad diferencial trifásica | PR 1 | Single PR atómico; riesgo de presupuesto <400 líneas es Low (~140 líneas estimadas) |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Matriz de Fixtures Negativos (RED)

- [x] 1.1 [RED] Crear fixture negativo `schemas/kernel/result-envelope/v1/fixtures/invalid/whitespace-only-required-strings.json` con cadenas compuestas exclusivamente de espacios en blanco (`"   "`) en campos requeridos con semántica `isNonEmptyString` [REQ-kernel-contract-schemas-031]
- [x] 1.2 [RED] Crear fixture negativo `schemas/kernel/result-envelope/v1/fixtures/invalid/non-string-detailed-report.json` con valor numérico `123` en `detailed_report` [REQ-kernel-contract-schemas-031]
- [x] 1.3 [RED] Actualizar `scripts/lib/result-envelope-schema-fixtures.test.js` registrando ambos fixtures en la tabla de casos negativos esperados con sus reglas (`pattern` y `type`) y verificar que fallan contra los schemas actuales no modificados [REQ-kernel-contract-schemas-031]

## Phase 2: Schemas JSON v1 y Root (GREEN)

- [x] 2.1 [GREEN] Modificar `schemas/kernel/result-envelope/v1/envelope.schema.json` incorporando `"pattern": "\\S"` junto a `"minLength": 1"` en `executive_summary`, `next_recommended`, `risks` (string), `key_decisions.items`, `assumptions.*` (`id`, `phase`, `statement`, `basis`) y `question_gate` (`reason`, `header`, `question`, `label`) [REQ-kernel-contract-schemas-031, REQ-skills-018]
- [x] 2.2 [GREEN] Modificar el schema raíz de compatibilidad `schemas/kernel/result-envelope.schema.json` replicando idénticamente las restricciones `"pattern": "\\S"` para mantener paridad 1:1 con v1 [REQ-kernel-contract-schemas-031]
- [x] 2.3 [VERIFY] Ejecutar `node --test scripts/lib/result-envelope-schema-fixtures.test.js` confirmando que ambos nuevos fixtures son rechazados fail-closed por `pattern` y `type` respectivamente [REQ-kernel-contract-schemas-031]

## Phase 3: Runtime Validators JS y Go (GREEN)

- [x] 3.1 [RED] Añadir casos de prueba unitarios en `scripts/lib/result-envelope.test.js` y `internal/resultenvelope/resultenvelope_test.go` verificando que un valor no string en `detailed_report` produce el error `"detailed_report must be a string"` [REQ-skills-018]
- [x] 3.2 [GREEN] Modificar `scripts/lib/result-envelope.js` en `validateEnvelope` incorporando comprobación `typeof obj.detailed_report !== "string"` cuando la propiedad esté presente emitiendo `"detailed_report must be a string"` [REQ-skills-018]
- [x] 3.3 [GREEN] Modificar `internal/resultenvelope/resultenvelope.go` en `ValidateForPhase` incorporando comprobación `_, isString := v.(string); if !isString` cuando `detailed_report` esté presente emitiendo `"detailed_report must be a string"` [REQ-skills-018]
- [x] 3.4 [VERIFY] Ejecutar `node --test scripts/lib/result-envelope.test.js` y `go test -v -run TestValidate_DetailedReport ./internal/resultenvelope/...` asegurando que las pruebas unitarias pasan en ambos runtimes [REQ-skills-018]

## Phase 4: Suites de Conformidad Diferencial y Tests Unitarios (GREEN & REFACTOR)

- [x] 4.1 [GREEN] Actualizar `scripts/lib/result-envelope-conformance.test.js` incorporando los dos nuevos fixtures negativos en la matriz de prueba diferencial y verificando `schema.valid === js.valid === false` [REQ-skills-018, REQ-kernel-contract-schemas-031]
- [x] 4.2 [GREEN] Actualizar `internal/resultenvelope/conformance_test.go` incorporando los dos nuevos fixtures negativos en la matriz de prueba diferencial en Go y verificando `schema.valid === go.valid === false` [REQ-skills-018, REQ-kernel-contract-schemas-031]
- [x] 4.3 [REFACTOR] Refactorizar la configuración de fixtures y aserciones de conformidad diferencial para consolidar la invariante de paridad trifásica estricta (`schema.valid === js.valid === go.valid === false`) eliminando redundancias [REQ-skills-018]
- [x] 4.4 [VERIFY] Ejecutar las suites completas `node --test` y `go test ./...` para confirmar el 100% de paridad trifásica y garantizar regresión cero en kernel y hooks [REQ-kernel-contract-schemas-031, REQ-skills-018]

## Phase 5: Remediation de findings del quality-review-gate (advisory, aprobación quality-review-gate-003)

- [x] 5.1 [F-56ac2a291e91c857] Tratar `question_gate: null` explícito en status no bloqueado igual que JS: fixture diferencial `invalid/null-question-gate.json` + test Go RED + fix en `ValidateForPhase` (rechazo con "question_gate must be an object")
- [x] 5.2 [F-9cb30d71ec9aa7e5] Alinear la clase de whitespace de Go con ECMA en `isNonEmptyString` (`isECMAWhitespace`: U+FEFF sí es whitespace, U+0085 no) + fixtures diferenciales `invalid/bom-whitespace-only-strings.json` y `valid/nel-non-whitespace-strings.json` + tests RED
- [x] 5.3 [F-a8097f47b57d3ff6] Test `assert.deepStrictEqual` estructural entre schema raíz y v1 en `result-envelope-schema-fixtures.test.js` (cualquier edición unilateral rompe la suite)
- [x] 5.4 [F-6f7aad9d4ee43fa6] Vincular los cinco fixtures de nivel superior a sus copias en valid//invalid/ con tests de paridad en Node (deepStrictEqual) y Go (byte-equal); legacy-unversioned documentado como exclusión coherente (input del adaptador legacy, fuera de scope)
- [x] 5.5 [VERIFY] Regresión cero: Node 68/68 en suites result-envelope, `go test ./...` completo en verde
