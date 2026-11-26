# execution-mode-choice

## Intent and acceptance

Elección del modo de ejecución (E1.109): con una cola de dos o más ítems pendientes en el roadmap, ospec next sin cambio abierto y ospec close devuelven un bloque execution_mode que ofrece interactivo (por defecto) o automático con la orden de ospec auto start, y las skills idd y foundation lo preguntan

Acceptance: Con un docs/roadmap.md de varias fases pendientes, ospec next sin cambio y ospec close devuelven execution_mode con la cola y la orden ospec auto start; con menos de dos pendientes, sin roadmap reconocido, con un cambio abierto, con mode: sdd o con una ejecución de ospec auto activa no lo devuelven; un roadmap inválido da un aviso sin romper next ni close; y las skills idd y foundation preguntan interactivo o automático y tratan una respuesta vacía como interactivo

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-26T16:17:27.563Z):

> continua

Answer 1 — open-facts, user, 2026-11-26T17:47:31.324Z:

> sí, como se propone
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `README.es.md`, `README.md`, `docs/README.md`, `docs/en/README.md`, `docs/roadmaps/harness-evolution.md`, `handbook/idd/flujo-idd.md`, `openspec/specs/idd/spec.md`, `scripts/configure/idd-protocol.test.js`, `scripts/fixtures/context-baseline.json`, `scripts/lib/auto-queue.js`, `scripts/lib/auto-queue.test.js`, `scripts/lib/idd-next.js`, `scripts/lib/k1-scope-guard.test.js`, `scripts/lib/progress-snapshot.js`, `scripts/ospec.js`, `scripts/ospec.output.test.js`, `skills/foundation/SKILL.md`, `skills/idd/SKILL.md`, `skills/idd/references/memory-loop.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- La cola la calcula un módulo nuevo, scripts/lib/auto-queue.js, con el lector del snapshot v1 (roadmapPhases, readChanges y phaseStatuses); next y close solo leen y nunca emiten un snapshot
- Una sesión lanzada por el conductor se reconoce por la ejecución activa de .ospec/auto (activeRun), sin variable de entorno nueva; la misma regla deja fuera la pregunta mientras otra ejecución está en marcha
- Cada ítem de la orden pide nombrar el cambio con la clave de su fase, porque el lector del roadmap solo cuenta como hecha una fase cuyo cambio empieza por esa clave
- El protocolo IDD solo gana una frase (107 B) y el resto de la pregunta vive en el how de execution_mode, porque el flujo con memoria estaba a 134 B de su presupuesto absoluto de 18 000 B; memory-loop.md no cambia
<!-- ospec:decisions:end -->

- Prior decision (memory): Modo automático: opcional, el harness pregunta automático o interactivo -> docs/roadmaps/harness-evolution.md: current

## Evidence

<!-- ospec:evidence:start -->
- ev-1: migration-test for migration-compat-and-test (2026-11-26T17:57:21.972Z)
- ev-2: check-run for checks-pass (2026-11-26T17:59:58.701Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-11-26T17:59:58.701Z)
- ev-4: check-run for checks-pass (2026-11-26T18:02:49.236Z)
- ev-5: contract-spec-and-test for contract-spec-and-test (2026-11-26T18:02:49.236Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-11-26T18:02:49.236Z)
- ev-7: migration-test for migration-compat-and-test (2026-11-26T18:03:15.551Z)
- ev-8: living-doc-current for living-doc (2026-11-26T18:03:19.435Z)
<!-- ospec:evidence:end -->
