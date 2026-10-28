# bench-knowledge-crlf

## Intent and acceptance

La contraprueba de adjuntos en checks-knowledge.test.js falla en Windows: busca la línea con su LF y el checkout de Windows la termina en CRLF

Acceptance: La contraprueba de adjuntos pasa con la referencia en LF y en CRLF, y solo falla sin-salir-de-la-carpeta en ambos casos

## Plan

<!-- ospec:plan:start -->
- Files: `scripts/evals/bench/checks-knowledge.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- La contraprueba de adjuntos borra la sentencia sin su fin de línea y corre también sobre un src/app.js en CRLF, como lo deja un checkout de Windows con autocrlf
- No se fija eol=lf para los fixtures del banco en .gitattributes: la contraprueba no debe depender del fin de línea de la referencia
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-28T18:43:48.007Z)
- ev-2: check-run for checks-pass (2026-10-28T18:44:48.234Z)
- ev-3: living-doc-current for living-doc (2026-10-28T18:44:48.301Z)
<!-- ospec:evidence:end -->
