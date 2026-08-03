# Proposal: K1 — Contract Suite, Vocabulario y Clasificación

## Intent

O2B fijó el control `fixed`. Sin schemas versionados, clasificación explicable ni
paridad de superficies, K2 no puede implementar un kernel `status → next_transition`
sin inventar vocabulario. K1 materializa el canon de autoridad, la contract suite
y la clasificación por evidencia (P0/P4/P19; O13A; O19A; bases O20A) para que
ninguna operación de autoridad caiga a prosa.

## Scope

### In Scope
- Canon de autoridad y lifecycle (OpenSpec/Git; Graph IR no autoridad independiente).
- Schemas versionados (`$id`/versión) para: state/transition, classification,
  contract, graph/node, work order/result, candidate, evidence, verification,
  finding/review, failure/recovery, receipt, event.
- Clasificación por riesgo, incertidumbre y ejecución con fingerprint y `reasons`
  estables; hard floors por evidencia de impacto (migración, auth, API pública,
  Repair, Direct) — no por LOC/archivos.
- Shape `next_transition`: `kind`, `operation`, `arguments[].token`; `command`
  obligatorio si `kind=execute`; `collect` no inventa comandos.
- Paridad material proyección humana ↔ envelope negociado (código, causa, acción).
- Aliases versionados de códigos actuales; fixtures válidos/inválidos; CI que
  rechaza docs/contratos que nombren campos/comandos no emitidos por código.
- Docs con etiquetas `implemented` / `target` / `experimental`.

### Out of Scope
- Ejecutar rutas adaptativas; cambiar fixed/defaults; elegir runtime nuevo.
- Convertir Graph IR en autoridad; implementar reducer/runtime de lifecycle (K2).
- Umbrales exactos de rutas más allá de hard floors iniciales; journal/firmas.

## Capabilities

### New Capabilities
- `harness-authority-canon`: autoridad, lifecycle vocabulary, madurez
  implemented/target/experimental, rechazo de fallback de autoridad a prosa.
- `kernel-contract-schemas`: suite versionada de schemas + fixtures + aliases +
  migration rules que preservan tags existentes.
- `change-classification`: perfil riesgo/incertidumbre/ejecución, fingerprint,
  `reasons`, hard floors no degradables por tamaño.
- `transition-surface-parity`: shape `next_transition` (`execute|collect|decide|stop`)
  y paridad discriminantes humanos ↔ envelope negociado.

### Modified Capabilities
- `contract-lint`: checkers CI que rechazan incompatibilidades schema/doc,
  campos/comandos no emitidos por código, y fallback de autoridad a prosa.

## Approach

Definir JSON Schema versionados con `$id`, fixtures válidos/inválidos y
migraciones/aliases sobre códigos actuales. Validadores puros en `scripts/lib/`
integrados al aggregator de `contract-lint`/`scripts/check.js`. Clasificador
determinista (fingerprint + reasons + hard floors) sin alterar defaults de
routing. Ejemplos de `next_transition` y fixtures de paridad generados/validados
contra el mismo emitter. Documentar madurez sin promover Graph IR a autoridad.
Shapes de graph/node/work-order quedan como contratos consumibles por K2–K4;
no se ejecuta el reducer.

**Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be
created following the `<tipo>/<descripción>` convention (e.g.
`git checkout -b feat/k1-contract-suite main`).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `schemas/` (o árbol equivalente) | New | Schemas `$id`/versión + fixtures. |
| `scripts/lib/` | New/Modified | Validadores, fingerprint, aliases, parity. |
| `scripts/check.js` / contract-lint | Modified | Checkers de emisión y autoridad. |
| `docs/architecture/harness-evolution.md` | Modified | Etiquetas de madurez y vocabulario. |
| `openspec/specs/contract-lint/` | Modified | Delta de enforcement CI. |
| `openspec/changes/.../specs/{new}/` | New | Specs change-local de las cuatro capacidades. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Scope creep hacia reducer K2 | Med | Out-of-scope explícito; solo shapes/fixtures. |
| Rotura de códigos/tags legacy | High | Aliases versionados + migration rules + fixtures. |
| Schemas sin enforcement real | Med | CI fail-closed vía contract-lint. |
| Confundir Graph IR con autoridad | Med | Canon + docs maturity; tests de no-autoridad. |
| Diff size grande (>400 LOC) | High | `delivery_strategy: exception-ok`; slices en tasks. |

## Rollback Plan

1. Revertir el commit/PR de schemas, validadores y checkers CI.
2. Desregistrar checkers nuevos del aggregator `contract-lint` (lint previo verde).
3. Conservar aliases/docs de madurez solo si son no-normativos; si no, revertir.
4. No tocar baseline fixed O2B ni defaults de routing.
5. Si partial-merge: dejar schemas experimental sin pin de consumidores.

## Dependencies

- O2B (`fixed-policy-reference-baseline`) completado — control fixed intacto.
- Absorbe/rebasa: P0, P4, P19; O13A; O19A; foundations O20A.
- Bloquea: K2 (lifecycle reducer/runtime).

## Success Criteria

- [ ] Todos los schemas tienen `$id`/versión y fixtures válidos/inválidos.
- [ ] CI rechaza incompatibilidades y fallback de autoridad a prosa.
- [ ] Misma clasificación → fingerprint y `reasons` estables.
- [ ] Hard floors no degradan por LOC/archivo; cubren migración, auth, API
      pública, Repair y Direct.
- [ ] `execute` exige `command` + tokens; `collect` no inventa comando.
- [ ] Fixtures de paridad recuperan los mismos discriminantes en ambas superficies.
- [ ] Migration rules preservan tags existentes.
- [ ] Docs distinguen implemented / target / experimental.
