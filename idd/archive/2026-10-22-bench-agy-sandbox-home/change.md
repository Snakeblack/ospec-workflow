# bench-agy-sandbox-home

## Intent and acceptance

El sandbox de agy tapa el directorio de primer nivel del HOME (/home entero) y el detector workspace-escape reconoce copias de los directorios del banco bajo otro prefijo, como /home/.snapshots/N/snapshot/...

Acceptance: Con HOME=/home/u, sandbox.hide incluye /home; findEscapes marca un paso que nombra /home/.snapshots/85/snapshot/u/repo/scripts/evals/bench/scenarios/x/scenario.json cuando /home/u/repo está prohibido, y no marca rutas del propio run ni rutas sin relación

## Plan

1. Tests de reproducción: `findEscapes` ante una copia en un snapshot y `sandbox.hide` con `/home` (agy.test.js, bench.test.js).
2. `bench.js` añade a `hide` el directorio de primer nivel del HOME. `agy.js` (`inCopyOf`) reconoce copias de las raíces prohibidas con otro prefijo.
3. Spec del banco (requisito y escenario nuevo) y README.
4. Prueba con bwrap real: `/home/.snapshots`, `/home/linuxbrew` y el repo no se ven; agy 1.4.5, Node y el template sí.

## Decisions

- Opción A, elegida por el usuario: tapar `/home` entero en lugar de usar una lista blanca de montajes (B).
- Una copia es una ruta que contiene la raíz prohibida sin su primer segmento, a partir del segundo segmento de la ruta. Solo cuenta si quedan dos segmentos o más, para que `/tmp/ospec-bench` no marque cualquier `ospec-bench` suelto. Las rutas dentro del propio run siguen permitidas, porque se filtran después.
- Las herramientas de `/home/linuxbrew` dejan de verse dentro del sandbox. El entorno del agente cambia respecto a las corridas agy anteriores, que ya tapaban el HOME, pero no esta ruta.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-22T08:55:01.932Z)
- ev-2: check-run for checks-pass (2026-10-22T08:56:53.972Z)
- ev-3: living-doc-current for living-doc (2026-10-22T08:56:57.965Z)
<!-- ospec:evidence:end -->
