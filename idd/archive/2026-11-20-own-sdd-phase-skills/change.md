# own-sdd-phase-skills

## Intent and acceptance

Versiones propias de las skills de fase de SDD que conservan texto de gentle-ai (E1.105), primer cambio del reparto

Acceptance: Los ficheros de este cambio no conservan líneas de 30 o más caracteres idénticas a ninguna versión del historial git de gentle-ai, salvo literales sin contenido o de interfaz que el usuario acepte; los tests de contrato de cada fase siguen pasando; NOTICE y metadata.author dejan de nombrar a gentle-ai en esas skills; el roadmap coloca E1.105 y E1.106 por delante de E1.79; node scripts/check.js pasa

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-20T00:13:26.838Z):

> continua (siguiente del roadmap: E1.105 own-sdd-phase-skills)

Answer 1 — open-facts, user, 2026-11-20T00:18:34.607Z:

> todas las recomendadas, pero quiero que este punto del roadmap tenga prs encadenadas las recomendadas, pero los merges de las pr encadenadas y release se haga cuando termine todo (recomendadas: (1) E1.105 va antes que E1.106; (2) cinco cambios: explore+propose+spec, design+tasks, verify con strict-tdd-verify y report-format, init+onboard+archive+clarify, _shared+orquestador+frases de sdd-baseline y sdd-reconcile; (3) por debajo del 50 % solo los pasajes que coinciden, por encima reescritura entera; (4) los campos del pronóstico de review de sdd-tasks se conservan como literales de interfaz)
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `NOTICE`, `docs/roadmaps/harness-evolution.md`, `skills/sdd-explore/SKILL.md`, `skills/sdd-propose/SKILL.md`, `skills/sdd-spec/SKILL.md`
- Work units: 2
<!-- ospec:plan:end -->

Medida de texto de terceros. `node scripts/third-party-overlap.js --source <clon de gentle-ai> skills/sdd-explore skills/sdd-propose skills/sdd-spec`: antes 191 de 270 líneas largas idénticas (90 %, 64 % y 67 %); después 4 de 270, el campo `disable-model-invocation: true` del frontmatter de cada skill y la ruta `openspec/changes/{change-name}/` del árbol de sdd-spec. Siguen con texto de gentle-ai las skills de los otros cuatro cambios de E1.105 y las de E1.106, que `NOTICE` sigue listando.

## Decisions

<!-- ospec:decisions:start -->
- E1.105 se reparte en cinco cambios (explore, propose y spec; design y tasks; verify con sus módulos; init, onboard, archive y clarify; _shared, el orquestador y las frases de sdd-baseline y sdd-reconcile), entregados como una cadena feature-branch-chain de cinco PR sobre una rama de seguimiento; las fusiones y una sola release van al final, por decisión del usuario
- Un fichero con el 50 % o más de líneas largas de gentle-ai se reescribe entero; por debajo, solo los pasajes que coinciden y lo que haga falta alrededor para que se lean bien
- Los nombres de los campos del pronóstico de review de sdd-tasks (Decision needed before apply, Chained PRs recommended, Chain strategy, 400-line budget risk) se conservan como literales de interfaz: los leen sdd-apply, el orquestador, la documentación y estados ya escritos
- Las plantillas de artefacto (exploration.md, proposal.md, proposal-lite.md y las specs delta y completas) conservan los encabezados que leen las demás fases y el archivado (Capabilities, AC-N, ADDED, MODIFIED y REMOVED Requirements, Requirement y Scenario, Previously); cambian sus marcadores y la prosa que las rodea
- La plantilla delta de sdd-spec muestra el id en el encabezado de una requirement modificada, como ya pedía la regla de copiar el bloque entero con su id; la de una requirement eliminada y la spec completa de un dominio nuevo siguen sin id, como antes, para no cambiar lo que producen
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-20T00:27:20.964Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-11-20T00:27:20.964Z)
- ev-3: living-doc-current for living-doc (2026-11-20T00:27:46.415Z)
<!-- ospec:evidence:end -->
