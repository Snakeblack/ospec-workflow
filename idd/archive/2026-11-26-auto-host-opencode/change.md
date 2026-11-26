# auto-host-opencode

## Intent and acceptance

ospec auto conduce OpenCode (opencode run --standalone --auto), verificado en vivo

Acceptance: ospec auto start --host opencode cierra en vivo un cambio de prueba, delega open-facts y reanuda la sesión por su id; la ejecución avisa al empezar de que OpenCode no revisa cada acción; un test de contrato fija sus argumentos y la lectura del coste

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-26T19:40:23.910Z):

> continua (E1.110, tramo de OpenCode de la cadena elegida: lo común con el primer host verificado y un tramo por host)

Answer 1 — open-facts, user, 2026-11-26T19:49:14.778Z:

> lo recomendado

Answer 2 — base-moved, user, 2026-11-26T20:04:42.006Z:

> todas las recomendadas
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `docs/target-capabilities.md`, `handbook/idd/flujo-idd.md`, `openspec/specs/idd/spec.md`, `scripts/lib/auto-conductor.js`, `scripts/lib/auto-host-opencode.js`, `scripts/lib/auto-host-opencode.test.js`, `scripts/lib/auto-hosts.js`, `scripts/lib/auto-hosts.test.js`, `scripts/lib/k1-scope-guard.test.js`, `scripts/ospec.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Con los topes de gasto opcionales, OpenCode admite solo --max-cost-usd, como los demás hosts que informan del coste
- El coste de OpenCode se lee tras cada turno con opencode session export, porque los eventos de --format json no traen el step_finish del último paso
- opencode run y session export van con --standalone: cada uno levanta su propio servidor, así que matar el proceso para el agente y ospec auto stop funciona
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-26T20:12:12.273Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-11-26T20:12:12.273Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-26T20:12:12.273Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-26T20:12:52.242Z)
- ev-5: living-doc-current for living-doc (2026-11-26T20:13:07.598Z)
<!-- ospec:evidence:end -->
