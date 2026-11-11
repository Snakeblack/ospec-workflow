# idd-sql-tests

## Intent and acceptance

addedTests descarta los tests SQL (pgTAP) porque exige una extensión de PRODUCT_EXT, que no incluye sql: un arreglo de BD cuyo test es supabase/tests/foo_test.sql no cierra repro-test, no lanza el contraproof y el mensaje dice que el diff no añade ningún test (#488)

Acceptance: addedTests cuenta un .sql con líneas de código bajo un directorio de tests o con sufijo _test/_spec, y no uno que solo añade comentarios --; una migración .sql fuera de tests sigue sin ser test ni producto; el mensaje de un par rechazado explica qué cuenta como test; handbook/idd/evidencia.md lo documenta; node scripts/check.js pasa

## Plan

<!-- ospec:plan:start -->
- Files: `handbook/idd/evidencia.md`, `openspec/specs/idd/spec.md`, `scripts/lib/idd-check.js`, `scripts/lib/idd-check.test.js`, `scripts/lib/idd-signals.js`, `scripts/lib/idd-signals.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Una lista TEST_CODE_EXT (sql) que solo cuenta para tests: addedTests y la regla de sufijo de isTestPath la aceptan además de PRODUCT_EXT, y PRODUCT_EXT no cambia, así que una migración .sql sigue como other y no deriva untested-product
- El mensaje de un par o de boundary-tests rechazado explica qué cuenta como test (fichero de test con extensión de código o SQL, sin comentarios, fixtures ni golden) en lugar de nombrar la extensión concreta: checkVerdict no recibe el diff y pasarlo por sus 5 llamadas añade fontanería para un mensaje
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-11T09:53:18.308Z)
- ev-2: check-run for checks-pass (2026-11-11T09:54:58.862Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-11T09:54:58.862Z)
- ev-4: living-doc-current for living-doc (2026-11-11T09:55:14.911Z)
<!-- ospec:evidence:end -->
