# bench-repetitions-reserved

## Intent and acceptance

Banco head-to-head con 3 repeticiones por defecto, conclusión no concluyente con n<3, un corpus reservado congelado y márgenes bench-margins-11 declarados antes de correr (#342, pasos 1-3)

Acceptance: bench.js run sin --repetitions ejecuta 3 repeticiones; el checkpoint con menos de 3 repeticiones marca la conclusión como no concluyente; existe un corpus reservado con su digest fijado en tests; margins.json declara bench-margins-11 con repetitions 3

## Plan

1. Repeticiones: `bench.js run` toma `CONCLUSIVE_REPETITIONS` (3) de `checkpoint.js` como default; el checkpoint añade `conclusive` y la línea `Inconclusive` con n < 3, y muestra el IC 95 % del ratio de tokens por escenario.
2. Corpus `reserved` en `scenarios-reserved/` con `salas` (reservas de salas, perfil `saas-small`), su entrega de referencia en `__fixtures__/reference/salas/` y el digest fijado en `scenarios.test.js`.
3. `margins.json` declara `bench-margins-11`: umbrales de `bench-margins-10` con repetitions 3.
4. Contrato: `openspec/specs/bench/spec.md` (REQ-bench-001, 004 y 005) con el corpus reservado, las tres repeticiones por defecto, `Inconclusive`, el IC y `bench-margins-11`.
5. Docs: README del banco, `docs/benchs` (en/es) y el roadmap.

## Decisions

- Respuestas del usuario (2026-10-21): default 3 para todo `run`; «no concluyente» como campo y línea aparte, sin tocar `continue`/`revise` ni el código de salida; corpus propio con un escenario de perfil `saas-small`; umbrales de `bench-margins-10`; ids del corpus reservado distintos de los del default, con test.
- Las pruebas antiguas de `run` que no trataban de repeticiones pasan `--repetitions 1` explícito, en lugar de ejecutar tres veces.
- `CONCLUSIVE_REPETITIONS` vive en `checkpoint.js`, la regla que lo usa, y `bench.js` lo importa como default.
- La señal `public-contract` la disparó el README de la semilla `salas`; no se pudo retirar porque sale del diff, y el contrato real que cambia es la spec del banco, que se actualiza.
- El IC del informe sale de #342 («con n e IC en el informe»): el checkpoint ya lo calculaba y no lo mostraba.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-21T20:44:46.818Z)
- ev-2: check-run for checks-pass (2026-10-21T20:46:22.371Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-21T20:46:22.371Z)
- ev-4: living-doc-current for living-doc (2026-10-21T20:46:27.703Z)
<!-- ospec:evidence:end -->
