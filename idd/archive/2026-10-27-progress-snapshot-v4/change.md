# progress-snapshot-v4

## Intent and acceptance

ospec snapshot --schema-version 4 emite el snapshot de avance v4: el v3 tal cual más la documentación del proyecto (problema, objetivos, alcance, entregables y decisiones), con las decisiones sacadas de los ADRs aceptados o sustituidos de docs/architecture/decisions/ y de la columna ADRs del roadmap, y los textos para el cliente del fichero de avance; el v1, el v2 y el v3 no cambian

Acceptance: Con --schema-version 4, ospec snapshot emite un JSON que cumple schemas/progress-snapshot/v4.schema.json y las reglas del v3, con problem, objectives, includes, excludes, deliverables y decisions solo cuando el fichero de avance o los ADRs los dan; un ADR accepted o superseded sin motivo ni marca internal, un texto del fichero de avance para un ADR que no existe o no se publica, un superseded by que nombra una sustituta inexistente o no mayor, una columna ADRs que nombra un ADR inexistente, un entregable con una fase que el roadmap no tiene o un texto o lista fuera de los límites terminan con código 1, el fichero y la línea, sin escribir nada; sin docs/architecture/decisions/ no hay decisiones ni error; el v1, el v2 y el v3 salen igual; la documentación es agnóstica y ningún flujo, hook, check ni gate lo ejecuta

## Plan

<!-- ospec:plan:start -->
- Files: `CHANGELOG.md`, `docs/README.md`, `docs/roadmaps/harness-evolution.md`, `openspec/specs/idd/spec.md`, `schemas/progress-snapshot/fixtures/invalid-v4.json`, `schemas/progress-snapshot/fixtures/valid-v4.json`, `schemas/progress-snapshot/v4.schema.json`, `scripts/lib/idd-refusals.js`, `scripts/lib/k1-scope-guard.test.js`, `scripts/lib/progress-snapshot-v2.js`, `scripts/lib/progress-snapshot-v3.js`, `scripts/lib/progress-snapshot-v4.js`, `scripts/lib/progress-snapshot-v4.test.js`, `scripts/lib/progress-snapshot.js`, `scripts/ospec.js`, `scripts/ospec.test.js`
- Work units: 2
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Las secciones del v4 se leen en la misma pasada que las del v2: parseProgress acepta un parámetro sections opcional que abre los ## que conoce y recibe sus bloques; sin él la sintaxis y los mensajes del v2 y el v3 son los de antes, y un error sale siempre en la primera línea del fichero.
- roadmapPhases guarda las celdas de cabecera y de fila de cada fase para que el v4 lea la columna ADRs; el v1, el v2 y el v3 no las usan y su salida no cambia.
- La cabecera de un ADR la lee un lector propio del v4 en lugar de parseAdrMarkdown, porque los errores necesitan la línea de Status y Date y el número de superseded by, que parseAdrMarkdown no conserva.
- Fuera de las respuestas del gate: una decisión del fichero de avance que no lleva motivo ni - internal da progress-invalid en su línea, en vez de decisions-invalid en el ADR, porque el arreglo está en ese fichero; un ADR publicado sin ninguna entrada sigue dando decisions-invalid en su Status.
- Las secciones del v4 se leen en la misma pasada que las del v2: parseProgress acepta un parámetro sections opcional que abre los ## que conoce y recibe sus bloques; sin él la sintaxis y los mensajes del v2 y el v3 son los de antes, y el error que sale es siempre el primero en el orden del fichero.
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-27T22:51:16.724Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-10-27T22:51:16.724Z)
- ev-3: migration-test for migration-compat-and-test (2026-10-27T22:51:37.029Z)
- ev-4: check-run for checks-pass (2026-10-27T22:53:46.751Z)
- ev-5: contract-spec-and-test for contract-spec-and-test (2026-10-27T22:53:46.751Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-10-27T22:53:46.751Z)
- ev-7: living-doc-current for living-doc (2026-10-27T22:53:46.885Z)
<!-- ospec:evidence:end -->
