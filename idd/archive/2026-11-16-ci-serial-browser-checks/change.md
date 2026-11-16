# ci-serial-browser-checks

## Intent and acceptance

En el intento 2 de la evidencia de la PR #519 (run 43826036924, Windows 3/4), receta-spa de scripts/evals/bench/checks-greenfield.test.js falló con 'the page did not finish loading' en sus 4 comprobaciones, también tras su reintento: Chromium no carga la página en los 15 s de LOAD_TIMEOUT_MS bajo la contención de la fase paralela

Acceptance: checks-greenfield.test.js corre en la fase serie de check.js; LOAD_TIMEOUT_MS, CONCURRENCY y el reintento de Windows no cambian; las 5 ejecuciones de la PR sobre el SHA final pasan en verde

### Evidencia

- **Fallo:** run 43826036924 de la PR #519, intento 2, sobre 51fa216a, job `Validate (windows-latest 3/4)`. `receta-spa: the reference delivery passes every hidden check` dio `the page did not finish loading` en sus 4 comprobaciones, también tras el reintento de Windows, y tardó 90 s. Las otras 4 ejecuciones sobre ese SHA pasaron en verde, con Windows 3/4 como job más lento (273-388 s).
- **Señal retirada:** `persistent-data` salía porque `scripts/check.js` importa `scripts/configure/cli.js`, que usa `writeFile`. Ese import ya existía. Se retiró con la respuesta del usuario.

## Plan

<!-- ospec:plan:start -->
- Files: `CHANGELOG.md`, `docs/roadmaps/harness-evolution.md`, `scripts/check.js`, `scripts/check.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- checks-greenfield.test.js entra en SERIAL_TESTS, en su sitio alfabético (12 ficheros): su resultado depende del plazo de carga de 15 s de Chromium; el test de guarda no lo detecta, porque el plazo vive en browser.js, así que check.test.js lo fija por nombre
- La línea del cambio va directamente a la sección 2.178.1 del CHANGELOG en el mismo commit que el código y el archivo IDD, sin tocar los manifiestos de versión
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-16T08:14:22.473Z)
- ev-2: check-run for checks-pass (2026-11-16T08:15:59.157Z)
- ev-3: living-doc-current for living-doc (2026-11-16T08:34:01.307Z)
<!-- ospec:evidence:end -->
