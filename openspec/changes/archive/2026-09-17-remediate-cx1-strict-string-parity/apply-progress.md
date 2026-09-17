# Apply Progress: Remediate CX1 Strict String Parity

## Executive Summary
- **Branch**: Working on branch `fix/remediate-cx1-strict-string-parity`
- **Change**: `remediate-cx1-strict-string-parity`
- **Delivery Strategy**: `single-pr`
- **Implementation Mode**: `standard` under Strict TDD
- **Test Runner**: Node native test runner (`node --test`) & Go test runner (`go test`)
- **Status**: Complete — All 14 tasks across Phases 1 through 4 implemented, verified, and passing 100% with zero regressions.

---

## TDD Cycle Evidence & Phase Breakdown

### Phase 1: Matriz de Fixtures Negativos (RED)
- **1.1 [RED]**: Creado fixture negativo `schemas/kernel/result-envelope/v1/fixtures/invalid/whitespace-only-required-strings.json` conteniendo cadenas compuestas exclusivamente de espacios en blanco ("   ") en todos los campos con semántica isNonEmptyString.
- **1.2 [RED]**: Creado fixture negativo `schemas/kernel/result-envelope/v1/fixtures/invalid/non-string-detailed-report.json` conteniendo valor numérico `123` en `detailed_report`.
- **1.3 [RED]**: Actualizado `scripts/lib/result-envelope-schema-fixtures.test.js` registrando ambos fixtures en la tabla de fixtures inválidos esperados y verificado fallo contra los esquemas vigentes no modificados (Exit code 1).

### Phase 2: Schemas JSON v1 y Root (GREEN)
- **2.1 [GREEN]**: Modificado `schemas/kernel/result-envelope/v1/envelope.schema.json` incorporando restricción `"pattern": "\\S"` junto a `"minLength": 1` en `executive_summary`, `next_recommended`, rama string de `risks`, items de `key_decisions`, propiedades de `assumptions` (`id`, `phase`, `statement`, `basis`) y propiedades de texto de `question_gate` (`reason`, `header`, `question`, `label`).
- **2.2 [GREEN]**: Modificado el esquema raíz de compatibilidad `schemas/kernel/result-envelope.schema.json` replicando idénticamente las restricciones para preservar paridad 1:1 con v1.
- **2.3 [VERIFY]**: Ejecutado `node --test scripts/lib/result-envelope-schema-fixtures.test.js` confirmando que ambos fixtures negativos son rechazados fail-closed por `pattern` y `type` (5/5 tests PASS).

### Phase 3: Runtime Validators JS y Go (GREEN)
- **3.1 [RED]**: Añadidos tests unitarios en `scripts/lib/result-envelope.test.js` y `internal/resultenvelope/resultenvelope_test.go` verificando rechazo de tipo no-string en `detailed_report` con mensaje determinista "detailed_report must be a string". Verificado fallo previo a la implementación (Exit code 1 en ambos runtimes).
- **3.2 [GREEN]**: Implementada comprobación estricta `typeof obj.detailed_report !== "string"` cuando la propiedad está presente en `validateEnvelope` en `scripts/lib/result-envelope.js`.
- **3.3 [GREEN]**: Implementada comprobación estricta de aserción de tipo `_, isString := v.(string); !isString` cuando `detailed_report` está presente en `ValidateForPhase` en `internal/resultenvelope/resultenvelope.go`.
- **3.4 [VERIFY]**: Ejecutados `node --test scripts/lib/result-envelope.test.js` (52/52 PASS) y `go test -v -run TestValidate_DetailedReport ./internal/resultenvelope/...` (PASS en ambos runtimes).

### Phase 4: Suites de Conformidad Diferencial y Tests Unitarios (GREEN & REFACTOR)
- **4.1 [GREEN]**: Actualizado `scripts/lib/result-envelope-conformance.test.js` incorporando pruebas dedicadas para ambos nuevos fixtures y comprobando paridad `schema.valid === js.valid === false`.
- **4.2 [GREEN]**: Actualizado `internal/resultenvelope/conformance_test.go` incorporando pruebas dedicadas para ambos nuevos fixtures en Go y comprobando paridad `schema.valid === go.valid === false`.
- **4.3 [REFACTOR]**: Refactorizadas las aserciones de conformidad diferencial introduciendo el helper `assertInvalidConformance` en Node y Go, eliminando código redundante y consolidando la invariante de paridad trifásica estricta (`schema.valid === js.valid === go.valid === false`).
- **4.4 [VERIFY]**: Ejecutadas suites completas de pruebas en Node (`node --test scripts/lib/result-envelope*.test.js` - 64/64 PASS) y Go (`go test ./...` - PASS en todos los paquetes), confirmando regresión cero en kernel, hooks y runtime.

---

