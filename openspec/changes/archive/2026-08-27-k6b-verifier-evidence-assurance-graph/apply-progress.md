# Apply Progress: k6b-verifier-evidence-assurance-graph

**Mode**: Focused TDD
**Delivery path**: size:exception (maintainer accepted `exception-ok`)
**Chain strategy**: size-exception
**Batch**: 1 (Phases 1–7, first apply)
**Branch**: `feat/k6b-verifier-evidence-assurance-graph`

## Batch 1

Started apply. Forecast ~1100–1500 lines; live production/schema/docs ~1270; tests ~1050. Combined review surface is larger than forecast because tests were included. size:exception remains in force. `openspec/config.yaml` `testing.tdd_mode: focused` was not rewritten.

### Completed

- [x] 1.1 RED: `scripts/lib/k6b-schema-fixtures.test.js` — registration, v1 pins, cross-family rejection. Local: pass.
- [x] 1.2 GREEN: `schemas/kernel/evidence/v2.schema.json` + fixtures. Local: pass.
- [x] 1.3 GREEN: `schemas/kernel/verification/v2.schema.json` + fixtures. Local: pass.
- [x] 1.4 GREEN: `schemas/kernel/assurance-graph/v1.schema.json` + fixtures. Local: pass.
- [x] 1.5 GREEN: additive `manifest.json` / `contract-claims.json`; K1 pins byte-identical. Local: pass.
- [x] 1.6 REFACTOR: adversarial fixtures (verdict, worker-said-so, reviewed-by). Local: pass.
- [x] 2.1 RED: WorkResult / unfrozen / binding mismatch fail-closed. Local: pass.
- [x] 2.2 GREEN: `independent-verifier/bindings.js` (K3 + K4a + repo tree). Local: pass.
- [x] 2.3 RED: feature minimums + Strict TDD fallback without mutating config.yaml. Local: pass.
- [x] 2.4 GREEN: `strategy-policy.js` closed table; undeclared → `strict-tdd`. Local: pass.
- [x] 2.5 REFACTOR: bug/refactor/migration/config-docs negatives. Local: pass.
- [x] 3.1 RED: provenance, foreign/fabricated/model-reported. Local: pass.
- [x] 3.2 GREEN: `evidence.js` normalize + sufficiency. Local: pass.
- [x] 3.3 RED: verification/v2 distinct; mixed verdict rejected. Local: pass.
- [x] 3.4 GREEN: `verdict.js` + `verifyCandidate()`. Local: pass.
- [x] 3.5 REFACTOR: evidence_id / verification_id deterministic under permutation. Local: pass.
- [x] 4.1 RED: digest permutation + forbidden relations. Local: pass.
- [x] 4.2 GREEN: `projector.js` sort/dedupe/`graph_id`. Local: pass.
- [x] 4.3 RED: reconciliation fail-closed on divergence. Local: pass.
- [x] 4.4 GREEN: `projectAssuranceGraph` / `reconcileAssuranceGraph`. Local: pass.
- [x] 4.5 REFACTOR: new objects, no write-through. Local: pass.
- [x] 5.1 RED: selective closure D vs I; cycle-safe. Local: pass.
- [x] 5.2 GREEN: `computeInvalidationClosure`. Local: pass.
- [x] 5.3 RED: transitive invalidates + non-promotional manifest. Local: pass.
- [x] 5.4 GREEN: manifest export + post-verify wiring. Local: pass.
- [x] 5.5 REFACTOR: manifest non-aliasing vs attestation/authorization stubs. Local: pass.
- [x] 6.1 RED: K3/K4a/K4b/K6a do not import K6b. Local: pass.
- [x] 6.2 GREEN: `rejectAuthorityMisuse` → `GRAPH_AUTHORITY_MISUSE`. Local: pass.
- [x] 6.3 RED: E2E Candidate → verify → project twice → successor → stale reject. Local: pass.
- [x] 6.4 GREEN: K4a `compileExecutionGraph` + K3/K4b `freezeCandidate` fixtures. Local: pass.
- [x] 6.5 Suites executed (see evidence below). Local: pass.
- [x] 7.1 Maturity docs: verifier/strategies/projection `implemented`; graph authority/K6c/K7/K8 remain target. Local: pass.
- [x] 7.2 OpenSpec/Git/Candidate remain sole semantic authority in both harness-evolution docs. Local: pass.

### Local verification evidence

