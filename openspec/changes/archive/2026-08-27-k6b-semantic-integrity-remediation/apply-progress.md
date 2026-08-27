# Apply Progress: k6b Semantic Integrity Remediation

## Batch 1 — 2026-08-27

Delivery path: `size:exception` accepted by the maintainer. Scope remained focal to B1–B3/H1–H3; 22/22 checklist tasks are implemented and locally verified. (The task artifact contains 22 items despite the prior forecast referring to 21.)

| Task range | Status | Local verification | Result |
| --- | --- | --- | --- |
| 1.1–1.5 | [x] | `node --test ...k6b-schema-fixtures.test.js ...assessment.test.js` | Required canonical coverage is schema-valid, included in assessment identity, and frozen K1/v2 bytes remain pinned. |
| 2.1–2.7 | [x] | `node --test scripts/lib/independent-verifier/*.test.js` | Contract gate runs before strategy; incompatible evidence roles, invalid order, unknown/wrong bindings, and partial token coverage fail closed. |
| 3.1–3.6 | [x] | `node --test scripts/lib/assurance-graph/index.test.js` | Project, replay, and reconcile validate canonical digests and complete stored graph payloads fail-closed. |
| 4.1–4.4 | [x] | Focused suite: 79/79 tests passed; full `npm test` completed with `All checks passed.` | E2E is deterministic; K6b is `revise` and K6c blocked until archive; no legacy assessment migration was introduced. |

## Files changed

- Assessment contract and fixtures: `schemas/kernel/assessment/v1.schema.json`, `schemas/kernel/contract-claims.json`, and assessment fixtures.
- Verifier: canonical assessment validation, contract binding, evidence coverage normalization, ordered non-aliased strategy checks, and token-subset MUST coverage.
- Assurance Graph: resolved canonical-input validation, replay assessment revalidation, stored-payload graph-id recomputation, and complete reconciliation comparison.
- Tests and E2E coverage under `scripts/lib/**` and `scripts/k6b-verifier-assurance-graph-e2e.test.js`.
- Roadmap and architecture status for the active remediation.

## Migration and rollback

No migration is attempted. Legacy `assessment/v1` records without `evidence_requirements_satisfied` fail closed and must be regenerated from canonical verifier inputs. Roll back schema, verifier, graph hardening, fixtures, tests, and temporary roadmap state together; `evidence/v2`, `verification/v2`, and K1 v1 remain unmodified.

## Deviations and risks

None from the approved design. The repository had a pre-existing `models.yaml` modification; it was preserved and is outside this change scope. The implementation delta is approximately 450 changed lines, below the 850–1,150 forecast, so no workload escalation occurred.

## Batch 2 — 2026-08-27

Delivery path remains the maintainer-approved `size:exception`. This focused remediation completes 4/4 verify-gap tasks (26/26 total) with persistent runtime tests only; no production source, schema, fixture, or contract file changed.

| Task range | Status | Local verification | Result |
| --- | --- | --- | --- |
| 2.8 | [x] | `node --test scripts/lib/independent-verifier/assessment.test.js scripts/lib/assurance-graph/index.test.js` (21/21) | Assessment identity changes independently for `evidence_id` and `obligation_id`. |
| 3.7 | [x] | Focused verifier/Assurance Graph suite (72/72) | Replay rejects malformed schema, invalid coverage, candidate/policy mismatch, missing evidence, unknown obligation, non-implementing node, and `node_id` mismatch with `GRAPH_DIVERGENCE`. |
| 3.8 | [x] | Focused verifier/Assurance Graph suite (72/72) | Reconcile rejects tampered stored canonical inputs, candidate, kind, and schema after recomputing the stored graph id. |
| 5.1 | [x] | `npm test` (exit 0); `git diff --check` | Full suite passed; no scoped implementation mismatch was exposed. |

## Batch 2 deviations and risks

None. The new tests exercised the existing fail-closed implementation without requiring a production-code correction. Pre-existing changes, including `models.yaml`, remain preserved and outside this batch.
