# approval-provenance-limit

## Intent and acceptance

record gate y la resolución de ambiguous-intent aceptan cualquier texto en --source, y la skill idd está a 10 B de su techo sin decir que la procedencia de las respuestas no se verifica (#343, #405)

Acceptance: Un --source fuera de user o user-unverified se rechaza con invalid-source en record gate y en ambiguous-intent; la skill idd mide ≤ 11 264 B en CRLF en todos los destinos, con el detalle de arquitectura y de las categorías de hechos en skills/idd/references/ enlazado; la nota de procedencia (--source y --quote los declara el agente, incluido review-limit) está en references, en la spec de IDD y en docs/README.md y docs/en/README.md

## Plan

1. Fuente de la respuesta (#343): `GATE_SOURCES = [user, user-unverified]` en `idd-contract.js`; `recordGate` y la resolución de `ambiguous-intent` en `idd-record.js` rechazan otro valor con `invalid-source`. Uso del CLI, REQ-idd-008 con escenario, tests de `idd-record`, `idd-next` y `ospec`.
2. Margen de la skill y nota de procedencia (#405, #343): `skills/idd/references/architecture.md` (ADR, escenarios, fitness, `adr-promotion`, `references`, `warnings`), `open-facts.md` (7 categorías) y `approvals.md` (qué declara el agente y qué no verifica el CLI, `review-limit` incluido); la skill enlaza cada una. Tests en `idd-protocol.test.js`. Nota también en README EN/ES, `docs/README.md`, `docs/en/README.md` y `openwiki/idd/flujo-idd.md`. CHANGELOG y roadmap.

## Decisions

- Alcance elegido por el usuario el 2026-10-23: mover arquitectura y categorías (solo categorías y procedencia dejaban ~120 B de margen) y aplicar la lista de fuentes también a `ambiguous-intent`.
- La lista se comprueba solo en la entrada: `validateState` no la exige, así que un `state.yaml` guardado con otro `source` (p. ej. `AskUserQuestion`) sigue siendo válido y se reanuda igual.
- El techo de `idd-protocol.test.js` sigue en 12 KiB; la skill queda en 11 074 B en CRLF. Bajar el techo es el ratchet de E4.3, no este cambio.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-23T19:17:20.892Z)
- ev-2: check-run for checks-pass (2026-10-23T19:22:58.671Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-23T19:22:58.671Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-10-23T19:22:58.671Z)
- ev-5: check-run for checks-pass (2026-10-23T19:24:10.503Z)
- ev-6: contract-spec-and-test for contract-spec-and-test (2026-10-23T19:24:10.503Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-10-23T19:24:10.503Z)
- ev-8: check-run for checks-pass (2026-10-23T19:25:19.746Z)
- ev-9: contract-spec-and-test for contract-spec-and-test (2026-10-23T19:25:19.746Z)
- ev-10: adr-impact-declaration for adr-impact-declaration (2026-10-23T19:25:19.746Z)
- ev-11: living-doc-current for living-doc (2026-10-23T19:25:19.825Z)
<!-- ospec:evidence:end -->
