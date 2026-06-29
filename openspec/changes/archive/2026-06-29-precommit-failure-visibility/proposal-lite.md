# Proposal Lite: Visibilidad de fallos en git hooks pre-commit

## Change Class

small

## Intent

Cuando `pre-commit` bloquea un commit, el motivo del rechazo queda enterrado al
final de miles de líneas de output de éxito: `pre-commit-hook.js::runPreCommit`
ejecuta `scripts/check.js` con `stdio: "inherit"`, y `check.js` corre la suite
nativa de tests (`node --test scripts/**/*.test.js`) más pasos de generación,
volcando todo el TAP a la terminal. Un humano o un agente tiene que reproducir el
commit y leer logs para descubrir la causa. Queremos fail-fast con el motivo del
bloqueo DESTACADO y resumido (banner final inequívoco), sin cambiar QUÉ se valida.

## Boundaries

- In scope: `scripts/hooks/pre-commit-hook.js` y sus tests; ajustes de reporte en
  `scripts/hooks/commit-msg-hook.js` si hace falta consistencia de banner; el
  instalador/wrapper `scripts/setup-git-hooks.js` solo si el cambio de reporte lo
  requiere. Capturar el output de éxito (`stdio: pipe`) y mostrarlo solo en fallo,
  con un banner `===` final claramente identificable que cite el motivo.
- Out of scope: cambiar la lógica de validación de `check.js`, qué reglas se
  evalúan, la regex de atribución, o el ciclo Strict TDD. Sin cambios de contrato.

## Affected Areas

| Area | Impact | Notes |
|------|--------|-------|
| `scripts/hooks/pre-commit-hook.js` | Modify | `spawnSync` de check.js a `stdio: "pipe"`; en fallo imprimir banner + output capturado; en éxito, una línea breve |
| `scripts/hooks/pre-commit-hook.test.js` | Modify | Tests RED→GREEN: banner en fallo, silencio en éxito, bypass intacto |
| `scripts/hooks/commit-msg-hook.js` | Modify (opcional) | Alinear formato de banner si aporta consistencia |
| `scripts/setup-git-hooks.js` | Modify (opcional) | Solo si el wrapper necesita ajuste de invocación |

## Acceptance Checks

- [ ] En fallo de `check.js`, el motivo aparece en un banner `===` final inequívoco; el output ruidoso de éxito NO se vuelca cuando todo pasa.
- [ ] `DISABLE_OSPEC_PRECOMMIT=true`, `DISABLE_OSPEC_ATTRIBUTION_CHECK=true` y `git commit --no-verify` siguen funcionando idénticos.
- [ ] `node scripts/check.js` (suite de tests) pasa en verde.

## Enfoque (tradeoffs)

- Opción A (recomendada): capturar output con `stdio: "pipe"`, bufferizar, y
  emitirlo solo en fallo precedido de banner. Máxima señal/ruido; coste: en fallo
  ya no hay streaming en vivo (se ve todo de golpe al final, que es lo deseado).
- Opción B: mantener `stdio: "inherit"` y solo añadir banner final. Menos invasiva,
  pero el motivo real de `check.js` sigue sepultado entre el ruido de éxito.

## Risks and Rollback

- Risk: Low — capturar output puede ocultar progreso en corridas largas; se mitiga
  con una línea de "ejecutando validación..." y volcado completo en fallo.
- Rollback: revertir el commit; el cambio está aislado en `scripts/hooks/` sin tocar
  contratos ni la lógica de validación.
