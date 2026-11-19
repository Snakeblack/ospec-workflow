# decision-bullet-ends

## Intent and acceptance

Los records de ospec close cortan un bullet de Decisions donde Markdown lo termina, sin pegarle el encabezado ni el párrafo que le sigue

Acceptance: Con un bullet de Decisions seguido de un encabezado ### (con o sin línea en blanco entre medias), ospec close --json devuelve el summary del bullet sin el encabezado ni el texto de la subsección; las líneas sangradas siguen uniéndose al bullet

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-19T09:22:12.075Z):

> continua

Answer 1 — open-facts, user, 2026-11-19T22:19:15.134Z:

> lo recomendado

Answer 2 — retract persistent-data, user, 2026-11-19T22:24:50.000Z:

> si
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `openspec/specs/idd/spec.md`, `scripts/lib/idd-close.js`, `scripts/lib/idd-close.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Un bullet de Decisions termina donde Markdown termina un elemento de lista: sigue con las líneas sangradas y con las no vacías justo debajo (continuación perezosa); un encabezado, una línea --- o una valla de código lo terminan siempre, y una línea en blanco seguida de una línea sin sangría que no es un bullet también lo termina (respuesta 1 del usuario)
- Los bullets de una subsección ### dentro de Decisions siguen siendo records: REQ-idd-024 cuenta los bullets de primer nivel de toda la sección y los topics ya guardados conservan su número (respuesta 2 del usuario)
- Prior decision (memory): close: el registro del último bullet absorbe el párrafo siguiente -> idd/archive/2026-10-25-delivery-branching/change.md: current
- Las líneas de una valla de código son código: ni abren un record ni se suman a uno, aunque empiecen por un guion
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-19T22:20:25.869Z)
- ev-2: check-run for checks-pass (2026-11-19T22:22:44.910Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-19T22:22:44.910Z)
- ev-4: living-doc-current for living-doc (2026-11-19T22:24:57.488Z)
<!-- ospec:evidence:end -->
