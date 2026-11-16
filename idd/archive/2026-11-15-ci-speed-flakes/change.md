# ci-speed-flakes

## Intent and acceptance

Validate Harness tarda 9-15 min por PR y el 13 % de las ejecuciones necesita relanzarse: scripts/ospec.test.js corre en serie 443 s en Windows y 288 s en macOS y marca el job crítico, y los tests con plazos reales (hooks de Codex en shells reales, lanzador) agotan su plazo bajo la contención de la suite

Acceptance: ospec.test.js partido por áreas en ficheros que Node reparte entre shards (los mismos 184 tests); Windows y macOS en más shards; los tests sensibles a la contención corren después de la fase paralela, de uno en uno; el pre-commit sigue ejecutando los tests de scripts/ospec.js; el job más lento de Validate Harness baja de 9-15 min a unos 5 min, medido en la CI de la PR

### Diagnóstico (2026-11-15)

Medido sobre las últimas 100 ejecuciones de Validate Harness (del 2026-10-27 al 2026-11-15, con todos sus intentos) y los logs TAP del último verde de `main` (run 43698487164).

- **Duración por job (verdes, p50 / p90 / máx.):** Windows 1/2 476 / 706 / 821 s; Windows 2/2 319 / 755 / 877 s; macOS 448 / 557 / 825 s; Ubuntu 203 / 241 / 264 s. Build ospec-hooks no es crítico: su job Go más lento es el de Windows, 74 s de p50.
- **Dónde se va el tiempo:** casi entero en `node --test`. La generación de los siete targets tarda unos 2 s, y la preparación del job (checkout, Node, Go y Dev Drive) unos 35 s en Windows.
- **Cuello de botella:** `scripts/ospec.test.js` (184 tests, 5008 líneas) corre en serie dentro de un mismo proceso: 443 s en Windows, 288 s en macOS, 119 s en Ubuntu y 104 s en local. Es el índice 246 de 268 en la lista ordenada, así que empieza tarde en su shard. Por sí solo marca el shard que lo recibe; el otro shard ronda los 200-300 s.
- **Reparto:** `--test-shard` reparte en round robin sobre la lista ordenada. Cuando cambia el número de ficheros, el fichero pesado pasa de un shard al otro, y por eso en la serie se alternan Windows 1/2 y 2/2 como job lento.
- **Simulación** (cola FIFO con la concurrencia del runner: 3 en Windows y Ubuntu, 2 en macOS; calibrada contra los tiempos reales, 533 s simulados frente a 524 s medidos): con `ospec.test.js` partido en 8 y los dos ficheros sensibles fuera de la fase paralela, la fase paralela tardaría unos 176 s en Windows con 3 shards (130 s con 4), unos 248 s en macOS con 2 (193 s con 3) y unos 141 s en Ubuntu con 1.
- **Fallos:** 13 de las 100 ejecuciones se relanzaron, siempre con el mismo SHA y en verde después:
  - `codex-hook-shell.test.js` en Windows, 6 veces (la última el 2026-11-15): ETIMEDOUT del plazo de 4 s del lanzador incluso tras el reintento. En el verde, el subtest de Windows PowerShell tardó 41 s, frente a los 0,2 s que tarda aislado (medición de E1.30).
  - Tests del lanzador en macOS, 2 veces (2026-11-06 y 2026-11-13): el `spawnSync` del test agota sus 10 s.
  - Copilot Stop, 3 veces, y la carrera EPIPE, 2 veces: ya arreglados en v2.168.9 y v2.168.5.
  - Cancelaciones por el límite de 15 min: 2 (903 y 907 s).
- **Descartado por mediciones anteriores (ci-windows-optimization, 2026-10-18):** Defender ya viene desactivado en el runner; con concurrencia 8 Windows no acelera; `CHILD_TIMEOUT_MS` no se toca porque el usuario eligió el reintento acotado en el test.

### Partición y verificación local

- **Partes:** tramos contiguos del original, para que el movimiento se revise por bloques. `scripts/ospec.test.js` (núcleo, check y run), `ospec.counterproof`, `ospec.review`, `ospec.review-correction`, `ospec.close`, `ospec.impact`, `ospec.output` y `ospec.lifecycle`, cada una con su `.test.js`. Los 35 helpers y constantes que usa más de una parte van a `scripts/lib/test-support/ospec-cli.js`, detectados sobre el AST del original. Antes, la parte de la contraprueba usaba helpers que el original definía más abajo.
- **Movimiento puro:** cada línea del original está una sola vez en las partes o en el módulo de helpers. Solo cambian las cabeceras, los `require` y la ruta de `CLI`. Los 184 nombres de test coinciden con los de la base, y pasan 184 de 184.
- **Tiempo local (16 núcleos):** las partes tardan 17 s de pared, frente a los 104 s de `ospec.test.js`, y `ospec check` completo tarda 68 s.
- **Señal retirada:** `persistent-data` salía del contenido del diff (`writeFile` en el módulo de helpers): es el helper de test movido sin cambios. Se retiró con la respuesta del usuario.

## Plan

<!-- ospec:plan:start -->
- Files: `.github/workflows/validate-harness.yml`, `CONTRIBUTING.md`, `docs/roadmaps/harness-evolution.md`, `openspec/specs/git-precommit-hook/spec.md`, `scripts/check.js`, `scripts/check.test.js`, `scripts/hooks/lib/staged-validator.js`, `scripts/hooks/lib/staged-validator.test.js`, `scripts/lib/test-support/ospec-cli.js`, `scripts/ospec.test.js`
- Work units: 3
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Validate Harness: Windows en 3 shards, macOS en 2 y Ubuntu en 1 (decisión del usuario); el límite de 15 min por job no cambia
- check.js lista él mismo los ficheros de test (los de node --test scripts/**/*.test.js tests/**/*.test.js: sin node_modules ni entradas que empiezan por punto) y los pasa explícitos, para sacar de la fase paralela los de SERIAL_TESTS; con 268 ficheros la orden ocupa unos 11 KB del límite de 32 KB de Windows, y pasarse fallaría al arrancar, no en silencio
- SERIAL_TESTS (codex-hook-shell.test.js y ospec-hooks-launch.test.js) corre tras la fase paralela con --test-concurrency=1; con --shard i/n el fichero j de la lista va al shard (j mod n)+1; un fichero de la lista que no existe hace fallar check.js; el reintento acotado de codex-hook-shell no cambia
- El modo --staged del pre-commit sigue con una sola ejecución: sus fallos por contención no constan y el equipo local tiene más núcleos que el runner
- ospec.test.js se parte por áreas en scripts/ospec.<área>.test.js; el núcleo se queda en scripts/ospec.test.js y los helpers que usan varias partes van a scripts/lib/test-support/ospec-cli.js; se comprueba que los 184 nombres de test son los mismos antes y después
- El pre-commit asocia <nombre>.js también a <nombre>.*.test.js de su directorio (REQ-git-precommit-hook-002)
- Evidencia: 5 ejecuciones de Validate Harness en la PR; el roadmap lo anota como avance de E1.30, que sigue abierto
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-15T20:37:01.239Z)
- ev-2: check-run for checks-pass (2026-11-15T20:45:16.840Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-15T20:45:16.840Z)
- ev-4: frozen-review for trust-review (2026-11-15T20:47:25.927Z, subagent-stop)
- ev-5: living-doc-current for living-doc (2026-11-15T20:55:27.493Z)
<!-- ospec:evidence:end -->
