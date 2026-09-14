# Proposal: Remediate CX1 Envelope Projection Findings

## Intent

Remediar quirúrgicamente los tres hallazgos contractuales identificados en v2.67.0 relativos al slice CX1 de proyección mecánica de envelopes:
1. Conectar el fallback legacy en `SubagentStop` (`persistResultEnvelope`) para delegar el resultado/transcripción sin fence canónico a `adaptLegacyEnvelope()`, manteniendo `sdd-spec` fail-closed ante omisión de señales de ambigüedad.
2. Definir un `verify_outcome` canónico y phase-aware (`PASS`, `PASS WITH WARNINGS`, `FAIL`) en `result-envelope/v1`, actualizar `sdd-verify` para emitirlo obligatoriamente, y condicionar la marcación de `verified` en `PhaseCompletionReducer` a dicho veredicto explícito (`FAIL` o ausente proyecta `blocked`).
3. Asegurar paridad estricta entre `schemas/kernel/result-envelope/v1/envelope.schema.json` y los validadores JS (`result-envelope.js`) y Go (`resultenvelope.go`) en tipos de elementos, enums y estructura de gates.

## Scope

### In Scope
- **SubagentStop Legacy Fallback**: En `persistResultEnvelope` (JS y Go), entregar raw result/transcript a `adaptLegacyEnvelope()` si no se detecta fence canónico; mantener validación fail-closed de `sdd-spec`.
- **Verify Outcome Contract**: Añadir `verify_outcome` a `result-envelope/v1`, actualizar `skills/sdd-verify/SKILL.md` para exigirlo, y hacer que `PhaseCompletionReducer` requiera `PASS` o `PASS WITH WARNINGS` para proyectar `verified`.
- **Schema & Validator Parity**: Incorporar `verify_outcome`, validación de elementos string en `artifacts` y `risks`, enum de `skill_resolution`, estructura de `question_gate` y chequeo de `schema_version == 1` en Go.
- **Integration & Acceptance Tests**: Pruebas de integración y frontera en JS y Go para cada caso.

### Out of Scope
- Rediseño arquitectónico del reductor o alteración de autoridad de approvals, gates o assumptions.
- Modificación de fases del flujo SDD previas o ajenas a CX1.
- Cambios no retrocompatibles en el formato de `state.yaml` o eventos de runtime.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `hooks`: `SubagentStop` delega a `adaptLegacyEnvelope` cuando falta fence canónico, manteniendo `sdd-spec` fail-closed ante ausencia de señales de ambigüedad.
- `lifecycle-kernel-runtime`: `PhaseCompletionReducer` requiere `verify_outcome` positivo explícito para proyectar `status: verified`; `FAIL` o ausencia proyecta `blocked`.
- `kernel-contract-schemas`: `result-envelope/v1` define `verify_outcome`, valida tipos de elementos en `artifacts`/`risks`, enum de `skill_resolution` y estructura de `question_gate`.
- `skills`: `sdd-verify` emite `verify_outcome` obligatoriamente; validadores JS y Go logran paridad estricta con el JSON Schema v1.

## Approach

1. **Schema & Validators**: Actualizar `envelope.schema.json` y alinear `scripts/lib/result-envelope.js` e `internal/resultenvelope/resultenvelope.go` con reglas idénticas para `verify_outcome`, items de `artifacts`/`risks`, enum de `skill_resolution` y validación de `question_gate` y `schema_version`.
2. **PhaseCompletionReducer**: Exigir `verify_outcome` (`PASS` o `PASS WITH WARNINGS`) para marcar `verified`; proyectar `blocked` ante `FAIL`, valor ausente o inválido.
3. **SubagentStop Hook**: Extender `persistResultEnvelope` en JS y Go para pasar input/transcript a `adaptLegacyEnvelope()` ante ausencia de fence canónico, validando con contexto de fase.
4. **Skill Contract**: Documentar en `skills/sdd-verify/SKILL.md` la emisión obligatoria de `verify_outcome`.
5. **Pruebas**: Añadir tests de integración y frontera en Node.js y Go.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `schemas/kernel/result-envelope/v1/envelope.schema.json` | Modified | Añadir `verify_outcome`, tipo de items en arrays, enum `skill_resolution`, schema de `question_gate` |
| `scripts/lib/result-envelope.js` | Modified | Paridad estricta en arrays, enums y `question_gate` |
| `internal/resultenvelope/resultenvelope.go` | Modified | Paridad con schema: `schema_version == 1`, enums, arrays, `question_gate` |
| `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` | Modified | Gating estricto de `verify_outcome` para avanzar a `verified` |
| `scripts/hooks/subagent-stop.js` | Modified | Conexión de fallback legacy a `adaptLegacyEnvelope` con raw input/transcript |
| `internal/hooks/subagentstop.go` | Modified | Conexión de fallback legacy en Go |
| `skills/sdd-verify/SKILL.md` | Modified | Emisión obligatoria de `verify_outcome` |
| `scripts/**/*.test.js`, `internal/**/*_test.go` | Modified | Tests de integración y aceptación de frontera |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Envelopes legacy rechazados por validación estricta | Low | `adaptLegacyEnvelope` normaliza los campos antes de validar con el schema |
| Falsos bloqueos en fases verify sin `verify_outcome` | Low | Actualización coordinada de skill, schema y reducer con pruebas de regresión |
| Desalineación entre validadores JS y Go | Low | Pruebas de paridad automatizadas con fixtures idénticos |

## Rollback Plan

Revertir los commits del cambio (`git revert`), regresando validadores, hook y reducer a la línea base v2.67.0. No se introducen esquemas de base de datos ni mutaciones destructivas persistentes.

## Dependencies

- Node.js native test runner (`node --test`)
- Go toolchain (`go test`)

## Success Criteria

- [ ] `SubagentStop` proyecta envelopes legacy sin fence mediante `adaptLegacyEnvelope` en JS y Go.
- [ ] `SubagentStop` mantiene rechazo fail-closed en `sdd-spec` ante ausencia de señales de ambigüedad.
- [ ] `PhaseCompletionReducer` marca `verified` únicamente con `verify_outcome` en `PASS` o `PASS WITH WARNINGS`; `FAIL` o ausencia proyecta `blocked`.
- [ ] Validadores JS y Go rechazan arrays con tipos no-string, enums inválidos y `schema_version != 1`.
- [ ] Todas las suites de tests en JS y Go pasan (`npm test` y `go test ./...`).

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