## TDD Cycle Evidence Table

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 1.1 | `schemas/kernel/result-envelope/v1/fixtures/invalid/whitespace-only-required-strings.json` | Contract | ✅ 60/60 (Node) | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Fixture negativo con `"   "` en campos de texto requeridos |
| 1.2 | `schemas/kernel/result-envelope/v1/fixtures/invalid/non-string-detailed-report.json` | Contract | ✅ 60/60 (Node) | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Fixture negativo con `detailed_report: 123` |
| 1.3 | `scripts/lib/result-envelope-schema-fixtures.test.js` | Unit/Schema | ✅ 5/5 | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean | Registrados ambos fixtures; observado fallo RED contra schemas no modificados |
| 2.1 | `schemas/kernel/result-envelope/v1/envelope.schema.json` | Schema | ✅ 4/5 (RED) | ✅ Written | ✅ Passed | ✅ 6 paths | ✅ Clean | Endurecido schema v1 con `"pattern": "\\S"` en campos isNonEmptyString |
| 2.2 | `schemas/kernel/result-envelope.schema.json` | Schema | ✅ 4/5 (RED) | ✅ Written | ✅ Passed | ✅ 6 paths | ✅ Clean | Replicadas idénticamente las restricciones en schema raíz para paridad 1:1 |
| 2.3 | `scripts/lib/result-envelope-schema-fixtures.test.js` | Verification | ✅ 4/5 (RED) | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Verificada suite de schemas completa (5/5 PASS) |
| 3.1 | `scripts/lib/result-envelope.test.js` & `internal/resultenvelope/resultenvelope_test.go` | Unit | ✅ 51/51 (JS) / All (Go) | ✅ Written | ✅ Passed | ✅ 4 cases | ✅ Clean | Añadidos tests unitarios para validación de tipo en detailed_report; observado RED |
| 3.2 | `scripts/lib/result-envelope.js` | Unit | ❌ RED (JS) | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Implementada validación typeof en JS para detailed_report |
| 3.3 | `internal/resultenvelope/resultenvelope.go` | Unit | ❌ RED (Go) | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Implementada validación de tipo string en Go para detailed_report |
| 3.4 | `scripts/lib/result-envelope.test.js` & `internal/resultenvelope/resultenvelope_test.go` | Verification | ✅ GREEN | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Verificación unitaria exitosa en ambos runtimes (JS: 52/52, Go: PASS) |
| 4.1 | `scripts/lib/result-envelope-conformance.test.js` | Integration | ✅ 5/5 | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean | Incorporados nuevos fixtures a la matriz diferencial en JS (7/7 PASS) |
| 4.2 | `internal/resultenvelope/conformance_test.go` | Integration | ✅ All | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean | Incorporados nuevos fixtures a la matriz diferencial en Go (PASS) |
| 4.3 | `scripts/lib/result-envelope-conformance.test.js` & `internal/resultenvelope/conformance_test.go` | Refactor | ✅ GREEN | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Consolidado helper assertInvalidConformance eliminando duplicación |
| 4.4 | Full Suites (`node --test` & `go test ./...`) | E2E | ✅ GREEN | ✅ Written | ✅ Passed | ➖ Suite | ✅ Clean | 100% verde en Node (64/64 tests) y Go (todos los paquetes) sin regresiones |

### Test Summary
- **Total tests written / updated**: 11 new tests / test cases
- **Total tests passing**: 64 (Node result-envelope suite) + 12 Go packages passing
- **Layers used**: Unit (52 JS + Go unit), Integration (7 JS conformance + Go conformance), Schema / Contract (5 JS schema)
- **Approval tests**: None — no legacy behavior change
- **Pure functions created / updated**: Pure validation in `scripts/lib/result-envelope.js` and `internal/resultenvelope/resultenvelope.go`

---

## Authoritative Strict TDD Evidence

```json:strict-tdd-evidence
{
  "change": "remediate-cx1-strict-string-parity",
  "status": "completed",
  "test_runner": "node --test & go test",
  "delivery_strategy": "single-pr",
  "phases_completed": [
    "Phase 1: Matriz de Fixtures Negativos (RED)",
    "Phase 2: Schemas JSON v1 y Root (GREEN)",
    "Phase 3: Runtime Validators JS y Go (GREEN)",
    "Phase 4: Suites de Conformidad Diferencial y Tests Unitarios (GREEN & REFACTOR)"
  ],
  "requirements_covered": [
    "REQ-kernel-contract-schemas-031",
    "REQ-skills-018"
  ]
}
```

---

## Remediation Batch: quality-review-gate advisory findings (2026-09-17, aprobación quality-review-gate-003)

Scope guard respetado: `adaptLegacyEnvelope`/`AdaptLegacyEnvelope`, PhaseCompletionReducer y verify_outcome intactos. Baseline previa al batch: Node 64/64, `go test ./internal/resultenvelope/...` ok, schemas raíz y v1 byte-idénticos.

### F-56ac2a291e91c857 (trust) — question_gate:null explícito
- RED: `TestValidate_ExplicitNullQuestionGateOnNonBlockedStatus` (Go) falló con valid=true; fixture `invalid/null-question-gate.json` falló en `TestConformance_AllInvalidFixturesFail`.
- GREEN: `resultenvelope.go` rama no-bloqueada ahora valida estructuralmente la key presente aunque su valor sea nil, emitiendo el mismo mensaje determinista JS "question_gate must be an object".

