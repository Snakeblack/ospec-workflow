# auto-host-antigravity

## Intent and acceptance

ospec auto conduce Antigravity (agy -p con --output-format stream-json), verificado en vivo

Acceptance: ospec auto start --host antigravity cierra en vivo un cambio de prueba, delega open-facts y reanuda la conversación por su id; la ejecución limita por tokens; un test de contrato fija sus argumentos, la lectura de los tokens y el error de un turno fallido

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-26T21:40:25.198Z):

> A, y sí, fusiona la #565, ya he logado en agy (A: verificar Codex y Copilot en vivo con el cupo gratuito, un tramo cada uno; Antigravity cierra la cadena)

Answer 1 — open-facts, user, 2026-11-26T23:12:51.670Z:

> lo recomendado, es importante que no pregunte a cada cosa que hara, y me refiero a ejecusiones de bash, salvo los que tebemos como criticos y desde luego los deny no, y obviamente los ask si, aunque muchas veces cuando nonsea critico en el modo automatico se eligira el recomendado
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `README.es.md`, `README.md`, `docs/README.md`, `docs/en/README.md`, `docs/roadmaps/harness-evolution.md`, `docs/target-capabilities.md`, `handbook/idd/flujo-idd.md`, `openspec/specs/idd/spec.md`, `scripts/lib/auto-conductor.js`, `scripts/lib/auto-conductor.test.js`, `scripts/lib/auto-host-antigravity.js`, `scripts/lib/auto-host-antigravity.test.js`, `scripts/lib/auto-hosts.js`, `scripts/lib/k1-scope-guard.test.js`, `scripts/ospec.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- El prompt va como valor de -p, porque agy -p no lee stdin (-p - envía un guion literal); la conversación se reanuda con --conversation <id>, que sale de result.conversation_id
- Antigravity da los tokens de cada turno en result.usage.total_tokens (entrada, con la caché leída, más salida) y ningún coste, así que admite --max-tokens
- El hook Stop de ospec corre en agy -p y cuenta el fin de turno (verificado en vivo), así que el conductor no lo cuenta
- La primera línea de la ejecución usa el aviso propio del host (reviewNote) cuando lo trae: Antigravity revisa cada acción solo donde la cuenta tiene --mode auto, y si no ejecuta todo lo que su configuración no deniega (respuesta del usuario: lo recomendado)
- El adaptador deja del stderr de agy solo la primera línea que no es un aviso (warning:), porque repite el error seguido de la lista de modelos
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-27T18:19:33.114Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-11-27T18:19:33.114Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-27T18:19:33.114Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-27T18:19:39.081Z)
- ev-5: living-doc-current for living-doc (2026-11-27T18:19:39.283Z)
<!-- ospec:evidence:end -->
