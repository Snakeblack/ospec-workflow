# Apply Progress

## 2026-09-01 — Work units 1–3 complete

- [x] 1.1–1.5 — Added a change-local Candidate/v2 CAS with canonical UTF-8 bytes, digest-derived references, non-symlink confinement, atomic no-clobber publication, idempotency, and structured fail-closed recovery reasons.
  - Evidence: `node --test scripts/lib/verify-lineage-candidate-store.test.js` — 6/6 passing.
- [x] 2.1–2.6 — Integrated additive `candidate_recovery` references into verify lineage creation and mutable transitions. Recovery is digest + canonical CandidateId validated; ID-only legacy lineages remain readable and reject mutation without a synthetic preimage.
  - Evidence: `node --test scripts/lib/verify-lineage.test.js` — 17/17 passing.
- [x] 3.1–3.3 — Added separate-process restart coverage for genesis and successor recovery, plus orphan-temp/post-publication boundaries. Registered the two new successor files in the K1 exclusion guard and retained its non-authorizing semantics.
  - Evidence: focal combined test run — 23/23 passing; `node --test scripts/lib/k1-scope-guard.test.js` — 5/5 passing; `git diff --check` — passing.

## Delivery and scope

- Delivery: `size-exception` (accepted); actual change size remains within the 650–850 line forecast.
- No K6d/CX0 code, tests, or OpenSpec artifacts were edited. The only file edited for the two additional CX0 successor-test exclusions was `scripts/lib/k1-scope-guard.test.js`: `scripts/lib/context-measurement-hypotheses.test.js` (line 156) and `scripts/lib/context-measurement-schema.test.js` (line 157). They restore the guard's successor inventory invariant only; they do not expand the K1 allowlist or modify CX0 behavior.
- Full regression: `npm test` — exit 0 (`All checks passed.`).
