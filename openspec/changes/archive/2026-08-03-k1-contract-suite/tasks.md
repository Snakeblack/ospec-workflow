# Tasks: K1 — Contract Suite, Vocabulario y Clasificación

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-harness-authority-canon-001 Graph IR non-authority | MUST | `authority-canon.js`, k1-prose-authority checker | covered-by-design | Reconciliation + fail-closed helpers |
| REQ-harness-authority-canon-002 No prose fallback | MUST | `authority-canon.js`, k1-prose-authority checker | covered-by-design | Structured-only authority |
| REQ-harness-authority-canon-003 Maturity tags | MUST | `harness-evolution.md`, k1-maturity checker | covered-by-design | implemented/target/experimental |
| REQ-harness-authority-canon-004 No reducer in K1 | MUST | Scope guard tests, design out-of-scope | covered-by-design | Guard tests in Phase 9 |
| REQ-kernel-contract-schemas-001 Versioned families + $id | MUST | `schemas/kernel/**`, manifest, validator | covered-by-design | 12 families per ADR-001 |
| REQ-kernel-contract-schemas-002 Valid/invalid fixtures | MUST | `fixtures/{valid,invalid}/` per family | covered-by-design | ≥1 pass + ≥1 fail each |
| REQ-kernel-contract-schemas-003 Versioned aliases | MUST | `aliases/v1.json`, `kernel-aliases.js` | covered-by-design | ADR-004 strict mode |
| REQ-kernel-contract-schemas-004 Graph/work-order consumable only | MUST | graph-node + work-order schemas | covered-by-design | No reducer activation |
| REQ-kernel-contract-schemas-005 No unemitted fields | MUST | k1-emission checker + emission catalogs | covered-by-design | Allowlists beside builders |
| REQ-change-classification-001 Multidimensional profile | MUST | `change-classification.js`, classification schema | covered-by-design | risk/uncertainty/execution + reasons |
| REQ-change-classification-002 Stable fingerprint | MUST | `canonical-json.js`, classifier | covered-by-design | ADR-002 domain-prefixed SHA-256 |
| REQ-change-classification-003 Impact hard floors | MUST | `change-classification.js` floor table | covered-by-design | LOC never lowers floor |
| REQ-transition-surface-parity-001 next_transition shape | MUST | `next-transition.js`, state-transition schema | covered-by-design | execute/collect/decide/stop |
| REQ-transition-surface-parity-002 Execute requires command | MUST | `next-transition.js` post-validator | covered-by-design | command + tokens |
| REQ-transition-surface-parity-003 Collect no invented command | MUST | `next-transition.js` post-validator | covered-by-design | Semantic rule beyond JSON Schema |
| REQ-transition-surface-parity-004 Decide/stop continuations | MUST | `next-transition.js` post-validator | covered-by-design | decide no command; stop no recovery |
| REQ-transition-surface-parity-005 Human ↔ envelope parity | MUST | `transition-parity.js`, parity fixtures | covered-by-design | code/cause/next_action |
| REQ-contract-lint-008 Schema/doc compat | MUST | `k1-schema-compat.js` | covered-by-design | $id/version + doc mismatch |
| REQ-contract-lint-009 Undocumented emission | MUST | `k1-emission.js` | covered-by-design | Fields/commands allowlist |
| REQ-contract-lint-010 Prose authority fallback | MUST | `k1-prose-authority.js` | covered-by-design | Graph IR implemented offender |
| REQ-contract-lint-011 Maturity label checker | MUST | `k1-maturity.js` | covered-by-design | Scoped maturity register |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: per-family required properties and initial alias rows are apply-time fill-ins per design Open Questions — constrained by existing emitters

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2800–3500 (schemas, fixtures, libs, checkers, tests, docs) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR (`size-exception`); logical review path: authority → shapes → classification/parity → lint |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Authority canon + canonical-json foundation | Single PR (exception) | RED→GREEN tests first; no reducer |
| 2 | Schema manifest, validator subset, 12 families + fixtures | Same PR | Constrained Draft 2020-12 interpreter (ADR-003) |
| 3 | Aliases v1 + migration resolution | Same PR | Seed from current emitters before renames |
| 4 | Classifier + hard floors + fingerprint | Same PR | Not wired to routing |
| 5 | next_transition + parity extractors/fixtures | Same PR | Semantic post-validators beside schema |
| 6 | Four K1 contract-lint checkers + registry | Same PR | Fail-closed once registered |
| 7 | Docs maturity tags + scope guard tests | Same PR | Graph IR stays non-implemented |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Authority Canon & Canonical Foundation

