# changelog-line

## Intent and acceptance

Un cambio abierto puede declarar y corregir la línea que publica en el changelog con ospec record changelog, sin tocar el intent ni su aceptación.

Acceptance: Un cambio abierto declara y vuelve a declarar su línea de changelog y ospec close escribe esa; sin declararla la entrada sale del summary como hoy; record intent con otro summary sigue respondiendo intent-conflict y su remedio nombra la orden nueva.

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `handbook/idd/entrega.md`, `openspec/specs/idd/spec.md`, `scripts/lib/idd-changelog.js`, `scripts/lib/idd-changelog.test.js`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-contract.test.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-record.test.js`, `scripts/lib/idd-refusals.js`, `scripts/ospec.js`, `scripts/ospec.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- La línea va en un campo opcional changelog_line de state.yaml y no dentro de intent: el intent sigue inmutable y un estado anterior sigue siendo válido.
- record changelog no abre ningún gate: cambia el texto que el cambio publica, no lo que se comprueba.
- La última línea sustituye a la anterior sin historial y --clear vuelve al resumen; la sección sigue saliendo del kind.
- La skill idd no la menciona, porque su tamaño tiene tope: el agente la descubre en el remedio de intent-conflict y en el uso del CLI.
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-14T15:47:02.283Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-11-14T15:47:02.283Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-14T15:47:02.283Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-14T15:47:11.856Z)
- ev-5: living-doc-current for living-doc (2026-11-14T15:47:12.305Z)
<!-- ospec:evidence:end -->
