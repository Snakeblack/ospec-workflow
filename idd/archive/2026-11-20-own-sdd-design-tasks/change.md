# own-sdd-design-tasks

## Intent and acceptance

Versiones propias de sdd-design y sdd-tasks, segundo cambio de E1.105

Acceptance: skills/sdd-design y skills/sdd-tasks no conservan líneas de 30 o más caracteres idénticas a ninguna versión del historial git de gentle-ai, salvo literales sin contenido y los campos del pronóstico de review que el usuario aceptó como literales de interfaz; los tests de contrato de las dos fases siguen pasando; NOTICE y metadata.author dejan de nombrar a gentle-ai en ellas; node scripts/check.js pasa

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-20T00:53:38.724Z):

> continua (cambio 2 de E1.105: sdd-design y sdd-tasks)

Answer 1 — base-moved, user, 2026-11-20T15:21:51.869Z:

> para no hacer mucho jaleo incluyelo a los prs y ya

Answer 2 — contract-removal, user, 2026-11-20T15:24:33.669Z:

> si
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `NOTICE`, `docs/roadmaps/harness-evolution.md`, `skills/sdd-design/SKILL.md`, `skills/sdd-tasks/SKILL.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- sdd-tasks conserva el formato de línea de tarea que lee resolveRemainingTasks de apply-resume.js (casilla [ ], [~] o [x] seguida del id con puntos) y los encabezados que leen sdd-apply, el orquestador y gate-change-collision (Review Workload Forecast, Spec/Design Reconciliation, Lite Change Contract, missing-design, escalate-to-standard-sdd); sdd-design conserva Step 3b, decisions/dc-NNN.md, los cuatro criterios de decisión significativa y las secciones del registro de decisión que fijan sus tests
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-20T15:26:09.191Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-11-20T15:26:09.191Z)
- ev-3: living-doc-current for living-doc (2026-11-20T15:26:24.593Z)
<!-- ospec:evidence:end -->