### F-9cb30d71ec9aa7e5 (runtime) — clase de whitespace ECMA
- RED: `TestValidate_WhitespaceClassMatchesECMA` falló en ambos sentidos (U+FEFF aceptado, U+0085 rechazado); fixtures `invalid/bom-whitespace-only-strings.json` y `valid/nel-non-whitespace-strings.json` (escapes `﻿`/`` explícitos) exponen la divergencia en las tres vías.
- GREEN: `isECMAWhitespace` (unicode.IsSpace excepto U+0085=NEL que NO es whitespace, más U+FEFF=BOM que SÍ lo es) usada por `isNonEmptyString` vía `strings.TrimFunc`. Semántica idéntica a `trim()`/`\S` ECMA.

### F-a8097f47b57d3ff6 (evolution) — paridad estructural schema raíz ↔ v1
- Nuevo test `assert.deepStrictEqual` estructural entre `schemas/kernel/result-envelope.schema.json` y `schemas/kernel/result-envelope/v1/envelope.schema.json` en `result-envelope-schema-fixtures.test.js`.
- RED demostrado por mutación: clave sintética `x_mutation_probe` en el schema raíz → suite rota; restaurado → verde. Cualquier edición unilateral ahora rompe la suite.

### F-6f7aad9d4ee43fa6 (evolution) — cinco fixtures de nivel superior
- Hallazgo clave: las cinco copias ya existen y son byte-idénticas en valid//invalid/, por lo que ya participan de los loops trifásicos; el gap real era la falta de vínculo entre duplicados (fuentes de verdad independientes que podían divergir).
- Fix: tests de paridad Node (deepStrictEqual top-level ↔ corpus) y Go (`TestConformance_TopLevelFixturesMatchCorpusCopies`, byte-equal). RED por mutación de `valid-v1.json` → fallo; restaurado → verde.
- Exclusión justificada: `legacy-unversioned.json` es input del adaptador legacy (fuera de scope). Su expectativa diferencial es coherente sin tocar el adaptador: los validadores canónicos v1 DEBEN rechazarlo (sin schema_version) y su copia en invalid/ afirma exactamente eso en las tres vías.

### TDD Cycle Evidence (remediation)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------|
| 5.1 | `internal/resultenvelope/resultenvelope_test.go` + fixture | Unit/Contract | 64/64 Node, Go ok | Ejecutado (fail) | Ejecutado (pass) | 2 vías (unit + fixture) | ➖ None needed | Mensaje determinista idéntico a JS |
| 5.2 | `internal/resultenvelope/resultenvelope_test.go` + 2 fixtures | Unit/Contract | 64/64 Node, Go ok | Ejecutado (fail ambos sentidos) | Ejecutado (pass) | 2 code points divergentes | ➖ None needed | isECMAWhitespace documentado con finding ID |
| 5.3 | `scripts/lib/result-envelope-schema-fixtures.test.js` | Contract | 5/5 | Mutación (fail observado) | Restaurado (pass 7/7) | ➖ Single | ➖ None needed | deepStrictEqual estructural |
| 5.4 | `result-envelope-schema-fixtures.test.js` + `internal/resultenvelope/conformance_test.go` | Contract | 5/5 / All | Mutación (fail observado) | Restaurado (pass) | 5 fixtures | ➖ None needed | legacy-unversioned exclusión documentada arriba |
| 5.5 | Suites completas | E2E | — | — | Node 68/68, `go test ./...` ok | — | — | Regresión cero; hooks Node inexistentes (migrados a Go, cubiertos) |

### Estado
- Status: remediation complete — 4/4 findings WARNING in-scope remediados, suites completas en verde.
- Nota para verify/orchestrator: el candidate cambió respecto de `current_candidate_id` del lineage; se requiere re-verificación y apertura de lineage sucesor (new-candidate) según aprobación quality-review-gate-003.

## Phase 6 — Remediation gen2 (approval quality-review-gate-004, orchestrator inline tras 429 del subagent)

- [x] 6.1 Fixture NEL: byte crudo 0x85 (UTF-8 invalido, decodificado a U+FFFD por ambos runtimes -> cobertura vacua) reemplazado por escape JSON  en valid/nel-non-whitespace-strings.json. Verificado: executive_summary decodifica a U+0085 (0x85) y ambas suites de conformance siguen en verde.
- [x] 6.2 Paridad de mensaje para question_gate falsy no-null en status blocked: nueva helper isJSONFalsy en resultenvelope.go (espejo de truthiness JS: nil/false/0/"") usada en la rama blocked -> Go ahora emite "question_gate is required when status is blocked" para falsy, igual que JS. Test diferencial TestValidate_BlockedFalsyQuestionGateMessageParity (Go) y espejo JS ("keeps the required message").
- [x] 6.3 Tests unitarios JS espejo (suggestion gen2): explicit null question_gate on success ("must be an object") y whitespace class ECMA ("﻿" rechazado, "" aceptado) en result-envelope.test.js.
- [x] 6.4 Regresion cero: node --test result-envelope*.test.js 71/71; go test ./... verde.

Findings addressed: runtime-001 (fixture NEL vacuo), runtime-002/trust (mensaje falsy), suggestions de cobertura JS.
