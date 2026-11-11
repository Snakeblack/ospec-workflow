# review-limit-oversized-correction

## Intent and acceptance

Con las revisiones de confianza agotadas y la última en correction-required, una corrección que no cabe en una corrección acotada deja el cambio en bucle: ospec check pide review correct, review correct pide review start, review start responde review-limit y el gate review-limit no se abre nunca.

Acceptance: En ese estado, ospec check termina la revisión como escalated, abre el gate review-limit y next pide resolverlo; resuelto el gate, ospec review start abre la revisión sucesora con los hallazgos bloqueantes sin resolver como predecessor_findings.

## Plan

<!-- ospec:plan:start -->
- Files: `openspec/specs/idd/spec.md`, `scripts/lib/idd-review.js`, `scripts/lib/idd-review.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- El gate se abre en ospec check y no en ospec review start: un rechazo de start no persiste estado, y REQ-idd-016 ya dice que check abre review-limit. check termina la revisión como escalated a la vez, para que el gate solo exista con la revisión actual terminal.
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-11T16:52:46.219Z)
- ev-2: check-run for checks-pass (2026-11-11T16:55:57.567Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-11-11T16:55:57.567Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-11-11T16:55:57.567Z)
- ev-5: migration-test for migration-compat-and-test (2026-11-11T16:57:28.056Z)
- ev-6: living-doc-current for living-doc (2026-11-11T16:57:38.403Z)
<!-- ospec:evidence:end -->
