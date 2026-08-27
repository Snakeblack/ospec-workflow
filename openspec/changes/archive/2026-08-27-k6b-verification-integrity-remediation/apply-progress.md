# Apply Progress: k6b-verification-integrity-remediation

**Mode:** Focused TDD (`testing.tdd_mode: focused`)
**Delivery:** `size:exception` (maintainer-accepted oversized single PR; Phases 1–8 in one batch)
**Batch:** 1 (first apply; no prior progress)
**Branch:** `feat/k6b-verifier-evidence-assurance-graph`
**Verified at:** 2026-08-27T14:24:10Z

## Batch 1 — Phases 1–8 (complete)

All 30 tasks implemented and locally verified.

### Local verification

```text
node --test scripts/lib/k6b-schema-fixtures.test.js \
  scripts/lib/independent-verifier/assessment.test.js \
  scripts/lib/independent-verifier/obligation-coverage.test.js \
  scripts/lib/independent-verifier/index.test.js \
  scripts/lib/assurance-graph/index.test.js \
  scripts/k6b-verifier-assurance-graph-e2e.test.js \
  scripts/lib/k2a-maturity-docs.test.js
→ 65 pass, 0 fail

node --test scripts/lib/contract-checkers/k1-schema-compat.test.js \
  scripts/lib/k1-scope-guard.test.js \
  scripts/lib/kernel-schema-fixtures.test.js \
  scripts/lib/roadmap-boundary.test.js
→ 34 pass, 0 fail
```

v2/K1 schema pins remain byte-identical (`evidence/v2`, `verification/v2`, K1 baseline).

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
| ---- | --- | ----- | ---- | --- | ----- | ----- | ----- | ----- |
| 1.1–1.5 | `scripts/lib/k6b-schema-fixtures.test.js` | contract | schema fixtures + digest pins | [x] | [x] | [x] | [x] | assessment/v1 family; four-role distinct ids; v2/K1 pins frozen |
| 2.1–2.3 | `scripts/lib/independent-verifier/assessment.test.js` | unit | schema validate | [x] | [x] | [x] | [x] | `computeAssessmentId` includes role+obligation; verdict rejected |
| 3.1–3.4 | `scripts/lib/independent-verifier/index.test.js` | unit | allowlist mapper | [x] | [x] | [x] | [x] | payload-only strong → `UNTRUSTED_COLLECTOR`; collector ≠ digest |
| 4.1–4.3 | `scripts/lib/independent-verifier/obligation-coverage.test.js` | unit | MUST walk | [x] | [x] | [x] | [x] | `UNFULFILLED_MUST` / `UNKNOWN_OBLIGATION_ID` / `WRONG_IMPLEMENTING_NODE`; empty `required_evidence` fails |
| 4R S2 | `scripts/lib/independent-verifier/obligation-coverage.test.js` | unit | 6 pass | lock | [x] | [x] | [x] | `INSUFFICIENT_PROVENANCE`; 2nd MUST; deferral incompleto; grafo ausente `BINDING_MISMATCH` |
| 5.1–5.4 | `scripts/lib/independent-verifier/index.test.js` | integration | facade stub | [x] | [x] | [x] | [x] | projector stub → `GRAPH_PROJECTION_FAILED`; unique-sort still one E |
| 6.1–6.5 | `scripts/lib/assurance-graph/index.test.js` | unit | canonical `graph_id` | [x] | [x] | [x] | [x] | kind/namespace `rejectForbidden`; replay byte-identical; C1→C2 → `GRAPH_DIVERGENCE` |
| 7.1–7.4 | `scripts/k6b-verifier-assurance-graph-e2e.test.js` | e2e | persistable replay | [x] | [x] | [x] | [x] | assessments + `canonical_inputs` persisted; adversarial cases in index tests |
| 8.1–8.2 | `scripts/lib/k2a-maturity-docs.test.js` | docs | status table | [x] | [x] | n/a | n/a | K6b `revise`; K6c `blocked-by-K6b-remediation` |

### Task status