- [x] 1.1 RED: Add `scripts/lib/canonical-json.test.js` with golden vectors for `stableSerialize` determinism and `sha256Fingerprint("change-classification\0", …)` format [REQ-change-classification-002]
- [x] 1.2 GREEN: Create `scripts/lib/canonical-json.js` exporting `stableSerialize` + `sha256Fingerprint(domain, value)` mirroring `review-lineage.js` digest pattern (ADR-002) [REQ-change-classification-002]
- [x] 1.3 RED: Add `scripts/lib/authority-canon.test.js` covering Graph IR override rejection and missing structured field fail-closed [REQ-harness-authority-canon-001, REQ-harness-authority-canon-002]
- [x] 1.4 GREEN: Create `scripts/lib/authority-canon.js` with structured authority helpers (`assertOpenSpecAuthoritative`, `rejectProseFallback`, Graph IR reconciliation checks) [REQ-harness-authority-canon-001, REQ-harness-authority-canon-002]

## Phase 2: Schema Infrastructure

- [x] 2.1 RED: Add `scripts/lib/kernel-schema-validator.test.js` for subset keywords (type, properties, required, enum, const, oneOf, local $ref, if/then) accept/reject cases [REQ-kernel-contract-schemas-001]
- [x] 2.2 GREEN: Create `scripts/lib/kernel-schema-validator.js` — dep-free Draft 2020-12 constrained interpreter + load-by-`$id` from manifest (ADR-003) [REQ-kernel-contract-schemas-001]
- [x] 2.3 Create `schemas/kernel/manifest.json` indexing 12 families → path, `$id`, `schema_version` per design table [REQ-kernel-contract-schemas-001]
- [x] 2.4 RED: Add fixture-runner test that loads manifest and asserts every family has `$id` + version [REQ-kernel-contract-schemas-001, REQ-contract-lint-008]

## Phase 3: Schema Families & Fixtures

- [x] 3.1 RED→GREEN: Publish `state-transition/v1.schema.json` + ≥1 valid + ≥1 invalid fixture under `fixtures/{valid,invalid}/` [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-002, REQ-transition-surface-parity-001]
- [x] 3.2 RED→GREEN: Publish `classification/v1.schema.json` + valid/invalid fixtures matching profile shape (axes, route, reasons, fingerprint) [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-002, REQ-change-classification-001]
- [x] 3.3 RED→GREEN: Publish `contract/v1.schema.json` + valid/invalid fixtures [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-002]
- [x] 3.4 RED→GREEN: Publish `graph-node/v1.schema.json` + valid/invalid fixtures (consumable contract only, no reducer) [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-002, REQ-kernel-contract-schemas-004]
- [x] 3.5 RED→GREEN: Publish `work-order/v1.schema.json` + valid/invalid fixtures [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-002, REQ-kernel-contract-schemas-004]
- [x] 3.6 RED→GREEN: Publish remaining families (`candidate`, `evidence`, `verification`, `finding-review`, `failure-recovery`, `receipt`, `event`) each with `$id`, version, and valid/invalid fixtures [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-002]
- [x] 3.7 Add per-family fixture test (or shared runner) asserting valid fixtures pass and invalid fixtures fail with path/rule [REQ-kernel-contract-schemas-002]

## Phase 4: Aliases & Migration

- [x] 4.1 RED: Add `scripts/lib/kernel-aliases.test.js` for legacy tag resolve, strict unmapped fail-closed, and no silent drop [REQ-kernel-contract-schemas-003]
- [x] 4.2 GREEN: Create `schemas/kernel/aliases/v1.json` seeded from current stable tags (review reasons, route labels, envelope codes) + `scripts/lib/kernel-aliases.js` with `resolveAlias(tag, {strict})` (ADR-004) [REQ-kernel-contract-schemas-003]
- [x] 4.3 TRIANGULATE: Extend alias tests with coverage matrix for every known consumer-facing tag in strict mode [REQ-kernel-contract-schemas-003]

## Phase 5: Change Classification & Hard Floors

