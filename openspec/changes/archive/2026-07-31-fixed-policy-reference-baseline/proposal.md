# Proposal: Baseline de referencia fixed-policy (O2B)

## Intent

Congelar el control para comparar adaptive. O2A entregó catálogo y runner; O2B
publica una baseline fija, completa y comparable de nueve perfiles, sin crear datos.

## Scope

### In Scope
- Ejecutar con policy `fixed` los nueve perfiles obligatorios: `docs-one-file`,
  `small-bugfix`, `small-feature`, `cross-module-feature`,
  `behavior-preserving-refactor`, `public-api-change`,
  `filesystem-sensitive-change`, `security-sensitive-change` y
  `migration-change`.
- Conservar smoke 3/3 y publicar solo con resultados 9/9 válidos y comparables.
- Exigir identidad conocida de harness, target, modelo y effort, provenance
  completa, comparabilidad y rechazo de resultados incompatibles.
- Medir calidad, coste/tokens, duración, preguntas y defectos de verify/4R;
  documentar `node scripts/evals/live-driver.js extended`.
- Prohibir filas inventadas o sintetizadas y cambios silenciosos por fixture drift.

### Out of Scope
- Policy adaptive, shadow mode o gate de promoción de adaptive.
- CI obligatorio, cambios de defaults del flujo o selección dinámica de modelos.
- Alterar golden scenarios o reclamar autenticidad criptográfica.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `orchestrator-evals`: Pasar del piloto core 3/3 a una baseline fixed-policy
  9/9 con identidad, provenance, comparabilidad, rechazo y métricas normativas.

## Approach

Extender el catálogo, driver y reporte de `scripts/evals/` para fijar la policy y
sellar cada resultado. El smoke conserva sus tres perfiles; `extended` publica la
única baseline cuando 9/9 validan. La publicación atómica falla cerrada ante una
fila ausente, incompatible o no verificable.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `scripts/evals/{live-driver.js,lib/benchmark.js}` | Modified | Policy, 9/9, identidad, métricas y publicación. |
| `scripts/evals/{safe-export.js,run.js,*.test.js}` | Modified | Perfiles, smoke y pruebas de rechazo/drift. |
| `scripts/evals/README.md` | Modified | Operación reproducible. |
| `openspec/specs/orchestrator-evals/spec.md` | Modified | Delta normativa. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Drift de identidad o fixture. | Med | Sellos por fila y rechazo fail-closed. |
| Resultado parcial parece baseline. | Med | Publicación atómica tras 9/9. |

## Rollback Plan

Revertir contrato, driver, reporte y documentación de O2B; retirar su baseline 9/9
si existe. O2A y el smoke 3/3 permanecen disponibles; no cambian defaults.

## Dependencies

- O6A, O2A y host/modelo con presupuesto live.

## Success Criteria

- [ ] Baseline versionada con 9/9 filas fixed-policy válidas y comparables.
- [ ] Cada fila acredita identidad conocida y provenance completa.
- [ ] Smoke 3/3 disponible y comando `extended` documentado.
- [ ] Datos incompatibles, incompletos, con drift o sintetizados se rechazan.
- [ ] Reporte de métricas sin mutación silenciosa.

**Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST.
