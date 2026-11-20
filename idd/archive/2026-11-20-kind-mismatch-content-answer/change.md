# kind-mismatch-content-answer

## Intent and acceptance

Un refactor que quita de la documentación una línea que solo parece un contrato puede conservar su kind con la respuesta del usuario

Acceptance: ospec check rechaza con kind-mismatch un refactor que quita una línea de documentación que casa con un patrón de contrato (API o selector) fuera de los documentos de contrato, y su how ofrece ospec record retract --signal public-contract con la respuesta del usuario; con esa respuesta, que cubre exactamente las líneas quitadas, check y close aceptan el refactor; una línea quitada nueva devuelve el rechazo; una línea quitada de un documento de contrato sigue sin salida salvo subir el kind y la respuesta se rechaza nombrándolo

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-20T01:17:29.442Z):

> la recomendada (arreglar en el CLI el falso positivo de B9: una línea quitada de documentación que no es documento de contrato declarado y que solo casa por contenido se puede retirar con la respuesta del usuario, como E1.58 con public-contract)
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `README.es.md`, `README.md`, `docs/en/README.md`, `docs/en/quickstart.md`, `handbook/agentes/catalogo.md`, `handbook/idd/flujo-idd.md`, `handbook/proteccion/hooks.md`, `handbook/quickstart.md`, `internal/iddsession/catalog.json`, `openspec/specs/idd/spec.md`, `scripts/fixtures/context-baseline.json`, `scripts/lib/idd-check.js`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-contract.test.js`, `scripts/lib/idd-next.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-record.test.js`, `scripts/lib/idd-refusals.js`, `scripts/lib/idd-signals.js`, `scripts/lib/idd-signals.test.js`, `scripts/ospec.impact.test.js`, `scripts/ospec.js`, `skills/idd/SKILL.md`, `skills/idd/references/approvals.md`
<!-- ospec:plan:end -->

Origen. Al reescribir sdd-tasks en E1.105, `ospec check` rechazó el refactor con `kind-mismatch` por quitar el ejemplo `| **Verifiable** | "Test: `POST /login` returns 401 without token" | … |`: B9 trataba como contrato cualquier línea de un `.md` que casara con `GET|POST|PUT|PATCH|DELETE /`, y no había más salida que subir el kind. Una primera versión registraba la respuesta como retirada de `public-contract`; se descartó porque, sin señal registrada, la valla de turnos no tenía turno con el que comparar.

## Decisions

<!-- ospec:decisions:start -->
- La respuesta del usuario se pide en un gate nuevo, contract-removal, que abre ospec check como checks-changed: así la valla de turnos de los gates (E1.49) cubre la respuesta; una retirada de public-contract no tenía señal de la que tomar el turno y dejaba registrar --source user sin preguntar
- contract-removal guarda en hits cada línea quitada que casa con un patrón de contrato fuera de los documentos de contrato (<file> removes <label>: <line>); una entrada resuelta mantiene el kind solo para esas líneas, una línea nueva abre otra entrada y una entrada sin responder sigue al diff y se borra cuando no queda nada que preguntar
- Una línea quitada de un documento de contrato sigue rechazando el refactor con kind-mismatch, sin gate: es el contrato mismo, como en REQ-idd-015
- REQ-idd-008 pasa de nueve a diez gates, y los README, el quickstart y el handbook dicen diez
- El protocolo de IDD crece 212 bytes por target al nombrar contract-removal; el crecimiento queda concedido con su motivo en scripts/fixtures/context-baseline.json
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-20T01:21:38.577Z)
- ev-2: check-run for checks-pass (2026-11-20T01:23:52.087Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-11-20T01:23:52.087Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-11-20T01:23:52.087Z)
- ev-5: repro-run-pair for repro-test (2026-11-20T01:34:05.035Z)
- ev-6: migration-test for migration-compat-and-test (2026-11-20T01:34:08.251Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-11-20T01:34:58.160Z)
- ev-8: check-run for checks-pass (2026-11-20T01:37:17.213Z)
- ev-9: contract-spec-and-test for contract-spec-and-test (2026-11-20T01:37:17.213Z)
- ev-10: adr-impact-declaration for adr-impact-declaration (2026-11-20T01:37:17.213Z)
- ev-11: migration-test for migration-compat-and-test (2026-11-20T01:37:28.255Z)
- ev-12: living-doc-current for living-doc (2026-11-20T01:37:41.691Z)
<!-- ospec:evidence:end -->