- [x] 5.1 RED: Add `scripts/lib/change-classification.test.js` with evidence matrices: auth/migration→critical, public API→≥planned, repair/direct floors, large docs-only≠critical [REQ-change-classification-001, REQ-change-classification-003]
- [x] 5.2 GREEN: Create `scripts/lib/change-classification.js` — `classifyChange(normalizedEvidence)` returning profile + `reasons[]` + fingerprint via `canonical-json.js`; hard-floor table with precedence; no routing side effects [REQ-change-classification-001, REQ-change-classification-002, REQ-change-classification-003, REQ-harness-authority-canon-004]
- [x] 5.3 RED→GREEN: Conformance tests — identical normalized inputs → identical fingerprint+reasons; material field change alters fingerprint [REQ-change-classification-002]

## Phase 6: next_transition & Surface Parity

- [x] 6.1 RED: Add `scripts/lib/next-transition.test.js` for execute/collect/decide/stop kind rules (command required, collect no invented command, stop no recovery command) [REQ-transition-surface-parity-001, REQ-transition-surface-parity-002, REQ-transition-surface-parity-003, REQ-transition-surface-parity-004]
- [x] 6.2 GREEN: Create `scripts/lib/next-transition.js` — schema validate via kernel validator + semantic post-validators per kind [REQ-transition-surface-parity-001, REQ-transition-surface-parity-002, REQ-transition-surface-parity-003, REQ-transition-surface-parity-004]
- [x] 6.3 RED: Add `scripts/lib/transition-parity.test.js` with paired human/envelope fixtures (match + divergent next action) [REQ-transition-surface-parity-005]
- [x] 6.4 GREEN: Create `scripts/lib/transition-parity.js` — `extractDiscriminants` + `compareParity(code, cause, next_action[, command])`; add `schemas/kernel/parity/fixtures/*.json` [REQ-transition-surface-parity-005]

## Phase 7: Contract-Lint Checkers & Registry

- [x] 7.1 RED: Add tests for `scripts/lib/contract-checkers/k1-schema-compat.test.js` — doc field not in schema, missing $id offender [REQ-contract-lint-008, REQ-kernel-contract-schemas-005]
- [x] 7.2 GREEN: Create `scripts/lib/contract-checkers/k1-schema-compat.js` [REQ-contract-lint-008]
- [x] 7.3 RED→GREEN: Create emission field/command allowlists beside builders + `k1-emission.js` + tests rejecting unemitted names [REQ-contract-lint-009, REQ-kernel-contract-schemas-005]
- [x] 7.4 RED→GREEN: Create `k1-prose-authority.js` + tests for prose fallback instructions and Graph IR `implemented`-as-authority offenders [REQ-contract-lint-010, REQ-harness-authority-canon-002, REQ-harness-authority-canon-003]
- [x] 7.5 RED→GREEN: Create `k1-maturity.js` + tests for missing/invalid maturity tags in scoped register [REQ-contract-lint-011, REQ-harness-authority-canon-003]
- [x] 7.6 Register all four K1 checkers in `scripts/lib/contract-lint.js` `DEFAULT_REGISTRY`; extend `scripts/lib/contract-lint.test.js` integration cases [REQ-contract-lint-008, REQ-contract-lint-009, REQ-contract-lint-010, REQ-contract-lint-011]

## Phase 8: Documentation & Maturity Tags

- [x] 8.1 Update `docs/architecture/harness-evolution.md` §Registro de madurez — every scoped capability entry carries exactly one `{implemented|target|experimental}` tag; Graph IR independent authority remains `target` or `experimental` [REQ-harness-authority-canon-003]
- [x] 8.2 Document supported JSON Schema subset in `scripts/lib/kernel-schema-validator.js` module header (or adjacent comment block) so authors avoid unsupported keywords [REQ-kernel-contract-schemas-001]

## Phase 9: Integration, Scope Guards & Apply Evidence

- [x] 9.1 RED: Add scope guard test asserting no global lifecycle reducer module and no edits to fixed/default routing baselines land in K1 paths [REQ-harness-authority-canon-004]
- [x] 9.2 Run full `npm test`; record TDD Cycle Evidence table in `apply-progress.md` per Strict TDD protocol
- [x] 9.3 Verify `runAllCheckers` returns empty offenders on clean tree; confirm mutation fixtures fail as expected (prose fallback doc, unemitted field, Graph IR implemented tag)
