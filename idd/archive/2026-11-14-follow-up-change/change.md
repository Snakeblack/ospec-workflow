# follow-up-change

## Intent and acceptance

Un cambio de seguimiento declara con ospec record completes el cambio cerrado que completa, pasa su ceremonia entera y no añade una entrada propia al changelog.

Acceptance: Un cambio que declara completar a otro archivado cuya entrada sigue bajo [Unreleased] cierra sin añadir entrada, y su estado archivado nombra al que completa; si la entrada del original ya salió en una versión o el original no existe, la declaración se rechaza con su remedio; un cambio que no declara nada escribe su entrada como hoy.

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `handbook/idd/entrega.md`, `openspec/specs/idd/spec.md`, `scripts/lib/idd-changelog.js`, `scripts/lib/idd-changelog.test.js`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-contract.test.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-record.test.js`, `scripts/lib/idd-refusals.js`, `scripts/ospec.js`, `scripts/ospec.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Un seguimiento declara el cambio que completa en vez de reabrirlo: ospec no tiene que saber si está fusionado y la evidencia y la revisión grabadas no quedan desfasadas.
- La entrada del cambio completado se busca bajo [Unreleased] por el id que cierra su línea, no por su texto, así que sigue encontrándose tras corregirla.
- No se encadenan seguimientos: el de un seguimiento nombra al cambio original, que es el que tiene la entrada.
- close vuelve a comprobar la declaración antes de grabar nada, y si la entrada ya se publicó se rechaza con --clear como remedio, en vez de escribir una entrada sin avisar.
- record completes no abre ningún gate: close dice siempre en su salida que no añade entrada y qué cambio completa.
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-14T17:16:27.755Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-11-14T17:16:27.755Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-14T17:16:27.755Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-14T17:16:40.643Z)
- ev-5: living-doc-current for living-doc (2026-11-14T17:16:40.843Z)
<!-- ospec:evidence:end -->
