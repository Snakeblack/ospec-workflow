# copilot-stop-deadline

## Intent and acceptance

El test del hook Stop de Copilot global falla en Windows cuando el hijo Node pasa el plazo de 4 s del lanzador; stop.js carga 38 módulos antes de contar el turno

Acceptance: stop.js cuenta el turno antes de cargar los módulos de la traza, y el test de Copilot global deja de depender del plazo del lanzador sin reintentos a ciegas

### Diagnóstico

- En Validate (windows-latest 2/2) el test pasó en 5-18 s y falló en 28-48 s (runs 41252392827 y 41295845863, intento 1). En la run que falló, un test vecino tardó 20 s. El mismo recorrido (shell → lanzador → stop.js) tardó 0,3-1 s en el shard 1 de esa run.
- El test simula `copyBinaryToTree`, así que corre el `stop.js` de Node. En producción, Copilot global copia el binario Go, que ya contaba antes de la traza (`internal/hooks/stop.go:54`).
- Al arrancar, `stop.js` pasa de 38 módulos a 5 antes de contar.

## Plan

<!-- ospec:plan:start -->
- Files: `scripts/configure/install-global-copilot.test.js`, `scripts/hooks/stop.js`, `scripts/hooks/stop.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- stop.js carga al inicio solo los módulos del conteo (atomic-write, ospec-gitignore, pathsafe, turn-fence); pre-compact, artifact-store e idd-session se cargan después del conteo con trace(), con require literales que el generador sigue empaquetando
- El test de Copilot global no reintenta: si el lanzador informa de su plazo y no hay conteo, ejecuta el stop.js instalado sin plazo desde el repo
- runHookOnceMore de codex-hook-shell.test.js queda igual: en los logs revisados sus reintentos fueron de session-start (13 módulos), no de Stop, y su salida se comprueba, así que ejecutar el hook sin plazo no aplica
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-02T20:44:02.014Z)
- ev-2: check-run for checks-pass (2026-11-02T20:46:50.170Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-02T20:46:50.170Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-02T20:47:08.392Z)
- ev-5: migration-test for migration-compat-and-test (2026-11-02T20:47:23.388Z)
- ev-6: frozen-review for trust-review (2026-11-02T20:47:49.178Z, subagent-stop)
- ev-7: check-run for checks-pass (2026-11-02T20:49:24.700Z)
- ev-8: adr-impact-declaration for adr-impact-declaration (2026-11-02T20:49:24.700Z)
- ev-9: living-doc-current for living-doc (2026-11-02T20:49:30.091Z)
<!-- ospec:evidence:end -->
