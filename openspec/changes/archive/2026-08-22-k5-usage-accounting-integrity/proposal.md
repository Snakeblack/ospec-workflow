# Proposal: K5 Usage Accounting Integrity

## Intent

Cerrar la integridad contable de K5 antes de habilitar K6a. `ExecutionUsage` debe descontarse una vez por ejecución física; ningún replay puede fabricar consumo.

## Scope

### In Scope
- Aplicar usage nuevo al estado ganador o conservarlo como carry-over en toda salida post-effect sin CAS confirmado.
- Separar ejecución nueva de replay histórico; eliminar fallback a `args` y fallar cerrado si falta usage exigible.
- Impedir que una escritura obsoleta degrade un journal `completed`.
- Mantener zero-delta para `repair` sin progreso de efecto y reconciliar contrato, ADRs y evidencia.

### Out of Scope
- K6a, workers reales, trust boundary del executor e issuer async multi-proceso.
- Nuevas cuotas, dimensiones, permits o cambios causales.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `execution-budgets`: `ExecutionUsage` exhaustivo, exactamente-una-vez, fail-closed y zero-delta coherente.
- `lifecycle-kernel-runtime`: accounting post-effect y replay sin redébito.
- `authority-store`: journal monotónico y deduplicado por `effect_id`.
- `lifecycle-model-conformance`: invariantes alineados con runtime.

## Approach

Separar resultados ejecutados ahora de históricos reconciliados. Aplicar una única delta a `reduced.state` antes del CAS; transferirla a carry-over sólo si no queda confirmada. Los skips nunca aportan usage. El merge preservará `completed`; contrato y ADRs distinguirán `lifecycleProgress` de `effectProgress`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/lifecycle-kernel/index.js` | Modified | Accounting y retries. |
| `scripts/lib/{authority-store/index.js,lifecycle-kernel/memory-store.js,filesystem-store.js}` | Modified | Journal monotónico. |
| `scripts/**/*k5*.test.js`, `scripts/lib/**/*store*.test.js` | Modified | Regresión y E2E. |
| `openspec/specs/{execution-budgets,lifecycle-kernel-runtime,authority-store,lifecycle-model-conformance}/spec.md`, `docs/adr/**` | Modified | Contrato reconciliado. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Doble débito estado/carry-over | High | Delta única y pruebas multi-CAS. |
| Usage ausente | Medium | Error estable y migración de mocks. |

## Rollback Plan

Revertir el slice, conservar K5 en `REVISE` y K6a bloqueado; no hay migración irreversible.

## Dependencies

- Baseline K5 v2.45.13; `npm test` en strict TDD.

## Success Criteria

- [ ] CAS exitoso descuenta usage una vez.
- [ ] Salida post-effect conserva usage sin fallback.
- [ ] Dos conflictos CAS con una ejecución física no duplican consumo.
- [ ] Journal stale no degrada `completed`.
- [ ] Repair estéril mantiene dual zero-delta; contrato y ADRs coinciden.
- [ ] Tests focales y `npm test` pasan; K6a sigue bloqueado hasta verify.

**Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