- [x] 1.1–1.5 Assessment/v1 schema publication
- [x] 2.1–2.3 Assessment identity module
- [x] 3.1–3.4 Collector provenance allowlist
- [x] 4.1–4.3 Obligation Manifest MUST walk
- [x] 5.1–5.4 Verifier facade integration
- [x] 6.1–6.5 Assurance Graph remediation
- [x] 7.1–7.4 Adversarial tests and E2E
- [x] 8.1–8.2 Roadmap documentation

### Deviations from design

None — implementation matches design. Companion updates required by existing tests:

- `v1-four-roles.json` is an array of four payloads; `k1-schema-compat` skips it via `fixtureNameFilter` (same pattern as `k3-frozen.json`) so the generic object walker does not treat the bundle as one instance.
- `schemas/kernel/assessment/` excluded from K1 frozen inventory (`k1-compat.js`, `k1-scope-guard.test.js` successor prefixes).
- `k2a-maturity-docs.test.js` updated to pin K6b `revise` / K6c `blocked-by-K6b-remediation`.

### Issues found

None blocking. Existing verifier/E2E tests that claimed strong provenance without collector now supply an allowlisted collector (or omit collector to assert `UNTRUSTED_COLLECTOR`).

## Batch 2 — 4R slice `S-ea4088e8a61de9f8` (collector-trust-boundary)

**Lineage:** `sha256:262dda4ab0b3ec0fe60b7db34683c55d3c4d2590fe69282c40197cbc95aacf42`
**Delivery:** `exception-ok` / this slice only. Forecast cap 180.

Closed `F-d5739d79237afeb8` (CRITICAL): weak claim + allowlisted collector now fails `UNTRUSTED_COLLECTOR`; claim↔collector disagreement is symmetric.

Co-located WARNINGs remediated in-cap: collector mapping tests (`F-2fc6db350f5b8afc`); STALE remint (`F-ad61b7e3cff9629a`); canonicalInputs bind (`F-6b1f8c8265c82b3e`); GRAPH_DIVERGENCE facade (`F-990aa817913b8273`); `rejectForbidden` kind-first + comments (`F-99f9c70bdae46c12`); projector satisfies comment (`F-eb2d325d6d801a14`); documented `derived` vs collector resolution (`F-4839a9a36f0b55be`).

### Local verification

```text
node --test scripts/lib/independent-verifier/index.test.js \
  scripts/lib/assurance-graph/index.test.js \
  scripts/k6b-verifier-assurance-graph-e2e.test.js
→ 48 pass, 0 fail
```

## Batch 3 — 4R retry 2 `S-ea4088e8a61de9f8`
- [x] F-d5739d79237afeb8: envelope `collector` fails closed; harness `input.collector` derives class. GREEN: `node --test --test-name-pattern "envelope collector fails closed" scripts/lib/independent-verifier/index.test.js`

## Batch 4 — 4R `S-ad5558b5639b6890`
- [x] F-b3d6518c12aa69fe / F-00f97ff647d28eea / F-ef73f7e16cab6436 + colocated F-2be19c4683d81ba1 / F-9d6a187e3d18dbf5
- Safety net 6 pass; after 10 pass / 0 fail: `node --test scripts/lib/independent-verifier/obligation-coverage.test.js`

## Batch 5 — successor `new-candidate` (helpers + remaining WARNINGs)
- [x] Harness `input.collector` (optional `input.collectors[]`); envelope `collector` still fail-closed
- [x] F-2fc6db350f5b8afc mapping `npm-test`/`node:test`; F-4839a9a36f0b55be `provenanceClass`; F-f979f00ae92cda6f comment
- GREEN: `node --test scripts/lib/independent-verifier/index.test.js scripts/lib/independent-verifier/obligation-coverage.test.js scripts/lib/assurance-graph/index.test.js scripts/k6b-verifier-assurance-graph-e2e.test.js` → 59 pass / 0 fail
- Successor freeze: 0 BLOCKER, 0 CRITICAL, 6 WARNING (advisory, already closed in-tree: FABRICATED_EVIDENCE tests, INVALID_ASSESSMENT, comments/renames), 1 SUGGESTION
