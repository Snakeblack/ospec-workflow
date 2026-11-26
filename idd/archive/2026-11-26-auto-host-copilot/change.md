# auto-host-copilot

## Intent and acceptance

ospec auto conduce Copilot CLI (copilot con el prompt por stdin y --output-format json), verificado en vivo

Acceptance: ospec auto start --host github-copilot cierra en vivo un cambio de prueba, delega open-facts y reanuda la sesión por su id; un test de contrato fija sus argumentos, la lectura de su consumo y el error de un turno fallido

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-26T20:48:40.661Z):

> A, y sí, fusiona la #565, ya he logado en agy (A: verificar Codex y Copilot en vivo con el cupo gratuito, un tramo cada uno)

Answer 1 — open-facts, user, 2026-11-26T21:06:00.284Z:

> todas las recomendadas
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `README.es.md`, `README.md`, `docs/README.md`, `docs/en/README.md`, `docs/roadmaps/harness-evolution.md`, `docs/target-capabilities.md`, `handbook/idd/flujo-idd.md`, `openspec/specs/idd/spec.md`, `scripts/lib/auto-conductor.js`, `scripts/lib/auto-conductor.test.js`, `scripts/lib/auto-host-copilot.js`, `scripts/lib/auto-host-copilot.test.js`, `scripts/lib/auto-hosts.js`, `scripts/lib/auto-queue.js`, `scripts/lib/auto-queue.test.js`, `scripts/lib/auto-run.js`, `scripts/lib/auto-run.test.js`, `scripts/lib/idd-refusals.js`, `scripts/lib/k1-scope-guard.test.js`, `scripts/ospec.auto.test.js`, `scripts/ospec.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- El prompt va por stdin y la sesión se reanuda con --resume <id>; el id sale del evento result
- Copilot corre con --allow-all-tools y --no-ask-user, porque --assisted-approval deniega toda edición sin un usuario interactivo; la primera línea de la ejecución avisa de que no revisa cada acción
- Los créditos de Copilot salen de totalNanoAiu del último session.usage_checkpoint, que es el total de la sesión y sigue al reanudar; los tokens solo vienen en el primer turno de cada sesión
- Cada turno de Copilot lleva --max-ai-credits con lo que queda del tope solo desde 30 créditos, el mínimo que admite Copilot; por debajo el tope se mira entre turnos
- El conductor cuenta el fin de turno en Copilot, para que la ejecución no dependa de la versión del hook de ospec instalada, que antes de este arreglo no contaba el agentStop
- Cada host declara qué gasto informa (spend: cost, tokens o credits; sin él, reportsCost decide entre coste y tokens) y limitsFrom acepta solo el tope de ese gasto
- Copilot recibe --add-dir con su directorio (COPILOT_HOME o ~/.copilot), donde viven ospec y su runtime, porque sin usuario deniega toda orden que nombre una ruta fuera del repositorio; el usuario eligió esa opción ("lo recomendado") frente a --allow-all-paths o dejarlo unavailable
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-26T21:27:16.021Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-11-26T21:27:16.021Z)
- ev-3: migration-test for migration-compat-and-test (2026-11-26T21:27:32.521Z)
- ev-4: check-run for checks-pass (2026-11-26T21:29:18.059Z)
- ev-5: contract-spec-and-test for contract-spec-and-test (2026-11-26T21:29:18.059Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-11-26T21:29:18.059Z)
- ev-7: living-doc-current for living-doc (2026-11-26T21:29:18.222Z)
<!-- ospec:evidence:end -->
