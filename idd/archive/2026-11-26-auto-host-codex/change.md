# auto-host-codex

## Intent and acceptance

ospec auto conduce Codex (codex exec --approve-for-me), verificado en vivo

Acceptance: ospec auto start --host codex cierra en vivo un cambio de prueba, delega open-facts y reanuda la sesión por su id; la ejecución limita por tokens; un test de contrato fija sus argumentos, la lectura de los tokens y el error de un turno fallido

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-26T20:32:22.485Z):

> A, y sí, fusiona la #565, ya he logado en agy (A: verificar Codex y Copilot en vivo con el cupo gratuito, un tramo cada uno)

Answer 1 — open-facts, user, 2026-11-26T20:33:10.949Z:

> A, lo recomendado
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `README.es.md`, `README.md`, `docs/README.md`, `docs/en/README.md`, `docs/roadmaps/harness-evolution.md`, `docs/target-capabilities.md`, `handbook/idd/flujo-idd.md`, `openspec/specs/idd/spec.md`, `scripts/lib/auto-conductor.js`, `scripts/lib/auto-host-codex.js`, `scripts/lib/auto-host-codex.test.js`, `scripts/lib/auto-hosts.js`, `scripts/lib/auto-queue.test.js`, `scripts/lib/k1-scope-guard.test.js`, `scripts/ospec.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Codex informa de los tokens de cada turno en turn.completed y ningún coste, así que admite solo --max-tokens; cuenta input_tokens más output_tokens, porque cached_input_tokens va dentro de input_tokens
- Las opciones de codex exec (--json, --approve-for-me, --model) van antes del subcomando resume, que no las tiene
- El adaptador quita del stderr de Codex sus líneas de log (como el 403 de un servidor MCP) y saca el mensaje del JSON del API que trae turn.failed, para que el motivo de una pausa sea legible
- En Codex el conductor cuenta el fin de turno al ver terminar el proceso y no pasa --dangerously-bypass-hook-trust; los hooks de ospec solo corren en codex exec si el usuario los aprueba una vez en /hooks
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-26T20:39:42.799Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-11-26T20:39:42.799Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-26T20:39:42.799Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-26T20:39:48.306Z)
- ev-5: living-doc-current for living-doc (2026-11-26T20:39:52.877Z)
<!-- ospec:evidence:end -->
