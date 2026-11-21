# own-sdd-shared-orchestrator

## Intent and acceptance

Versiones propias de las referencias de skills/_shared (SKILL.md, openspec-convention.md, persistence-contract.md, sdd-phase-common.md, skill-resolver.md), de agents/sdd-orchestrator.agent.md y de las frases de agents/sdd-baseline y sdd-reconcile, quinto y último cambio de E1.105

Acceptance: skills/_shared, agents/sdd-orchestrator.agent.md, agents/sdd-baseline.agent.md y agents/sdd-reconcile.agent.md no conservan líneas de 30 o más caracteres idénticas a ninguna versión del historial git de gentle-ai, salvo literales sin contenido; _shared/SKILL.md se reescribe entero y el resto solo en los pasajes que coinciden; los tests de contrato siguen pasando; NOTICE deja de nombrar _shared y agents/sdd-orchestrator.agent.md y metadata.author de _shared deja de nombrar a gentleman-programming; node scripts/check.js pasa

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-21T09:26:37.723Z):

> cobtinua (cambio 5 de E1.105: referencias de _shared, agente sdd-orchestrator y frases de sdd-baseline y sdd-reconcile)

Answer 1 — open-facts, user, 2026-11-21T09:29:11.313Z:

> todas las recomendadas
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `NOTICE`, `agents/sdd-baseline.agent.md`, `agents/sdd-orchestrator.agent.md`, `agents/sdd-reconcile.agent.md`, `docs/roadmaps/harness-evolution.md`, `skills/_shared/SKILL.md`, `skills/_shared/openspec-convention.md`, `skills/_shared/persistence-contract.md`, `skills/_shared/sdd-phase-common.md`, `skills/_shared/skill-resolver.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Una sola regla sobre state.yaml en persistence-contract, openspec-convention y sdd-phase-common: el runtime proyecta phases.*, status, last_updated y blocking_questions desde el sobre de la fase, también en blocked; una fase escribe en state.yaml solo los bloques que su skill nombra, como verify_lineage, gates.quality-gates o las resoluciones de assumptions (respuesta del usuario al gate open-facts)
- El orquestador pasa siempre artifact_store.mode: openspec sin preguntar; none queda para una fase lanzada sin modo o a la que se pide solo salida inline, y entonces no escribe ningún fichero del proyecto (respuesta del usuario al gate open-facts)
- Lo que el código ya resuelve se corrige al reescribir: /sdd-explore guarda exploration.md cuando hay un cambio con nombre, el pronóstico de review lleva sus cuatro líneas literales con Chain strategy, la carga de skills de una fase sigue el orden de skill-resolver.md y el sobre en prosa es la forma que el orquestador lee cuando falta el bloque json:result-envelope
<!-- ospec:decisions:end -->

- Medida con `node scripts/third-party-overlap.js --source <clon de gentle-ai>`: antes, `_shared/SKILL.md` 71,4 %, `openspec-convention.md` 19,2 %, `skill-resolver.md` 18,5 %, `persistence-contract.md` 16,0 %, `agents/sdd-orchestrator.agent.md` 15,9 %, `sdd-phase-common.md` 11,8 %, `agents/sdd-baseline.agent.md` 4,8 % y `agents/sdd-reconcile.agent.md` 3,2 %; después, de 998 líneas largas solo coinciden `disable-model-invocation: true`, el encabezado de interfaz `## Project Standards (auto-resolved)` y los títulos `### SDD Init Guard (MANDATORY)`, que cita `openspec/specs/agents/spec.md`, y `### Review Workload Guard (MANDATORY)`.
- `agents/sdd-tasks.agent.md` conserva las cuatro líneas del pronóstico de review, los literales de interfaz aceptados en el segundo cambio de E1.105.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-21T09:31:11.178Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-11-21T09:31:11.178Z)
- ev-3: check-run for checks-pass (2026-11-21T09:40:50.515Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-11-21T09:40:50.515Z)
- ev-5: living-doc-current for living-doc (2026-11-21T09:41:29.048Z)
<!-- ospec:evidence:end -->
