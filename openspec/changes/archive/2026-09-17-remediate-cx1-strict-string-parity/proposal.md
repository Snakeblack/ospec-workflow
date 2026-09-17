# Proposal: Remediate CX1 Strict String Parity

## Intent

Remediar dos divergencias contractuales entre los esquemas JSON de `result-envelope/v1` y sus validadores de ejecución (JavaScript y Go) identificadas tras el PR #191:
1. `minLength: 1` en el schema permite cadenas formadas exclusivamente por espacios en blanco (`"   "`), mientras que los validadores JS (`trim().length > 0`) y Go (`strings.TrimSpace(s) != ""`) las rechazan como inválidas.
2. `detailed_report` está declarado como `"type": "string"` en el schema, pero carece de validación de tipo en runtime en JS y Go (valores no string como números u objetos pasan inadvertidos en los runtimes).

Esta propuesta implementa el endurecimiento de schemas y runtimes para garantizar paridad contractual estricta y verificación diferencial trifásica (`schema.valid === js.valid === go.valid`).

## Scope

### In Scope
- Añadir `"pattern": "\\S"` en `schemas/kernel/result-envelope/v1/envelope.schema.json` y `schemas/kernel/result-envelope.schema.json` en todos los campos con semántica `isNonEmptyString`.
- Implementar validación de tipo string para `detailed_report` cuando esté presente en `scripts/lib/result-envelope.js` y `internal/resultenvelope/resultenvelope.go`.
- Crear fixtures negativos específicos: `whitespace-only-required-strings.json` y `non-string-detailed-report.json` en `schemas/kernel/result-envelope/v1/fixtures/invalid/`.
- Integrar ambos fixtures en suites de conformidad diferencial en Node.js y Go, garantizando la paridad estricta entre esquemas y runtimes.

### Out of Scope
- Modificaciones en `PhaseCompletionReducer`, máquinas de estado o lógica de transición de SDD.
- Alteraciones en adaptadores legacy o en la función `renderEnvelopeToMarkdown`.
- Modificación de enums existentes (`status`, `skill_resolution`, `verify_outcome`, `reversibility`, `blocker_type`).

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `kernel-contract-schemas`: Actualizar REQ-kernel-contract-schemas-031 para exigir patrón non-whitespace (`\S`) en todos los campos de texto requeridos, validación estricta de `detailed_report` y fixtures dedicados para ambos casos negativos.
- `skills`: Actualizar REQ-skills-018 para exigir paridad trifásica de validación estricta en strings no vacíos y `detailed_report` en JS y Go.

## Approach

1. **Hardening de schemas JSON**: Añadir restricción `"pattern": "\\S"` junto a `minLength: 1` en `envelope.schema.json` (v1 y root) en `executive_summary`, `next_recommended`, `risks` (rama string), `key_decisions` (items), `assumptions.*` (`id`, `phase`, `statement`, `basis`) y `question_gate.*` (`reason`, `header`, `question`, `label`).
2. **Validación runtime**: Incorporar chequeo estricto `typeof detailed_report === "string"` en `scripts/lib/result-envelope.js` e `internal/resultenvelope/resultenvelope.go` si la propiedad existe en el payload.
3. **Fixtures y pruebas diferenciales**: Publicar fixtures negativos y verificar que las suites de conformidad en Node.js y Go confirmen el rechazo uniforme y reporten los errores correspondientes.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `schemas/kernel/result-envelope/v1/envelope.schema.json` | Modified | Incorporación de `"pattern": "\\S"` en campos no vacíos |
| `schemas/kernel/result-envelope.schema.json` | Modified | Sincronización idéntica con el schema v1 |
| `scripts/lib/result-envelope.js` | Modified | Validación de tipo string en `detailed_report` |
| `internal/resultenvelope/resultenvelope.go` | Modified | Validación de tipo string en `detailed_report` |
| `schemas/kernel/result-envelope/v1/fixtures/invalid/` | New | Fixtures para espacios en blanco y `detailed_report` no-string |
| `scripts/lib/result-envelope-conformance.test.js` | Modified | Pruebas de conformidad diferencial en Node.js |
| `scripts/lib/result-envelope-schema-fixtures.test.js` | Modified | Pruebas de validación de schema en Node.js |
| `internal/resultenvelope/conformance_test.go` | Modified | Pruebas de conformidad diferencial en Go |
| `internal/resultenvelope/resultenvelope_test.go` | Modified | Pruebas unitarias de validación en Go |
| `openspec/specs/kernel-contract-schemas/spec.md` | Modified | Delta spec de kernel-contract-schemas |
| `openspec/specs/skills/spec.md` | Modified | Delta spec de skills |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Incompatibilidad de regex entre motores JSON Schema | Low | El patrón `\S` es estándar ECMA-262 / JSON Schema soportado nativamente por Ajv y Go regex. |
| Rechazo imprevisto de cadenas válidas | Low | Solo rechaza cadenas compuestas exclusivamente por espacios; cualquier carácter visible valida correctamente. |

## Rollback Plan

Revertir los commits del feature branch restaurando las versiones previas de schemas, validadores y tests, eliminando los dos nuevos fixtures.

## Dependencies

- Ninguna dependencia externa adicional requerida; utiliza frameworks de prueba nativos (`node:test` y Go `testing`).

## Success Criteria

- [ ] Los schemas v1 y root rechazan payloads con cadenas de solo espacios en blanco en campos con semántica `isNonEmptyString`.
- [ ] Los validadores JS y Go rechazan `detailed_report` cuando su valor no es una cadena de texto.
- [ ] Los fixtures `whitespace-only-required-strings.json` y `non-string-detailed-report.json` son rechazados unánimemente (`schema.valid === js.valid === go.valid === false`).
- [ ] El 100% de las pruebas unitarias y de conformidad diferencial en Node.js y Go pasan satisfactoriamente.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
