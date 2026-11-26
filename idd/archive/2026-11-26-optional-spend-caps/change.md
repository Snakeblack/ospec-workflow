# optional-spend-caps

## Intent and acceptance

Los topes de gasto de ospec auto pasan a ser opcionales y, en Claude Code, el de coste se aplica dentro del turno con --max-budget-usd

Acceptance: Sin --max-cost-usd ni --max-tokens la ejecución no tiene tope de gasto y lo dice al empezar; con --max-cost-usd en Claude cada turno lleva --max-budget-usd con lo que queda y un turno cortado por él deja la ejecución failed con max-cost; el tope de turnos por ítem sigue obligatorio

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-26T19:47:09.507Z):

> B, e incluye los flags nativos en este tramo (B: lo de convergencia obligatorio; el gasto opcional, --max-cost-usd o --max-tokens solo si se pasan, sin valor por defecto; status y cada línea muestran lo gastado; donde el host tiene tope nativo el conductor le pasa lo que queda)

Answer 1 — open-facts, user, 2026-11-26T19:49:14.628Z:

> lo recomendado
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `CHANGELOG.md`, `docs/roadmaps/harness-evolution.md`, `docs/target-capabilities.md`, `handbook/idd/flujo-idd.md`, `openspec/specs/idd/spec.md`, `scripts/lib/auto-conductor.js`, `scripts/lib/auto-conductor.test.js`, `scripts/lib/auto-hosts.js`, `scripts/lib/auto-hosts.test.js`, `scripts/lib/auto-queue.js`, `scripts/lib/auto-queue.test.js`, `scripts/lib/auto-run.js`, `scripts/lib/auto-run.test.js`, `scripts/lib/headless-session.js`, `scripts/lib/headless-session.test.js`, `scripts/ospec.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Sin topes de gasto por defecto: --max-cost-usd solo en un host que informa del coste y --max-tokens solo en uno que no; el tope de turnos por ítem sigue obligatorio (30)
- En Claude, cada turno lleva --max-budget-usd con lo que queda del tope de la ejecución (contando el acumulado del ítem), porque el flag cuenta el gasto de la invocación; un turno que termina con error_max_budget_usd deja la ejecución failed con max-cost
- Sin tope, la primera línea dice no spending cap y execution_mode ofrece el tope como opción del usuario
- La ejecución guarda en spend si mide coste o tokens, para mostrar lo gastado sin tope
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-26T19:56:57.443Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-11-26T19:56:57.443Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-26T19:56:57.443Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-26T19:57:15.054Z)
- ev-5: check-run for checks-pass (2026-11-26T19:58:49.500Z)
- ev-6: contract-spec-and-test for contract-spec-and-test (2026-11-26T19:58:49.500Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-11-26T19:58:49.500Z)
- ev-8: living-doc-current for living-doc (2026-11-26T19:58:49.664Z)
<!-- ospec:evidence:end -->
