# bench-knowledge-scenarios

## Intent and acceptance

E4.17: tres escenarios nuevos del banco (dos sesiones con memoria, brownfield con ADR y Check:, sink de seguridad fuera de auth/), escritos y congelados con su digest sin ejecutarlos

Acceptance: Un corpus nuevo carga y valida los tres escenarios con su digest fijado en un test; sus checks ocultos pasan sobre una entrega de referencia y la aceptación falla sobre la semilla; ningún run los ejecuta; el diff no toca IDD

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `openspec/specs/bench/spec.md`, `scripts/evals/bench/README.md`, `scripts/evals/bench/__fixtures__/reference-knowledge/adjuntos/src/app.js`, `scripts/evals/bench/__fixtures__/reference-knowledge/pedidos/src/app.js`, `scripts/evals/bench/__fixtures__/reference-knowledge/reparto/session-1/src/gastos.js`, `scripts/evals/bench/__fixtures__/reference-knowledge/reparto/session-2/src/gastos.js`, `scripts/evals/bench/bench.js`, `scripts/evals/bench/bench.test.js`, `scripts/evals/bench/checks-knowledge.test.js`, `scripts/evals/bench/scenarios-knowledge/adjuntos/checks.js`, `scripts/evals/bench/scenarios-knowledge/adjuntos/repo/README.md`, `scripts/evals/bench/scenarios-knowledge/adjuntos/repo/package.json`, `scripts/evals/bench/scenarios-knowledge/adjuntos/repo/src/app.js`, `scripts/evals/bench/scenarios-knowledge/adjuntos/repo/src/notas.js`, `scripts/evals/bench/scenarios-knowledge/adjuntos/repo/test/app.js`, `scripts/evals/bench/scenarios-knowledge/adjuntos/scenario.json`, `scripts/evals/bench/scenarios-knowledge/pedidos/checks.js`, `scripts/evals/bench/scenarios-knowledge/pedidos/repo/README.md`, `scripts/evals/bench/scenarios-knowledge/pedidos/repo/docs/architecture/decisions/0001-dominio-sin-infraestructura.md`, `scripts/evals/bench/scenarios-knowledge/pedidos/repo/package.json`, `scripts/evals/bench/scenarios-knowledge/pedidos/repo/scripts/check-limites.js`, `scripts/evals/bench/scenarios-knowledge/pedidos/repo/src/app.js`, `scripts/evals/bench/scenarios-knowledge/pedidos/repo/src/domain/pedidos.js`, `scripts/evals/bench/scenarios-knowledge/pedidos/repo/src/infra/almacen.js`, `scripts/evals/bench/scenarios-knowledge/pedidos/repo/src/infra/mailer.js`, `scripts/evals/bench/scenarios-knowledge/pedidos/repo/test/pedidos.js`, `scripts/evals/bench/scenarios-knowledge/pedidos/scenario.json`, `scripts/evals/bench/scenarios-knowledge/reparto/checks.js`, `scripts/evals/bench/scenarios-knowledge/reparto/repo/README.md`, `scripts/evals/bench/scenarios-knowledge/reparto/repo/package.json`, `scripts/evals/bench/scenarios-knowledge/reparto/repo/src/gastos.js`, `scripts/evals/bench/scenarios-knowledge/reparto/repo/test/gastos.js`, `scripts/evals/bench/scenarios-knowledge/reparto/scenario.json`, `scripts/evals/bench/scenarios.js`, `scripts/evals/bench/scenarios.test.js`
- Work units: 2
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- harnessDigest excluye todo directorio scenarios*/: hoy scenarios-reserved/salas/checks.js entraba en el digest del harness, contra su contrato (escenarios, fixtures, records y tests fuera)
- schema_version 2 solo para el escenario de dos sesiones (sessions y memory); los otros dos escenarios del corpus knowledge siguen en schema 1
- memory.seeded y memory.contradictory son { title, content }: la observación exacta que el banco escribirá en Engram antes de la sesión 2
- un corpus con runnable: false lo lista bench.js list, y bench.js run lo rechaza con código 1 antes de tomar el lock
- la semilla de adjuntos no tiene directorio auth/: el gateway autentica, como en salas, y ninguna ruta del escenario deriva security-boundary
- los hechos ocultos no se repiten en el README del banco, el roadmap ni change.md, como en salas y receta-spa
<!-- ospec:decisions:end -->

- El diff no toca IDD: solo el cargador y el CLI del banco, sus tests, los escenarios, sus referencias, la spec del banco y el roadmap.
- Cada escenario lleva, además de su referencia, una contraprueba en `checks-knowledge.test.js`: en `reparto`, los céntimos sobrantes a los últimos (lo que dice la memoria contradictoria) fallan los dos checks de F1 de la sesión 2; en `pedidos`, importar el mailer desde el dominio o editar el ADR falla solo `adr-respetado`; en `adjuntos`, leer el nombre pedido sin acotarlo a la carpeta de la nota falla solo `sin-salir-de-la-carpeta`.
- El ADR de la semilla de `pedidos` pasa el lint de `decision-records` sin avisos, y `parseFitnessChecks` lee su único `Check:`, que pasa sobre la semilla y falla con un import de infraestructura en el dominio.
- El digest del corpus `knowledge` queda fijado en `scenarios.test.js` (`e76b7dd75ec3`), y los de `default`, `greenfield` y `reserved` no cambian.
- El diff deriva `public-contract` por el README de la semilla de `adjuntos` y `persistent-data` por el `writeFileSync` de sus checks ocultos, que montan los adjuntos en un temporal. El formato que sí cambia es el de `scenario.json` (schema 2), y `migration-compat-and-test` se cubre con los tests de escenarios y de checks: los schema 1 cargan igual, sus digests siguen fijados y sus checks pasan sobre sus referencias. La sugerencia `adr-promotion` no aplica: ese README es parte de un escenario, no una API de ospec.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-28T18:22:26.051Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-10-28T18:22:26.051Z)
- ev-3: migration-test for migration-compat-and-test (2026-10-28T18:22:46.000Z)
- ev-4: check-run for checks-pass (2026-10-28T18:24:05.002Z)
- ev-5: contract-spec-and-test for contract-spec-and-test (2026-10-28T18:24:05.002Z)
- ev-6: living-doc-current for living-doc (2026-10-28T18:24:05.112Z)
<!-- ospec:evidence:end -->
