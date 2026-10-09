# knowledge-map-contract

## Intent and acceptance

Knowledge-map contract for foundation: schema, slot states, six profiles and slot-to-decision links, with valid and invalid fixtures.

Acceptance: The six profiles each have their mandatory slots and one example; the schema distinguishes unknown from n/a; valid and invalid fixtures check states, provenance and slot-to-decision links, including assumptions with a review trigger and deferred slots with an owner; a quality scenario states stimulus, observable response and a measure only when the project defines one.

## Plan

1. Publish `ospec-knowledge-map/v1` and the slot catalog for the six profiles, with one valid example each and invalid fixtures for state, provenance, slot-to-decision links and quality-scenario measures.
2. Validate fixtures with the existing JSON Schema interpreter plus the catalog rules (mandatory slots, known decisions).
3. Point the foundation skill at `docs/architecture/knowledge-map.yaml`. Leave question selection and `ospec foundation next` for E2.2.

## Decisions

- **Project file:** `docs/architecture/knowledge-map.yaml`, chosen by the user. `idd/` cannot hold project knowledge (REQ-idd-002), `openspec/` is SDD-only, and `.ospec/` is gitignored.
- **English identifiers** (`unknown`, `n/a`, `assumed`, `confirmed`, `deferred`), matching the skill and the other schemas. The roadmap's Spanish names are the same states.
- **Mandatory means answered.** A profile's mandatory slot may be `confirmed`, `assumed`, `n/a` or `deferred`, and MUST NOT stay `unknown`. `regulated` must answer trust and backup; `public-library` must answer licenses and versioning and does not require backup; `prototype` does not require backup.
- **No invented measure.** A quality scenario may omit `measure`. If it has one, it also needs `measure_source`.
- **Not in this item:** the deterministic round engine (E2.2), ADR lint (E2.4) and a YAML parser. Fixtures are JSON of the same document model.
- **Check unblock:** `cli.test.js` removes the evidence-link junction with `unlink`. On Node 24, `rmSync` without `recursive` throws `EISDIR` and leaves the junction in the tree, so `ospec check` cannot record a stable run.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-09T20:35:36.148Z)
- ev-2: living-doc-current for living-doc (2026-10-09T20:36:23.525Z)
<!-- ospec:evidence:end -->