Command: `node --test scripts/lib/k6b-schema-fixtures.test.js scripts/lib/independent-verifier/index.test.js scripts/lib/assurance-graph/index.test.js scripts/k6b-verifier-assurance-graph-e2e.test.js scripts/lib/roadmap-boundary.test.js scripts/lib/k2a-maturity-docs.test.js scripts/lib/k21-maturity-docs.test.js scripts/lib/lifecycle-kernel/k1-compat.test.js scripts/lib/k1-scope-guard.test.js scripts/lib/kernel-schema-fixtures.test.js scripts/lib/contract-checkers/k1-maturity.test.js`

Result: 59 pass, 0 fail. `K1_SCHEMA_BASELINE` pins unchanged. `testing.tdd_mode` remains `focused`.

### Deviations from design

None material. `verifyCandidate` / graph APIs return `{ ok, ... }` envelopes (fail-closed `reason_code`) rather than throwing, matching K3 binding style. Evidence `role` lives on raw input, not on published `evidence/v2` (keeps additionalProperties closed per spec). `assurance-graph/v1` may include optional `kind: assurance-graph/v1` for non-aliasing; it is not a spec-required field.

### Issues found

None blocking. Live review surface (implementation + tests + schemas) is larger than the 1100–1500 forecast because tests were counted; production/schema/docs stay near the forecast. size:exception already accepted.

## Remediation V001

**Mode**: Focused TDD (remediation)
**Delivery path**: size:exception still in force
**Branch**: `feat/k6b-verifier-evidence-assurance-graph`
**Lineage**: generation 1; `prepareRemediation` valid; no candidate-drift
**Baseline candidate**: `sha256:695cac5328f049cdd061ef8f77be7b4fc563714bd441484347a6c30c8a65545a`
**Successor candidate**: `sha256:908b136e18c4eddb602f64666095d3551af6e9a070e97180a8b161ff0e66f503`
**verify_lineage.status**: `recheck-pending` (attempt 1/2)
**Delta paths**: `scripts/lib/contract-checkers/k1-schema-compat.js`, `scripts/lib/contract-checkers/k1-schema-compat.test.js`

### Frozen finding

V001 CRITICAL origin `code-bug`: Canonical contract lint rejects the new K6b schema publications.

### Fix

- Added `FAMILY_PUBLICATION` aliases for `evidence-v2` and `verification-v2` so shared-directory paths (`schemas/kernel/evidence/v2.schema.json`, `schemas/kernel/verification/v2.schema.json`) satisfy the canonical-path rule.
- Isolated v1 `evidence` / `verification` fixture discovery from `v2-*` names so v2 valid fixtures are not evaluated against v1 schemas.
- `resolveSchemaEnum` now accepts nested `$defs` item enums so assurance-graph `relation` claims match edge items.

v1 schema files, K1 pins, `manifest.json`, `contract-claims.json`, and v2/assurance-graph schema files were not mutated.

### Files changed (allowed_paths only)

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/contract-checkers/k1-schema-compat.js` | Modified | Publication aliases, v1 fixture filters, nested enum resolution |
| `scripts/lib/contract-checkers/k1-schema-compat.test.js` | Modified | Targeted alias and nested-enum coverage |

### Local verification

Command: `node --test scripts/contract-lint.test.js scripts/lib/contract-checkers/k1-schema-compat.test.js scripts/lib/contract-checkers/k6a-checkers.test.js`

Result: 25 pass, 0 fail.

Command: `npm test`

Result: exit 0. All checks passed.

### Deviations from design

None — v2 remains additive; v1 pins stay byte-identical.

## 4R slice correction S-c2f218fd7f9b8498

**Mode**: Focused TDD (4R slice correction)
**slice_id**: `S-c2f218fd7f9b8498`
**finding_id**: `F-146266b428250235`
**request_id**: `correct-S-c2f218fd7f9b8498`
**lineage_id**: `sha256:34d2a0822ee3986e19130b1b9b418bf8bee195151073d2425e7513c79cad4947`
**base_candidate_id**: `sha256:de1c378093a161c9dbafe667c1aec38bec38a6326fe3573d15b92eb00d975f8e`
**Branch**: `feat/k6b-verifier-evidence-assurance-graph`

### Frozen finding

`validateBindings` accepted `repository.tree_digest` without bytes; no test covered tree mismatch.

### Fix

- Require `repository.files` (bytes). A declared `tree_digest` without files fails `BINDING_MISMATCH` (`repository bytes are required`).
- Keep recomputing the tree from those bytes; mismatch against `candidate.candidate_tree` still fails `BINDING_MISMATCH` and does not emit `verification`.
- `index.js` unchanged: `verifyCandidate` already returns the binding failure envelope.

### Files changed (permitted paths only)

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/independent-verifier/bindings.js` | Modified | Dropped digest-only shortcut; bytes required |
| `scripts/lib/independent-verifier/index.test.js` | Modified | Digest-without-bytes + tree-mismatch tests |
| `scripts/lib/independent-verifier/index.js` | Unchanged | Binding failure already suppresses verification |

