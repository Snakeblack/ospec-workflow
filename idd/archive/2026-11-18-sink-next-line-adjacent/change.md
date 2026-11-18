# sink-next-line-adjacent

## Intent and acceptance

La línea siguiente con la que el catálogo de sinks lee un valor CWE-79 partido es la de abajo en el fichero, no la siguiente línea añadida, que puede venir de otro hunk

Acceptance: Una asignación segura sin punto y coma al final de un hunk, seguida en el diff por otro hunk que abre con un operador, no deriva security-boundary; un valor que sigue justo debajo sigue contando; la spec de IDD dice qué línea se lee; node scripts/check.js pasa

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-18T23:08:22.144Z):

> TODAS LAS RECOMENDADAS

Answer 1 — open-facts, user, 2026-11-18T23:12:49.625Z:

> la recomendada

Answer 2 — retract persistent-data, user, 2026-11-18T23:18:57.176Z:

> a
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `openspec/specs/idd/spec.md`, `scripts/lib/idd-signals.js`, `scripts/lib/idd-signals.test.js`, `scripts/lib/idd-workspace.js`, `scripts/lib/idd-workspace.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- El diff guarda en addedLineNumbers el número de cada línea añadida en el fichero nuevo, leído de la cabecera de su hunk; las líneas quitadas y la marca de fin sin salto de línea no cuentan, y un fichero sin versionar no lleva números porque añade todas sus líneas
- El valor partido de un sink sigue en la línea de abajo del fichero tal como queda, cambie o no, como respondió el usuario; sin el fichero leído (demasiado grande o cambiado entre la lectura del diff y la del fichero) solo sigue en la línea añadida justo debajo, y sin números, en la siguiente línea añadida, como antes
<!-- ospec:decisions:end -->

### Memoria

- Prior decision (memory): El parser del diff solo lee cabeceras antes del primer hunk -> scripts/lib/idd-workspace.js: current

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-18T23:14:56.681Z)
- ev-2: check-run for checks-pass (2026-11-18T23:17:38.732Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-18T23:17:38.732Z)
- ev-4: check-run for checks-pass (2026-11-18T23:20:59.814Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-11-18T23:20:59.814Z)
- ev-6: living-doc-current for living-doc (2026-11-18T23:20:59.923Z)
<!-- ospec:evidence:end -->
