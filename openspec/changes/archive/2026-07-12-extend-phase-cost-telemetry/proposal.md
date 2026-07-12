# Proposal: Telemetría de coste por dispatch (O1)

## Intent

C3 conserva el tamaño estimado del resultado. O1 separa instrucciones, artefactos,
tool-output y respuesta, además de duración, tier, estado y relanzamientos, con paridad
JS/Go, para que `archive-report` indique qué parte del flujo optimizar.

## Scope

### In Scope
- Una fila por dispatch `sdd-*` con `phase`, `agent`,
  `estimated_prompt_tokens`, `estimated_artifact_tokens`,
  `estimated_tool_output_tokens`, `estimated_output_tokens`, `duration_ms`,
  `model_tier`, `status`, `relaunch` y timestamp.
- Fallbacks seguros, fail-safe de `SubagentStop`, writers/fixtures JS/Go en paridad y
  cobertura TDD de estados/relanzamientos.
- Bloque `Cost` agregado por fase: invocaciones, relanzamientos, duración, tier/estado y
  las cuatro categorías de tokens; datos faltantes no bloquean archive.

### Out of Scope
- O2 (benchmark/suite de changes de referencia), comparativas antes/después y dashboard.
- Tokenización exacta, facturación, base de datos o servicio externo.
- `sdd-plan`, routing dinámico de modelos, resto de la Fase O, `token-events.jsonl` y
  umbrales del Token Budget Advisor.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `hooks`: ampliar `SubagentStop` y la paridad de `phase-costs.jsonl`.
- `agents`: ampliar el bloque `Cost` de `archive-report` sin alterar close-gates.

## Approach

Extender `persistPhaseCost`/`AppendPhaseCost` con un contexto normalizado, conservando
selección de change, lock advisory y aislamiento de errores. `sdd-design` fijará
adaptadores/fallbacks para payloads host-específicos, tier y duración. El archive tolerará
filas C3 antiguas o incompletas sin migración. Fixtures compartidos cubrirán UTF-8 y
reportes poblado/vacío.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/hooks/subagent-stop.js`, `internal/hooks/subagentstop.go` | Modified | Registro ampliado y paridad. |
| `scripts/lib/ospec-state.js`, `internal/store/store.go` | Modified | Writer/layout JSONL. |
| `skills/sdd-archive/SKILL.md` | Modified | Agregación y render de `Cost`. |
| `scripts/hooks/*test.js`, `internal/hooks/*test.go`, `internal/testdata/parity/`, `openspec/specs/{hooks,agents}/spec.md` | Modified | Tests, fixtures y deltas. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Hosts no exponen igual contexto o tier. | High | Adaptadores y `unknown`/cero documentado. |
| Divergencia JS/Go o metering mal interpretado. | Med | Shape único, paridad ejecutable y etiqueta `estimated`. |

## Rollback Plan

Revertir writers, agregación, contratos y tests. No hay migración: el JSONL en
`.ospec/session/` es descartable.

## Dependencies

- C3 archivado, specs baseline `hooks`/`agents` y tiers de `models.yaml`.
- Strict TDD: `npm test` y `go test ./...`.

## Success Criteria

- [ ] Cada dispatch `sdd-*` produce el shape completo o fallbacks explícitos en JS y Go.
- [ ] Tokens, duración, tier, status y relaunch son separables y agregables por fase.
- [ ] `archive-report.md` muestra coste separado, invocaciones y relanzamientos sin gatear por ausencia.
- [ ] Tests y fixtures verifican paridad y fail-safe.

**Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST.
