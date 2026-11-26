# auto-conductor-hosts

## Intent and acceptance

ospec auto conduce las sesiones de Antigravity, Codex, OpenCode, Copilot CLI y Cursor, cada una verificada en vivo; VS Code queda unavailable

Acceptance: ospec auto start --host <host> cierra en vivo un cambio de prueba en cada host verificado; un host no verificado o VS Code se rechaza con host-unavailable y su motivo, que docs/target-capabilities.md declara; un test de contrato por host fija sus argumentos

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-26T18:57:42.991Z):

> continua (siguiente ítem del roadmap: E1.110 auto-conductor-hosts, el conductor de E1.108 en Antigravity, Codex, OpenCode, Copilot CLI y Cursor, cada uno tras verificarlo en vivo; el host que no puede queda unavailable con su motivo)

Answer 1 — open-facts, user, 2026-11-26T19:11:10.594Z:

> todas las recomendadas
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `docs/target-capabilities.md`, `openspec/specs/idd/spec.md`, `scripts/lib/auto-conductor.js`, `scripts/lib/auto-conductor.test.js`, `scripts/lib/auto-hosts.js`, `scripts/lib/auto-hosts.test.js`, `scripts/lib/auto-queue.js`, `scripts/lib/auto-queue.test.js`, `scripts/lib/auto-run.js`, `scripts/lib/headless-session.js`, `scripts/lib/idd-refusals.js`, `scripts/ospec.js`
- Work units: 6
<!-- ospec:plan:end -->

Este cambio es el tramo 1 de la cadena de E1.110: lo común (registro de hosts, VS Code `unavailable`, tope de tokens, cuenta de turnos del conductor, `--host` en `execution_mode`) y Cursor. OpenCode, Codex, Copilot CLI y Antigravity llegan cada uno en su cambio, tras verificarlo en vivo; hasta entonces el conductor los rechaza con «not verified live yet».

## Decisions

<!-- ospec:decisions:start -->
- Permisos: revisión automática donde el host la tiene (agy --mode auto, codex exec --approve-for-me, copilot --assisted-approval, cursor-agent --auto-review) y opencode run --auto; si en vivo deniega ospec, memoria o ediciones, se vuelve al usuario antes de saltarse los permisos
- Tope --max-tokens (limits.max_tokens, 100 millones por ejecución, entrada, salida y caché) solo en hosts que no informan coste en USD; Claude sigue con 25 USD
- execution_mode: el how pide añadir --host <id> fuera de Claude Code y dar la orden para una terminal
- Un host de todo o nada arranca igual: la línea de arranque avisa de que no revisa cada acción y target-capabilities lo declara
- Entrega en cadena de PR: lo común con el primer host verificado, un tramo por host y la release minor al final
- Valla de turnos: en un host cuyo hook de fin de turno no corre sin interfaz (Cursor -p no dispara stop), el conductor cuenta el fin de turno al ver terminar el proceso de la sesión
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: migration-test for migration-compat-and-test (2026-11-26T19:33:44.516Z)
- ev-2: check-run for checks-pass (2026-11-26T19:35:30.536Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-11-26T19:35:30.536Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-11-26T19:35:30.536Z)
- ev-5: migration-test for migration-compat-and-test (2026-11-26T19:36:01.541Z)
- ev-6: check-run for checks-pass (2026-11-26T19:37:38.937Z)
- ev-7: contract-spec-and-test for contract-spec-and-test (2026-11-26T19:37:38.937Z)
- ev-8: adr-impact-declaration for adr-impact-declaration (2026-11-26T19:37:38.937Z)
- ev-9: living-doc-current for living-doc (2026-11-26T19:37:39.093Z)
<!-- ospec:evidence:end -->
