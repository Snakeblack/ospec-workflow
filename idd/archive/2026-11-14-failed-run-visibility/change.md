# failed-run-visibility

## Intent and acceptance

ospec run dice por qué una ejecución en verde no grabó evidencia, y un check o un run fallido guarda su salida completa en un fichero local y lo nombra junto a la cola.

Acceptance: Un ospec run de un par que no graba evidencia imprime el motivo que da ospec check; un check o run fallido nombra un fichero bajo .ospec/ con su salida completa, cuyo hash casa con el grabado; una ejecución en verde no escribe nada y state.yaml no cambia de forma.

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `openspec/specs/idd/spec.md`, `scripts/lib/idd-check.js`, `scripts/lib/idd-exec.js`, `scripts/lib/idd-exec.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`, `skills/idd/SKILL.md`, `skills/idd/references/checks.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- La salida completa de una ejecución fallida va a .ospec/runs/<cambio>/<run>.log y no a state.yaml: es local, se ignora a sí misma y puede imprimir lo que el estado nunca guarda; close borra las del cambio.
- Solo la guardan los checks y los ospec run fallidos: una contraprueba falla por diseño y un fitness check ya imprime su cola.
- El motivo de un par rechazado sale solo en una ejecución en verde: una en rojo sin evidencia es el paso esperado y su línea no cambia.
- La nota sobre lockfiles va en Tests by risk de la skill, en términos generales, porque el comportamiento concreto de cada gestor de paquetes no se comprobó aquí.
- La nota sobre lockfiles va en el motivo de una reproducción que nunca falló, que es cuando el agente la necesita, y no en la skill, cuyo tamaño tiene tope (context-baseline).
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-14T08:46:46.345Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-11-14T08:48:57.954Z)
- ev-3: migration-test for migration-compat-and-test (2026-11-14T08:49:57.745Z)
- ev-4: check-run for checks-pass (2026-11-14T08:51:57.736Z)
- ev-5: contract-spec-and-test for contract-spec-and-test (2026-11-14T08:51:57.736Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-11-14T08:51:57.736Z)
- ev-7: migration-test for migration-compat-and-test (2026-11-14T08:52:04.960Z)
- ev-8: living-doc-current for living-doc (2026-11-14T08:52:09.289Z)
<!-- ospec:evidence:end -->
