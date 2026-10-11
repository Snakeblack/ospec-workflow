# decision-records-model

## Intent and acceptance

Tres registros de decisión (ADR, TSR y DC), cada uno con plantilla y lint.

Acceptance: Los fixtures distinguen un ADR válido, un ADR tecnológico (aviso) y una decisión de desarrollo mal clasificada como ADR.

## Plan

1. Publish `ospec-decision-record/v1` and lint JSON fixtures for a valid ADR, a technological ADR, a development decision classified as an ADR, a missing driver and a TSR missing an ADR or a dated source. Warnings do not reject the record.
2. Add the ADR, TSR and DC templates the foundation skill already reads. Leave the technology record in the technical baseline section.
3. Ship the schema with the foundation runtime and mark E2.4 done on the roadmap. E2.5, E2.6 and E3 stay out.

## Decisions

- **Stack list accompanies the record.** `stack` on the ADR, or the `stack` argument of `lintDecisionRecord`, which wins. The lint does not read manifests or the technology record. A name matches the decision text as a whole phrase, ignoring case.
- **A development decision declares `kind: dc`.** Classifying it as an ADR sets `as: adr`. That is the warning `misclassified-development-decision`. The record stays valid.
- **A driver is an id.** `scenario`, `constraint` or `assumption`, plus an id. Context prose without an id is `missing-driver`, a warning.
- **Foundation output stays.** Templates document the TSR and the DC. Foundation still writes technology in `docs/architecture/technical-baseline.md`. Separate files under `docs/architecture/technology/` are the model location, not this item's writer.
- **TSR warnings.** No implemented ADR is `missing-adr`. No source dated `YYYY-MM-DD` is `missing-dated-source`. Both can apply. The record stays valid.
- **JSON fixtures, not a markdown parser.** The human templates are Markdown. The lint reads the JSON document model, the same split E2.1 used for the knowledge map. No new `ospec` command.
- **Not in this item:** inferred ADRs (E2.5), dogfood of this repository (E2.6), living-document wiring and promotion checks (E3.1), and the extra M13 checks (option count, simple option, invented measures).

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-10T20:39:36.739Z)
- ev-2: living-doc-current for living-doc (2026-10-10T20:40:00.110Z)
<!-- ospec:evidence:end -->