### Local verification

Command: `node --test scripts/lib/independent-verifier/index.test.js`

Result: 14 pass, 0 fail. RED: digest-without-bytes accepted; GREEN: both acceptance tests pass.

`actual_changed_lines`: 36 (bindings +8, tests +28, index.js 0). Under forecast 80 / remaining budget 200.

### Deviations from design

None — repository bytes remain the binding source.

### Issues found

None. Other 4R findings (node_id tests, WARNINGs) were not touched.

## 4R slice correction S-f0232decfec89d8c

**Mode**: Focused TDD (4R slice correction)
**slice_id**: `S-f0232decfec89d8c`
**finding_id**: `F-6834b40151826c4a`
**request_id**: `correct-S-f0232decfec89d8c`
**lineage_id**: `sha256:34d2a0822ee3986e19130b1b9b418bf8bee195151073d2425e7513c79cad4947`
**base_candidate_id**: `sha256:7d2049a04de85b1de6718cdcb564f9e223ad063b5b4ba1efbba3c9bb59b8bb5c`
**Branch**: `feat/k6b-verifier-evidence-assurance-graph`

### Frozen finding

The BINDING_MISMATCH path for `evidence.node_id` (absent or outside the Execution Graph) had no test.

### Fix

- Added `verifyCandidate` coverage: valid Candidate + graph, `rawEvidence[].node_id` missing OR not in `executionGraph.nodes[].node_id`.
- Both cases fail `BINDING_MISMATCH` and do not emit `verification`.
- Production already fail-closed in `normalizeEvidence`; `evidence.js` and `index.js` unchanged. Slice-1 tests preserved.

### Files changed (permitted paths only)

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/independent-verifier/index.test.js` | Modified | Missing + unknown `node_id` BINDING_MISMATCH tests |
| `scripts/lib/independent-verifier/evidence.js` | Unchanged | Existing `node_id` required/known-set check |
| `scripts/lib/independent-verifier/index.js` | Unchanged | Already returns normalize failure without verification |

### Local verification

Command: `node --test scripts/lib/independent-verifier/index.test.js`

Result: 15 pass, 0 fail. GREEN: both node_id branches fail closed without `verification`. Slice-1 tests still pass.

`actual_changed_lines`: 29 (tests +29, evidence.js 0, index.js 0). Under forecast 50.

### Deviations from design

None — `node_id` remains a binding to Execution Graph nodes.

### Issues found

None. WARNINGs and other 4R slices were not touched.

## 4R WARNING follow-up remediations

**Mode**: Focused TDD (approved-lineage follow-up; successor 4R required)
**Approval**: `k6b-bounded-review-001` (`new-candidate`)
**Predecessor lineage**: `sha256:34d2a0822ee3986e19130b1b9b418bf8bee195151073d2425e7513c79cad4947` (`approved`, `all-remediation-slices-passed`)
**Branch**: `feat/k6b-verifier-evidence-assurance-graph`

User decision `4r-remediation-001` asked to remediate the six frozen WARNINGs after CRITICALs closed. Production behavior is unchanged except helper extraction; tests cover the two reliability gaps.

### Frozen WARNINGs

| ID / lens | Acceptance |
| --- | --- |
| REL-003 reliability | `verifyCandidate` config-docs with schema-parser + smoke, no install/consume → `MISSING_STRATEGY_MINIMUM` |
| REL-004 reliability | `reconcileAssuranceGraph` same `graph_id`, diverging edges → `GRAPH_DIVERGENCE` / stored edges diverge |
| Readability | JSDoc on `isEvidenceTransitivelyInvalidated`; rename `blob`; extract anyOf helper; comment `resolveSchemaEnum` |

### Fix

- Added config-docs anyOf negative and same-`graph_id` edge-divergence tests.
- Extracted `assertAdmissibleProvenance` / `failIfInadmissible` so `evaluateStrategy` stays at most three control-flow levels.
- JSDoc, haystack rename, and nested-enum comment as specified.

### Files changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/independent-verifier/index.test.js` | Modified | config-docs anyOf install\|consume test |
| `scripts/lib/assurance-graph/index.test.js` | Modified | GRAPH_DIVERGENCE on matching graph_id, diverging edges |
| `scripts/lib/independent-verifier/strategy-policy.js` | Modified | Extract anyOf/provenance helper |
| `scripts/lib/assurance-graph/invalidation.js` | Modified | JSDoc on transitive invalidation walk |
| `scripts/lib/assurance-graph/projector.js` | Modified | Rename `blob` → `idAndKindHaystack` |
| `scripts/lib/contract-checkers/k1-schema-compat.js` | Modified | Comment on nested enum resolution |

