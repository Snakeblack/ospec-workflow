# own-sdd-verify

## Intent and acceptance

Versiones propias de sdd-verify, strict-tdd-verify.md y report-format.md, tercer cambio de E1.105

Acceptance: skills/sdd-verify no conserva líneas de 30 o más caracteres idénticas a ninguna versión del historial git de gentle-ai, salvo literales sin contenido; strict-tdd-verify.md se reescribe entero y SKILL.md y report-format.md solo en los pasajes que coinciden; los tests de contrato de la fase siguen pasando; NOTICE y metadata.author dejan de nombrar a gentle-ai en sdd-verify; node scripts/check.js pasa

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-20T15:35:51.557Z):

> continua (cambio 3 de E1.105: sdd-verify con strict-tdd-verify.md y report-format.md)

Answer 1 — open-facts, user, 2026-11-20T15:37:40.325Z:

> lo recomendado
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `NOTICE`, `docs/roadmaps/harness-evolution.md`, `skills/sdd-verify/SKILL.md`, `skills/sdd-verify/references/report-format.md`, `skills/sdd-verify/strict-tdd-verify.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- strict-tdd-verify.md nombra DEFERRED en Safety Net y ➖ Deferred en TRIANGULATE con el veredicto que reciben hoy: DEFERRED no da hallazgo por sí solo porque su fila pasa por la regla de GREEN, y ➖ Deferred sigue sujeto al WARNING de varios escenarios con un solo caso (respuesta del usuario al gate open-facts)
- sdd-verify conserva lo que leen otras piezas y fijan los tests: los pasos 2a, 2b, 2c, 9a, 10a y 10b, la taxonomía INFO < WARNING < BLOCKER y su tabla, verify_outcome, los niveles de evidencia de REQ-skills-002, los encabezados Traceability Matrix y Assumption Reconciliation del informe, las secciones Strict TDD del informe y los umbrales de cobertura (95 y 80 %) y de dobles (más del doble que aserciones o 7 o más)
- report-format.md remite a las cinco secciones Strict TDD del informe, Assertion Quality incluida, como ya exige strict-tdd-verify.md
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-20T15:39:40.301Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-11-20T15:39:40.301Z)
- ev-3: check-run for checks-pass (2026-11-20T15:45:59.685Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-11-20T15:45:59.685Z)
- ev-5: living-doc-current for living-doc (2026-11-20T15:46:25.831Z)
<!-- ospec:evidence:end -->
