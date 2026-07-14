# Proposal: Suite de changes de referencia / benchmark (O2)

## Intent

Entregar y cerrar una infraestructura de benchmark verificable localmente para medir
el rendimiento y la tasa de defectos del flujo SDD. La ejecución live del piloto core
y la publicación de una baseline comparable quedan como seguimiento operativo no
bloqueante: cuando se realicen, la baseline solo podrá publicarse con el conjunto core
completo y compatible, nunca con datos inventados o incompletos.

## Scope

### In Scope
- Catálogo canónico embebido en `scripts/evals/safe-export.js` con nueve perfiles:
  docs-one-file, small-bugfix, small-feature, cross-module-feature,
  behavior-preserving-refactor, public-api-change, filesystem-sensitive-change,
  security-sensitive-change y migration-change.
- Materialización derivada de repositorios sintéticos aislados, inputs, rutas y
  resultados estructurales esperados; los directorios `__fixtures__/benchmark/` no son
  fuente de autoridad.
- Runner, guards, scoring run-level, identidad fuerte de cache, recuperación y
  publicación atómica implementados y cubiertos por pruebas locales.
- Piloto core live de seguimiento: docs-one-file, small-bugfix y
  security-sensitive-change. Su ejecución no bloquea verify ni archive de esta
  infraestructura. La suite ampliada de nueve perfiles es opcional.
- Captura run-level de tokens terminales, duración total del host, artefactos,
  preguntas y defectos de verify/4R, sin atribución heurística por fase.
- Baseline experimental atómica únicamente tras aceptar un conjunto comparable 3/3;
  mientras falte cualquier perfil debe permanecer ausente. O1 es evidencia
  suplementaria y su ausencia o invalidez no bloquea métricas run-level.
- Conservación de la observación aceptada de Sol y de la observación rechazada de
  Luna-low como diagnósticos no comparables, excluidos de la baseline.
- Cache resumible que solo reutiliza resultados cuando instalación, modelo remoto,
  CLI, runtime, worktree, git, perfil y payload tienen identidades fuertes coincidentes.
- Extensión del runner de evals en `scripts/evals/` para soportar la ejecución y recolección de métricas de la suite de benchmark.

### Out of Scope
- Implementación de la fase `sdd-plan` (O7) o la ruta `standard-optimized` (O8).
- Ejecución automatizada obligatoria en cada push de CI (se mantiene local/manual, delegando CI a R1).
- Optimización de modelos o prompts de agentes en esta fase.
- Autenticidad criptográfica frente a un productor malicioso; el threat model es un
  orquestador cooperativo y los hashes detectan corrupción o manipulación posterior.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- orchestrator-evals: Extender el corpus de escenarios y el reporte de aserciones estructurales para incorporar la suite de cambios de referencia y la captura de telemetría de ejecución (tokens, tiempo, preguntas y defectos).

## Approach

`scripts/evals/safe-export.js` define y deriva el catálogo sintético canónico. El runner
y sus guards puntúan evidencia run-level real, conservan el stream terminal y la
duración del proceso, adjuntan O1 solo cuando es válido y recuperan resultados solo con
identidades fuertes compatibles. La infraestructura se verifica localmente sin exigir
una ejecución live para su cierre. En el seguimiento operativo, el runner publicará la
baseline solo tras 3/3 perfiles core comparables; Sol y Luna-low se conservarán como
diagnósticos excluidos. Los nueve perfiles siguen seleccionables como suite `extended`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/evals/` | Modified | Extensión del runner para ejecutar e informar la suite de benchmark. |
| `scripts/evals/safe-export.js` | New | Catálogo canónico y materialización derivada de nueve perfiles sintéticos. |
| `scripts/evals/live-driver.js` | New | Ejecución live, evidencia run-level, cache fuerte y publicación atómica. |
| `openspec/specs/orchestrator-evals/spec.md` | Modified | Delta de especificación para incorporar los nuevos requisitos de benchmark. |
| `docs/roadmap.md` / `analisis-fino/roadmap-evolucion-harness.md` | Modified | Registro del estado de avance de O2. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Costo de ejecución de la suite completa con modelos premium. | Med | Diferir el piloto live como seguimiento operativo y mantener la suite ampliada opcional. |
| Variabilidad en la duración debido a latencia de red/API. | High | Registrar condiciones e identidades de ejecución y comparar métricas run-level equivalentes. |
| No determinismo en la generación de preguntas o defectos. | Med | Usar las aserciones estructurales definidas en `REQ-orchestrator-evals-002`. |
| Reutilización de resultados incompatibles. | Med | Cache hit solo con todas las identidades fuertes conocidas y coincidentes. |

## Rollback Plan

Revertir los archivos de benchmark bajo `scripts/evals/` y eliminar cualquier
baseline/cache experimental que pudiera haberse publicado posteriormente. La suite es
aditiva y no altera la lógica de producción del orquestador.

## Dependencies

- Uso terminal y duración total observables por el host; O1 por fase es opcional y no bloqueante.
- Runner de `orchestrator-evals` existente.

## Success Criteria

- [ ] Catálogo, runner, guards, scoring run-level, cache, identidad, recuperación y publicación atómica implementados y cubiertos por pruebas locales.
- [ ] La publicación falla de forma cerrada: una baseline incompleta, incompatible, fabricada o replayed permanece ausente.
- [ ] El runner puede ejecutar manualmente el piloto core y la suite `extended` cuando se solicite el seguimiento operativo.

## Operational Follow-up (Non-Blocking)

- Ejecutar live los tres perfiles core cuando exista un host compatible y presupuesto operativo.
- Publicar una baseline experimental solo si los tres resultados son comparables y
  aceptados; no sintetizar filas ni promover las observaciones diagnósticas de Sol o
  Luna-low.
- Ejecutar la suite `extended` únicamente cuando se necesite ampliar la comparación.
