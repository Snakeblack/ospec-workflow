# open-facts-by-risk

## Intent and acceptance

Una feature solo tiene que preguntar al menos una categoría de open-facts cuando el cambio tiene public-contract, persistent-data o security-boundary; sin esas señales basta la cobertura con --cite y --quote, y una de ellas que llegue después vuelve a exigir la pregunta (E1.75).

Acceptance: Una feature sin señales de riesgo se abre y cierra con todas sus categorías citadas; una con public-contract en el plan sigue rechazada sin pregunta; una cuyo diff deriva persistent-data vuelve a exigir una pregunta y abre open-facts antes de poder cerrar.

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `handbook/idd/flujo-idd.md`, `openspec/specs/idd/spec.md`, `scripts/configure/idd-protocol.test.js`, `scripts/lib/idd-check.js`, `scripts/lib/idd-check.test.js`, `scripts/lib/idd-close.js`, `scripts/lib/idd-close.test.js`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-facts.js`, `scripts/lib/idd-facts.test.js`, `scripts/lib/idd-next.js`, `scripts/lib/idd-next.test.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-record.test.js`, `scripts/lib/idd-refusals.js`, `scripts/lib/test-support/ospec-cli.js`, `scripts/ospec.js`, `scripts/ospec.output.test.js`, `skills/idd/references/open-facts.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Las tres señales de riesgo son IMPACT_SIGNALS de idd-impact.js (public-contract, persistent-data, security-boundary); E1.79 las sustituirá por su nivel.
- La condición se evalúa sobre las señales del estado: record intent (y la subida de tipo) la exige en la misma escritura que declara el plan; una señal que llega después deja la cobertura sin preguntar, y next devuelve ask-open-facts antes que los gates y las obligaciones; close se niega con facts-unasked.
- El record intent repetido de una feature que no preguntó y ya tiene una señal de riesgo acepta solo convertir categorías citadas en --open-fact: mismo intent, mismas citas en el resto; abre una entrada open-facts nueva, así el turno de apertura es el de las preguntas.
- Precisa la anterior: ask-open-facts ocupa el sitio de open-facts en el orden de gates; abandon, ambiguous-intent y kind-change abiertos se responden antes, y los demás gates y las obligaciones después. check da needs-decision sobre open-facts y la salida de texto imprime el how del paso.
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-16T22:42:24.614Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-11-16T22:42:24.614Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-16T22:42:24.614Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-16T22:43:23.344Z)
- ev-5: check-run for checks-pass (2026-11-16T22:45:09.339Z)
- ev-6: contract-spec-and-test for contract-spec-and-test (2026-11-16T22:45:09.339Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-11-16T22:45:09.339Z)
- ev-8: living-doc-current for living-doc (2026-11-16T22:45:09.497Z)
<!-- ospec:evidence:end -->
