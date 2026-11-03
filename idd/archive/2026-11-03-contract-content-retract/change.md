# contract-content-retract

## Intent and acceptance

Una doc que solo cita una ruta o un selector existente (POST /api/…, `#hex`) deriva public-contract por contenido con source diff, y no hay salida honrada: record retract la rechaza con signal-confirmed-by-diff y la retirada con la respuesta del usuario de #416 solo cubre persistent-data (#423, E1.58)

Acceptance: public-contract que solo deriva el contenido de una doc se retira con record retract --answer … --source user, atado a los hits <razón>: <línea> que vio el usuario, y contract-spec-and-test queda withdrawn; una línea de contrato añadida o cambiada después devuelve la señal; sin --answer se sigue rechazando con signal-confirmed-by-diff y su how ofrece la respuesta; si una ruta del diff ya deriva la señal, la respuesta se rechaza con retract-answer-refused; un test por caso

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `openspec/specs/idd/spec.md`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-record.test.js`, `scripts/lib/idd-refusals.js`, `scripts/lib/idd-signals.js`, `scripts/lib/idd-signals.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Se generaliza la retirada con respuesta de #416 a public-contract en lugar de duplicarla: contractHits devuelve todos los hits de documentación como persistentHits (<fichero> adds <etiqueta>: <línea>), deriveSignals y diffConfirmation los usan con userRetracted, y la validación del estado admite las dos señales
- Una línea de contrato en un documento de contrato (contracts.documents o sus patrones base, como docs/api/** u OpenAPI) cuenta como si una ruta derivara public-contract: la respuesta del usuario se rechaza con retract-answer-refused y la obligación se cumple con la doc y un test (respuesta del usuario: «A»)
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-03T19:29:25.270Z)
- ev-2: check-run for checks-pass (2026-11-03T19:32:55.621Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-11-03T19:32:55.621Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-11-03T19:32:55.621Z)
- ev-5: migration-test for migration-compat-and-test (2026-11-03T19:33:33.216Z)
- ev-6: living-doc-current for living-doc (2026-11-03T19:34:07.693Z)
<!-- ospec:evidence:end -->
