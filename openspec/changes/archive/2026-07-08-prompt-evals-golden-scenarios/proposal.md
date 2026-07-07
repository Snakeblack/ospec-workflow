# Proposal: Evals golden de comportamiento del orquestador

## Intent

Hoy la fiabilidad del orquestador ante gates, blockers y routing solo se valida a mano o de forma implícita en tests unitarios de scripts sueltos (`route-dispatcher.js`, `validate-phase.js`). No hay evidencia objetiva end-to-end de que las rutas documentadas en `agents/sdd-orchestrator.agent.md` (intent restatement, clarify/classification, Failure & Blocker Routing, Document Route Handler) produzcan los artefactos/`state.yaml` esperados. Sin esa red, subir el modelo en `models.yaml` es un acto de fe. Este change (roadmap 2.1 / E2) agrega una suite de evals golden de COMPORTAMIENTO del orquestador contra repos fixture.

## Scope

### In Scope
- Suite de 6-10 escenarios golden como datos versionados (fixture repo + petición + decisión esperada), reutilizando el patrón `__fixtures__/` existente.
- Escenarios orquestador-core: petición vaga → intent restatement (sin artefacto); high-risk → standard/clarify; verify FAIL `spec-gap` → ruta a `sdd-spec`; apply `design-mismatch` → `blocked` a `sdd-design`.
- Escenarios `sdd-document` (J2): petición de doc → gate batcheado idioma+scope (un solo `question_gate`, 2 preguntas); update sin cambios → no-op; write fuera de sandbox → `blocked` `design-mismatch`.
- Runner + librería de aserciones que corre cada escenario y valida artefactos/`state.yaml`/`blocker_type`/ruta, NO prosa.
- Documentación de cómo correr la suite y su rol como gate previo a subir `models.yaml`.

### Out of Scope
- Modo headless/CI, GitHub Action y subconjunto no-interactivo por CLI (roadmap 2.2 / B4, change posterior).
- Reimplementar cobertura unitaria ya existente de scripts individuales.

## Capabilities

### New Capabilities
- `orchestrator-evals`: suite golden de evals de comportamiento del orquestador (routing, gates, blockers) contra repos fixture, con aserciones estructurales sobre artefactos y `state.yaml`.

### Modified Capabilities
- None.

## Approach

Dos capas: (1) escenarios como datos (fixture repo + input + expectativa estructural); (2) un harness que ejerce el orquestador contra el fixture, captura los artefactos/`state.yaml` producidos y afirma solo campos estables entre modelos (ruta elegida, `blocker_type`, existencia/ausencia de archivos, campos de `state.yaml`, forma del `question_gate`). Foco end-to-end del orquestador, no internals de scripts. Para 2.1 el runner es ejecutable localmente/manual contra un modelo; el cableado headless/CI queda para 2.2.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/evals/` (nuevo) | New | Runner, librería de aserciones y escenarios golden |
| `scripts/evals/__fixtures__/` (nuevo) | New | Repos fixture por escenario |
| `models.yaml` | Modified | Comentario que referencia el gate de evals antes de subir versión |
| `analisis-fino/roadmap-evolucion-harness.md` | Modified | Marcar 2.1 al archivar |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Modelo en el loop: no determinismo, costo, API keys | High | Aserciones solo estructurales/tolerantes; ejecución manual en 2.1; CI en 2.2 |
| Duplicar tests unitarios existentes | Med | Afirmar comportamiento end-to-end del orquestador, no internals de scripts |
| Deriva fixture vs. prompt del orquestador | Med | Escenarios anclados a rutas documentadas; actualizar junto al agent md |
| Modelo de ejecución del harness (runner live vs. replay de transcript) ambiguo | Med | Decisión abierta para sdd-design; ambos son compatibles con el contrato de aserciones |

## Rollback Plan

Todo el entregable es aditivo bajo `scripts/evals/` más un comentario en `models.yaml`. Rollback = revertir el commit/PR; no afecta rutas del orquestador ni el pipeline SDD en producción.

## Dependencies

- `models.yaml` (ya existe en la raíz, tiers premium/default/cheap).
- `agents/sdd-orchestrator.agent.md` y `skills/_shared/route-document.md` como fuente de verdad de las rutas evaluadas.

## Success Criteria

- [ ] 6-10 escenarios golden implementados: 4 orquestador-core (vaga→restatement, high-risk→clarify, verify FAIL spec-gap→sdd-spec, apply design-mismatch→blocked) + 3 `sdd-document` (gate batcheado idioma+scope, update no-op, write fuera de sandbox→blocked design-mismatch).
- [ ] Todas las aserciones son sobre artefactos/`state.yaml`/`blocker_type`/ruta/forma de gate, NO sobre prosa (estables entre modelos).
- [ ] La suite es ejecutable y produce un reporte pass/fail por escenario.
- [ ] Criterio de negocio: la suite habilita subir la versión en `models.yaml` con evidencia objetiva de no-regresión del comportamiento de orquestación.
