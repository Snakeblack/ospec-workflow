# Proposal: Remediate CX1 Conformance Parity

## Intent

Remediar quirúrgicamente el drift de paridad contractual entre `schemas/kernel/result-envelope/v1/envelope.schema.json` y los validadores de runtime en JavaScript (`scripts/lib/result-envelope.js`) y Go (`internal/resultenvelope/resultenvelope.go`), asegurar conformidad diferencial exacta (`schema.valid === js.valid === go.valid`) sobre una matriz compartida de fixtures, y corregir el estado de CX1 en el roadmap evolutivo.

## Scope

### In Scope
- **Regla condicional en schema**: Exigir `question_gate` cuando `status == "blocked"` mediante `if/then` en `envelope.schema.json` v1.
- **Restricción minLength**: Aplicar `minLength: 1` a campos de texto obligatorios en `question_gate` (`reason`, `header`, `question`, `label`) y `assumptions` (`id`, `phase`, `statement`, `basis`).
- **Compatibilidad de schema raíz**: Replicar las restricciones en `schemas/kernel/result-envelope.schema.json`.
- **Fixtures negativos**: Incorporar fixtures en `schemas/kernel/result-envelope/v1/fixtures/invalid/` para `blocked` sin `question_gate`, strings vacíos en `question_gate` y strings vacíos en `assumptions`.
- **Conformidad diferencial unificada**: Suites en Node (`scripts/lib/result-envelope-conformance.test.js`) y Go (`internal/resultenvelope/conformance_test.go`) ejecutadas sobre la matriz compartida de fixtures.
- **Alineación de roadmap**: Actualizar `docs/roadmaps/harness-evolution.md` (línea 2048) marcando CX1 como implementado/archivado.

### Out of Scope
- Modificación de la lógica o reglas de proyección en `PhaseCompletionReducer`.
- Cambios en el enum o semántica de `verify_outcome`.
- Alteraciones en el adaptador legacy `adaptLegacyEnvelope()` o su fallback en hooks.
- Modificaciones al comportamiento fail-closed de señales de ambigüedad en `sdd-spec`.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `kernel-contract-schemas`: Actualiza REQ-kernel-contract-schemas-031 para formalizar la regla condicional de `question_gate` en `status: blocked`, `minLength: 1` en campos de texto, fixtures negativos dedicados y paridad diferencial estricta.
- `skills`: Actualiza REQ-skills-018 para estipular conformidad diferencial automatizada entre JSON Schema, JS y Go sobre la matriz compartida de fixtures.

## Approach

1. **Hardening de Schemas**: Añadir bloque condicional `if/then` para `question_gate` ante `status: "blocked"` y `minLength: 1` en propiedades obligatorias de texto en `envelope.schema.json` v1 y en `schemas/kernel/result-envelope.schema.json`.
2. **Matriz de Fixtures**: Crear fixtures negativos específicos para validar las nuevas restricciones de validación.
3. **Conformidad Diferencial**: Construir runners de prueba en Node y Go que iteren sobre cada fixture (válido e inválido) comprobando paridad triple: `schema.valid == js.valid == go.valid`.
4. **Actualización de Roadmap**: Corregir la tabla CX en `docs/roadmaps/harness-evolution.md` reflejando el estado archivado de CX1.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `schemas/kernel/result-envelope/v1/envelope.schema.json` | Modified | Regla condicional `blocked -> question_gate` y `minLength: 1` en strings obligatorios |
| `schemas/kernel/result-envelope.schema.json` | Modified | Compatibilidad canónica idéntica a v1 |
| `schemas/kernel/result-envelope/v1/fixtures/invalid/` | New | Fixtures negativos para `blocked` sin gate y strings vacíos |
| `scripts/lib/result-envelope-conformance.test.js` | New | Suite de conformidad diferencial en Node.js |
| `internal/resultenvelope/conformance_test.go` | New | Suite de conformidad diferencial en Go |
| `docs/roadmaps/harness-evolution.md` | Modified | Marcación de CX1 como archivado en tabla de evolución |
| `openspec/specs/kernel-contract-schemas/spec.md` | Modified | Actualización de REQ-kernel-contract-schemas-031 |
| `openspec/specs/skills/spec.md` | Modified | Actualización de REQ-skills-018 |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Incompatibilidad de schemas con draft-2020-12 | Low | Validación explícita de metasschema mediante `kernel-schema-validator.js` |
| Divergencia entre validadores de runtime y schema | Low | Suite de conformidad diferencial ejecutada en CI en ambos lenguajes |
| Fixtures existentes rotos por `minLength: 1` | Low | Inspección y confirmación previa de fixtures válidos existentes |

## Rollback Plan

Revertir los commits del cambio mediante `git revert`. Al tratarse de adición de restricciones de validación y pruebas de conformidad sin alteraciones en almacenamiento persistente ni reductor, la reversión es inmediata e inocua.

## Dependencies

- Node.js runtime (`node --test`)
- Go toolchain (`go test`)

## Success Criteria

- [ ] `schemas/kernel/result-envelope/v1/envelope.schema.json` rechaza payloads `blocked` sin `question_gate` y strings vacíos en campos obligatorios.
- [ ] `schemas/kernel/result-envelope.schema.json` mantiene compatibilidad idéntica con v1.
- [ ] Fixtures negativos específicos creados y verificados.
- [ ] Pruebas diferenciales en JS y Go confirman paridad absoluta sobre toda la matriz de fixtures.
- [ ] `docs/roadmaps/harness-evolution.md` refleja CX1 como completado/archivado.
- [ ] Reducer, fallback legacy y validación `sdd-spec` permanecen inalterados.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
