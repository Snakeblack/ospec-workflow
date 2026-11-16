# ci-serial-timing-tests

## Intent and acceptance

En la CI del commit de release de la PR #519, REQ-lifecycle-kernel-035 (readState y el proyector leen una línea larga en tiempo lineal, scripts/lib/ospec-state.test.js) tardó 2222 ms frente a su presupuesto de 1000 ms en Windows 3/4: los tests que miden tiempo de pared siguen en la fase paralela, donde la contención ha subido al correr a la vez las partes de ospec

Acceptance: Los tests que comprueban un presupuesto de tiempo de pared corren en la fase serie de check.js; Validate Harness vuelve a pasar en verde en la PR

### Evidencia

- **Fallo:** run 43771912371 de la PR #519, sobre el commit de release 1ee55219, job `Validate (windows-latest 3/4)`. `REQ-lifecycle-kernel-035: readState and the projector read a long line in linear time` (`scripts/lib/ospec-state.test.js:1685`) tardó 2222 ms frente a su presupuesto de 1000 ms. En las 100 ejecuciones anteriores no había fallado nunca. Con `ospec.test.js` partido corren a la vez varias partes de `ospec`, y en Windows el tiempo total de tests subió de unos 1200 s a unos 1900 s.
- **Por qué no se sube el presupuesto:** sobre la base cuadrática, estos tests tardaban de 3 a 8 s (decisión de yaml-readers-linear-blank-parity). Siendo lineal, bajo contención, han tardado 2,2 s.
- **Ficheros:** el test de guarda encontró 9 ficheros que miden tiempo con `process.hrtime`, uno más que la búsqueda inicial (`scripts/route-dispatch-run.test.js`). En local, los 9 tardan unos 5,4 s sin contención.

## Plan

<!-- ospec:plan:start -->
- Files: `CHANGELOG.md`, `CONTRIBUTING.md`, `docs/roadmaps/harness-evolution.md`, `scripts/check.js`, `scripts/check.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- SERIAL_TESTS pasa a los 10 ficheros con plazo real, en orden alfabético: los 2 de antes y los 8 que miden tiempo de pared con process.hrtime; el fichero j va al shard (j mod n)+1
- Un test de check.test.js falla si un fichero de test que menciona process.hrtime o performance.now no está en SERIAL_TESTS; los presupuestos medidos con Date.now quedan fuera (el único, en idd-exec.test.js, es una guarda de cuelgue de 30 s)
- La línea de este cambio entra en la sección 2.178.1 del CHANGELOG con un commit posterior al de release que no toca los manifiestos de versión: el commit de release ya estaba empujado
- La guarda encontró un noveno fichero que la búsqueda inicial no vio, scripts/route-dispatch-run.test.js (tres presupuestos de 1 s, 0,9 s en local), que también pasa a SERIAL_TESTS: SERIAL_TESTS queda con 11 ficheros
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-15T23:55:48.968Z)
- ev-2: check-run for checks-pass (2026-11-15T23:57:08.627Z)
- ev-3: living-doc-current for living-doc (2026-11-16T07:42:12.879Z)
<!-- ospec:evidence:end -->
