# idd-kind-change

## Intent and acceptance

Un cambio IDD no puede pasar de bug a feature ni al revés: KIND_RANK les da el mismo rango y record intent lo rechaza con intent-conflict, así que un cambio abierto con el kind equivocado queda atascado sin poder abandonarse (#491)

Acceptance: feature → bug se acepta como subida; bug → feature reemplaza el intent, quita bug-fix, retira repro-test pendiente y abre la puerta kind-change, que solo el usuario resuelve y que bloquea close; volver a bug restaura bug-fix y reabre repro-test; record gate --open rechaza kind-change; un kind menor sigue rechazado; el catálogo de Go incluye la puerta; node scripts/check.js y el gate de Go pasan

## Plan

<!-- ospec:plan:start -->
- Files: `README.es.md`, `README.md`, `docs/en/README.md`, `docs/onboarding/tech-lead.md`, `handbook/idd/flujo-idd.md`, `handbook/proteccion/hooks.md`, `internal/iddsession/catalog.json`, `openspec/specs/idd/spec.md`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-contract.test.js`, `scripts/lib/idd-next.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-record.test.js`, `scripts/lib/idd-refusals.js`, `scripts/ospec.test.js`, `skills/idd/SKILL.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- bug → feature no se permite sin más porque retira repro-test: record intent lo aplica y abre kind-change, que bloquea close hasta la respuesta del usuario, con el turn fence de cualquier puerta; feature → bug sube la exigencia de tests y se acepta como una subida
- Un rechazo no necesita deshacer nada especial: se resuelve kind-change con las palabras del usuario y se vuelve a bug, que la derivación devuelve a bug-fix y addSignal reabre repro-test
- kind-change va en GATES detrás de ambiguous-intent y antes de open-facts, para que el usuario apruebe el kind antes de contestar las categorías del feature
- skills/idd/SKILL.md no gana una viñeta para kind-change: excedía los techos de contexto versionados (E4.3) y la pregunta de la puerta en next ya dice qué hacer si el usuario lo rechaza, así que la regla queda en el CLI (ADR 0003)
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-11T10:16:40.862Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-11-11T10:18:47.108Z)
- ev-3: check-run for checks-pass (2026-11-11T10:22:26.580Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-11-11T10:22:26.580Z)
- ev-5: living-doc-current for living-doc (2026-11-11T10:22:36.294Z)
<!-- ospec:evidence:end -->
