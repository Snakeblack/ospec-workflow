# idd-change-abandon

## Intent and acceptance

ospec abandon archiva como abandoned, con la respuesta del usuario y sin exigir evidencia, un cambio IDD sustituido, descartado o abierto por error.

Acceptance: Un cambio abierto con obligaciones pendientes y señales activas pasa a idd/archive/<fecha>-<id>/ con status abandoned y su motivo, sin ejecutar checks ni revisiones; sin la respuesta del usuario el comando se niega; ospec status y ospec next dejan de listarlo, close no devuelve sus decisiones para la memoria ni escribe entrada en el changelog, y un cambio que se entrega sigue sin cerrar sin su evidencia.

## Plan

<!-- ospec:plan:start -->
- Files: `README.es.md`, `README.md`, `docs/roadmaps/harness-evolution.md`, `handbook/idd/flujo-idd.md`, `internal/iddsession/catalog.json`, `openspec/specs/idd/spec.md`, `scripts/lib/idd-check.js`, `scripts/lib/idd-close.js`, `scripts/lib/idd-close.test.js`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-contract.test.js`, `scripts/lib/idd-next.js`, `scripts/lib/idd-next.test.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-record.test.js`, `scripts/lib/idd-refusals.js`, `scripts/lib/ospec-doctor.js`, `scripts/lib/ospec-doctor.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`, `skills/idd/references/approvals.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- ospec abandon no archiva nada: abre el gate abandon con el motivo y, si lo hay, el cambio que lo sustituye; el cambio se archiva cuando el usuario responde y el gate se resuelve con record gate. Otro ospec abandon con el gate abierto sustituye la pregunta y --cancel la retira, como record base.
- El gate abandon va el primero en el orden de los gates, para que se pueda responder con cualquier otro gate abierto, también ambiguous-intent.
- El estado archivado lleva status abandoned y un bloque abandoned con at, reason y superseded_by. La respuesta y su fuente quedan en la entrada resuelta del gate abandon, donde las escribe la valla de turnos, y no se duplican en el bloque para que no puedan discrepar.
- Abandonar no exige ni graba evidencia, no toca change.md, el changelog ni el árbol de trabajo, no devuelve registros de memoria y borra .ospec/runs/<id>/. Un archivado interrumpido lo termina ospec abandon --change <id>.
- La guía del agente va en references/approvals.md y en ospec --help; los rechazos de close y de withdraw no nombran abandon, para que no sirva de atajo ante una obligación pendiente. SKILL.md no cambia: está en su techo de bytes.
- El archivo se lee por nombre exacto <fecha>-<id>, no por sufijo, y un cambio completado por un seguimiento es el último cierre de ese id: un abandono posterior del mismo id no lo oculta, y un id que es sufijo de otro ya no se confunde con él.
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: adr-impact-declaration for adr-impact-declaration (2026-11-15T08:40:42.363Z)
- ev-2: check-run for checks-pass (2026-11-15T08:43:16.897Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-11-15T08:43:16.897Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-11-15T08:43:16.897Z)
- ev-5: migration-test for migration-compat-and-test (2026-11-15T08:43:33.629Z)
- ev-6: living-doc-current for living-doc (2026-11-15T08:43:40.045Z)
<!-- ospec:evidence:end -->
