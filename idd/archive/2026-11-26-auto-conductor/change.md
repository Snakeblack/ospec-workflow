# auto-conductor

## Intent and acceptance

Conductor del modo automático (E1.108): ospec auto start|status|resume|stop ejecuta una cola de encargos con una sesión sin interfaz nueva por cambio, responde open-facts con la fuente delegated, para en los gates bloqueantes y solo avanza con el close en disco

Acceptance: Con un host simulado, ospec auto start lleva dos encargos hasta su close con un commit por cambio y open-facts resuelto con delegated; para en blocked ante un gate bloqueante y resume la continúa; stop la detiene; una respuesta delegada sin una ejecución en curso registrada en .ospec/auto se rechaza; y una ejecución real en Claude Code con Haiku cierra un cambio de prueba

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-26T14:25:50.618Z):

> continua

Answer 1 — open-facts, user, 2026-11-26T14:34:30.266Z:

> sí, como se propone
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `README.es.md`, `README.md`, `docs/README.md`, `docs/architecture/component-map.yaml`, `docs/en/README.md`, `docs/roadmaps/harness-evolution.md`, `handbook/idd/flujo-idd.md`, `openspec/specs/idd/spec.md`, `scripts/configure/cli.js`, `scripts/evals/bench/README.md`, `scripts/evals/bench/driver.js`, `scripts/evals/bench/hosts/agy.js`, `scripts/evals/bench/hosts/claude.js`, `scripts/lib/auto-conductor.js`, `scripts/lib/auto-hosts.js`, `scripts/lib/auto-run.js`, `scripts/lib/claude-bin.js`, `scripts/lib/headless-session.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-refusals.js`, `scripts/ospec.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- El conductor reutiliza del banco el lanzador de procesos y el resumen del stream-json de Claude, que pasan a scripts/lib/headless-session.js; la persona, el aislamiento de la configuración y el juicio se quedan en el banco
- El conductor hace él el commit de cada cambio cerrado, porque el guard de colaboración git de ospec pide confirmación en todo commit con el árbol sucio y sin interfaz nadie la da; la sesión no hace commit
- La resolución del binario de claude pasa de scripts/configure/cli.js a scripts/lib/claude-bin.js, porque el runtime instalado de los targets lleva scripts/lib y no scripts/configure
- El coste de un ítem es el último total_cost_usd de su sesión, porque con --resume Claude informa el acumulado de la sesión y no el del turno
- Una respuesta delegada exige además que su ejecución conste como running en .ospec/auto con el conductor vivo; el reductor sigue puro y ospec.js le pasa si está registrada
<!-- ospec:decisions:end -->

Antes de construir, una prueba en vivo con Claude Code 2.1.330, Haiku y `--permission-mode auto` llevó un cambio IDD hasta `close` sin que el clasificador denegara nada: ni las órdenes de ospec, ni las ediciones, ni `mem_search` o `mem_save`. Las cinco denegaciones fueron del guard de colaboración git de ospec al intentar la sesión el commit, de ahí la segunda decisión. Antigravity no tenía sesión iniciada y pasa a E1.110.

- Prior decision (memory): conforms ADR 0003 -> docs/architecture/decisions/0003-algoritmos-en-el-cli.md: current
- Prior decision (memory): conforms ADR 0005 -> docs/architecture/decisions/0005-cierre-ligado-a-evidencia.md: current
- Prior decision (memory): conforms ADR 0010 -> docs/architecture/decisions/0010-runtime-autocontenido.md: current
- Prior decision (memory): conforms ADR 0011 -> docs/architecture/decisions/0011-modos-sdd-e-idd-separados-en-disco.md: current

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-26T15:03:24.037Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-11-26T15:03:24.037Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-26T15:03:24.037Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-26T15:03:37.613Z)
- ev-5: living-doc-current for living-doc (2026-11-26T15:03:45.260Z)
<!-- ospec:evidence:end -->