### Local verification

Command: `node --test scripts/lib/independent-verifier/index.test.js scripts/lib/assurance-graph/index.test.js scripts/lib/contract-checkers/k1-schema-compat.test.js`

Result: 41 pass, 0 fail.

## 4R generation-2 slice S-914ea5bac704f224

**Mode**: Focused TDD (4R slice correction)
**slice_id**: `S-914ea5bac704f224`
**finding_id**: `F-5726662acf1e1966`
**request_id**: `correct-S-914ea5bac704f224`
**lineage_id**: `sha256:a879a836e745c1ad8069ef354bcf1df62fb2fb1535e2585ab7a84ae75145d8e3`
**base_candidate_id**: `sha256:1b783fc2138825df04366fcc4a469bd891833a333aac2e8d3fd13a65be9ce6f3`
**corrected_candidate_id**: `sha256:57c9195cbdbec1d69d35040122a4852be7d946c1c40693588b13048249232e1d`
**Branch**: `feat/k6b-verifier-evidence-assurance-graph`

### Frozen finding

`STALE_EVIDENCE` did not cover evidence that depends on an invalidated node (`A --invalidates--> B`, `E --derived-from--> B` with no direct invalidates to E).

### Fix

- `isEvidenceTransitivelyInvalidated` now reuses `computeInvalidationClosure` with seeds = `invalidates.to` (dependents + invalidatesForward).
- Added the dependent-stale case to the 003-named `verifyCandidate` test.
- Added a graph unit test for that shape.

### Files changed (pending paths only)

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/assurance-graph/invalidation.js` | Modified | Closure-aligned stale walk |
| `scripts/lib/independent-verifier/index.test.js` | Modified | Dependent STALE_EVIDENCE on the 003 test |
| `scripts/lib/assurance-graph/index.test.js` | Modified | Dependent-stale unit test |

### Local verification

Command: `node --test scripts/lib/independent-verifier/index.test.js scripts/lib/assurance-graph/index.test.js scripts/k6b-verifier-assurance-graph-e2e.test.js`

Result: 26 pass, 0 fail. `review-correction` resolved `F-5726662acf1e1966`. Lineage `approved` (`all-remediation-slices-passed`).

`actual_changed_lines`: 72. Under forecast 80 / slice budget 200.

### Deviations from design

None — selective invalidation still uses the four K6b relations; verifier remains fail-closed on stale reuse.

### Issues found

Four advisory reliability WARNINGs remained after this slice (PASS WITH WARNINGS extra provenance; feature anyOf miss; Strict TDD host-attested/tool-produced; forged `evidence_id`). User chose option 2: remediate them as a new-candidate successor (`k6b-bounded-review-002`).

## 4R generation-3 WARNING follow-up remediations

**Mode**: Focused TDD (approved-lineage follow-up; successor 4R required)
**Approval**: `k6b-bounded-review-002` (`new-candidate`)
**Predecessor lineage**: `sha256:a879a836e745c1ad8069ef354bcf1df62fb2fb1535e2585ab7a84ae75145d8e3` (`approved`, `all-remediation-slices-passed`)
**Branch**: `feat/k6b-verifier-evidence-assurance-graph`

### Frozen WARNINGs

| Lens | Acceptance |
| --- | --- |
| reliability | extra `human-decision`/`external-unverified` → `verification.verdict === "PASS WITH WARNINGS"` |
| reliability | feature with only acceptance+invariants+negative → `MISSING_STRATEGY_MINIMUM` |
| reliability | undeclared strategy, red+green `host-attested`/`tool-produced` → `INSUFFICIENT_PROVENANCE` |
| reliability | coherent bytes/digest, forged `evidence_id` → `FABRICATED_EVIDENCE`, no verification |

### Fix

Added four `verifyCandidate` tests in `index.test.js`. Tightened the existing 004 PASS assertion to exact `PASS` now that PASS WITH WARNINGS has its own case. Production modules unchanged.

### Files changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/independent-verifier/index.test.js` | Modified | Four WARNING acceptance tests |

### Local verification

Command: `node --test scripts/lib/independent-verifier/index.test.js`

Result: 20 pass, 0 fail.

Generation-3 4R freeze: 0 BLOCKER, 0 CRITICAL, 3 WARNING advisory (anyOf provenance, requiredNegative provenance, satisfies/verified-by closure). Accepted as non-blocking follow-up so archive is not delayed by another successor. Lineage `approved` (`no-unresolved-blocking-findings`).
