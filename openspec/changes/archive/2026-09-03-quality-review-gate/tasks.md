# Tasks: Quality Review Gate

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-agents-021 quality roster + read-only | MUST | `agents/review-*.agent.md`, `agents/sdd-orchestrator.agent.md` | covered-by-design | Dual-bind ACTIVE_V2 + legacy v1 continuation |
| REQ-agents-022 canonical ownership | MUST | `skills/review-{trust,runtime,evolution,efficiency}/SKILL.md` | covered-by-design | Do-not-flag tables per domain |
| REQ-agents-023 / REQ-routing-011 contract coherence | MUST | `review-taxonomy.js`, `review-gate-state.js`, `review-lineage.js` | covered-by-design | Mixed taxonomy/keys → `contract-remediation` |
| REQ-agents-024 / REQ-agents-012 deterministic-first dispatch | MUST | `review-gate-state.js`, `gate-4r-review.md` | covered-by-design | Residual-only router; verify boundary preserved |
| REQ-agents-013 union selection + zero-model | MUST | `review-dimensions.js`, `review-gate-state.js` | covered-by-design | No overflow; 0–4 specialists |
| REQ-agents-014 / REQ-generator-014 target parity | MUST | configure + `selective-4r-parity.test.js` | covered-by-design | Live validators require ACTIVE_V2 only |
| REQ-agents-015 / REQ-routing-007 lineage migration | MUST | `review-lineage.js`, `migrateLineageTaxonomyV2` | covered-by-design | Pristine preconditions + migration receipt |
| REQ-skills-011 specialist contracts | MUST | `skills/review-{trust,runtime,evolution,efficiency}/` | covered-by-design | Slice 1 |
| REQ-skills-004/005 review-change residual router | MUST | `skills/review-change/SKILL.md`, `agents/review-change.agent.md` | covered-by-design | Valid ambiguous → gate `quality-review-ambiguity-unresolved` |
| REQ-skills-009 dual-schema correction | MUST | `skills/review-correction/SKILL.md`, `review-lineage.js` | covered-by-design | v1 4R owners vs v2 quality owners; never both |
| REQ-routing-008 closed-world ambiguity + B5 | MUST | `review-dimensions.js` | covered-by-design | Explicit `capability_scopes`; per-cap residual |
| REQ-routing-001/002 evidence + union + no overflow | MUST | `review-dimensions.js` | covered-by-design | Remove `normal-signal-overflow` |
| REQ-routing-003 audit persist v2 key | MUST | `review-gate-state.js` | covered-by-design | `gates.quality-review-gate` schema_version 2 |
| REQ-routing-004/005 slice correction + archive read-only | MUST | `review-lineage.js` (unchanged slice rules) | covered-by-design | Mixed taxonomy fail-closed added |
| REQ-routing-009/010 zero-model + high-risk | MUST | `review-gate-state.js`, `review-dimensions.js` | covered-by-design | High-risk skips router |
| REQ-hooks-001 phase-cost active six | MUST | `subagent-stop.js`, `subagentstop.go` | covered-by-design | Retired 4R ignored fail-safely |
| REQ-generator-008/011 Cursor readonly + Codex sandbox | MUST | `target-profiles/cursor.js`, `validate-codex.js` | covered-by-design | Legacy four not required readonly |
| REQ-orchestrator-evals-008/001/005 fixture coherence | MUST | `scripts/evals/**` | covered-by-design | Live `quality-review-gate`; archive untouched |
| REQ-context-measurement-006/005 KPI sidecar | MUST | `quality-review-kpis.js` | covered-by-design | No CX0 METRICS extension; non-authoritative |
| A4 lexical ≠ semantic gates | MUST | `review-taxonomy.js`, `route-dispatcher.js` | covered-by-design | Live/v2 rejects `4r-review-gate` |
| Router ambiguous vs malformed | MUST | `review-gate-state.js`, `validateRouterDecision` | covered-by-design | Distinct blocker reasons |

### Reconciliation Verdict

- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none — design-revision-001 locked

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1800–2600 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Optional 6-slice readability units (not an apply gate under `exception-ok`) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Taxonomy module + domain agents/skills | optional slice 1 | Foundation; keep LEGACY_V1 files |
| 2 | Classifier v2 + gate planner | optional slice 2–3 | RED/GREEN on dimensions + gate-state |
| 3 | Roster, hooks, generator parity | optional slice 4 | Active six phase-cost; goldens regen |
| 4 | Lineage dual-schema + gate identity + evals | optional slice 5 | Migrate receipt; route-dispatcher admission |
| 5 | KPI sidecar + docs | optional slice 6 | No K6d edits; branch collision risk with k6d-complexity-architecture-delta |

### Risks

- Shared branch `feat/k6d-cx0-parallel`: k6d-complexity-architecture-delta verify remediation may collide on tests; do not edit K6d paths.
- Atomic contract: no shippable mixed taxonomy between slices; merge only when v2 live tree is coherent.

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Phase 1: Slice 1 — Taxonomy & Domain Contracts

- [x] 1.1 RED: add `scripts/lib/review-taxonomy.test.js` covering `QUALITY_DOMAINS`, `ACTIVE_GATES`/`LEGACY_GATES`/`LEXICAL_GATES`, `ACTIVE_V2_REVIEWERS`/`LEGACY_V1_REVIEWERS`, `detectMixedTaxonomy`, `detectMixedGateKeys`, context-dependent admission (live v2 rejects `4r-review-gate`) [REQ-agents-023, REQ-routing-011]
- [x] 1.2 GREEN: implement `scripts/lib/review-taxonomy.js` exporting frozen constants, mixed detectors, and admission helpers per design interfaces [REQ-agents-023, REQ-routing-011]
- [x] 1.3 Create `agents/review-trust.agent.md`, `agents/review-runtime.agent.md`, `agents/review-evolution.agent.md`, `agents/review-efficiency.agent.md` with `tools: ['read', 'search']` and domain competence summaries [REQ-agents-021, REQ-agents-022]
- [x] 1.4 Create `skills/review-trust/SKILL.md`, `skills/review-runtime/SKILL.md`, `skills/review-evolution/SKILL.md`, `skills/review-efficiency/SKILL.md` with ownership tables, do-not-flag rules, evidence-backed finding contracts, and explicit rule that signal codes ≠ findings [REQ-skills-011, REQ-skills-012, REQ-agents-022]
- [x] 1.5 Confirm `agents/review-{risk,reliability,resilience,readability}.agent.md` and `skills/review-{risk,reliability,resilience,readability}/` remain on disk unchanged (legacy v1 executors; no Delete tasks) [REQ-agents-021, REQ-agents-015]
- [x] 1.6 Update `models.yaml`: add `default` mappings for four quality specialists; retain four 4R legacy mappings and `review-change: premium` [REQ-generator-011, REQ-agents-021]

---

## Phase 2: Slice 2 — Evidence v2, Classifier & Residual Payload

- [x] 2.1 RED: extend `scripts/review-dimensions.test.js` — v2 evidence schema, explicit `capability_scopes` validation, no POSIX path/id inference, global fact selects domain without attributing capabilities, per-capability `residual_evidence` with `total_paths`/`truncated`, closed ambiguity codes including `cross-capability-blast-radius`, union selection, removal of `normal-signal-overflow`, high-risk four-domain override [REQ-routing-001, REQ-routing-002, REQ-routing-008]
- [x] 2.2 GREEN: refactor `scripts/lib/review-dimensions.js` — `normalizeReviewEvidence` v2 (`schema_version: 2`, fingerprint, `capability_coverage`, no raw diff persist), scope validation fail-closed, new signal families remapped (network/error → runtime only) [REQ-routing-001, REQ-routing-008]
- [x] 2.3 GREEN: implement `classifyQualityReview` with `classification_status`, `selected_domains` union, sufficiency matrix scenarios (docs-only `[]`, runtime-no-signal ambiguous, 4 scoped, 4 with 2 unscoped, 7 attributed, single runtime), delete overflow branch [REQ-routing-002, REQ-routing-008, REQ-routing-009]
- [x] 2.4 GREEN: build per-unattributed-capability residual payload (`id`, bounded `paths`, `total_paths`, `truncated`, `fact_codes`); no silent capability drop [REQ-routing-008, REQ-skills-005]
- [x] 2.5 GREEN: add `validateRouterDecision` rejecting findings/severity/4R IDs/extra keys; accept closed `reason` grammar [REQ-skills-004, REQ-agents-024, REQ-routing-003]

---

## Phase 3: Slice 3 — Deterministic-First Gate Planner & Router Contract

- [x] 3.1 RED: extend `scripts/review-gate-state.test.js`
- [x] 3.3 Update `skills/review-change/SKILL.md` and `agents/review-change.agent.md`
- [x] 3.4 Rewrite body of `skills/_shared/gate-4r-review.md`
- [x] 3.5 Extend `scripts/review-change-contract.test.js`

---

## Phase 4: Slice 4 — Roster Migration, Hooks & Generator Parity

- [x] 4.1 Update `agents/sdd-orchestrator.agent.md`
- [x] 4.2 Update `scripts/lib/model-resolver.js`
- [x] 4.3 Update `scripts/hooks/subagent-stop.js` and `internal/hooks/subagentstop.go` — phase-cost allowlist = active six quality names only; retired 4R → empty phase key (REQ-hooks-001 unchanged semantics) [REQ-hooks-001]
- [x] 4.4 Extend `scripts/hooks/subagent-stop.test.js` and `internal/hooks/subagentstop_test.go` — quality names recorded; `review-reliability` ignored fail-safely [REQ-hooks-001]
- [x] 4.5 Update `scripts/lib/target-profiles/cursor.js` — `agentReadonly.agents` = six active quality-review agents [REQ-generator-008]
- [x] 4.6 Update `scripts/configure/validate-cursor.js`, `scripts/configure/validate-codex.js`, `scripts/configure/cli.js`
- [x] 4.7 Update `scripts/configure/cli.test.js`, `scripts/configure/real-repo.test.js`, `scripts/configure/validate-codex.test.js`, `scripts/configure/__fixtures__/source/models.yaml`
- [x] 4.8 Regenerate `scripts/configure/__fixtures__/golden/**` via configure script (do not hand-edit dist) [REQ-generator-014, REQ-agents-014]
- [x] 4.9 Update `scripts/model-tier-contract.test.js`
- [x] 4.10 Update `scripts/lib/target-transform.test.js`

---

## Phase 5: Slice 5 — Lineage Dual-Schema, Gate Identity & Evals

- [x] 5.1 RED: extend `scripts/review-lineage.test.js`
- [x] 5.2 RED: extend `scripts/review-lineage-o4-migration.test.js`
- [x] 5.3 GREEN: update `scripts/lib/review-lineage.js`
- [x] 5.4 Update `skills/review-correction/SKILL.md`, `agents/review-correction.agent.md`
- [x] 5.5 Extend `scripts/review-correction-contract.test.js`
- [x] 5.6 Update `scripts/lib/route-dispatcher.js` — split `LEXICAL_GATES` from semantic `ACTIVE_GATES`/`LEGACY_GATES`; live/v2 config rejects `4r-review-gate`; reject route listing both review gates; no POSIX capability inference [REQ-routing-011, REQ-routing-008]
- [x] 5.7 Update `openspec/config.yaml` live route `gates` → `quality-review-gate` [REQ-routing-011, REQ-orchestrator-evals-008]
- [x] 5.8 Update `scripts/evals/safe-export.js`, `scripts/evals/safe-export.test.js`, `scripts/evals/__fixtures__/*/repo/openspec/config.yaml`, `scripts/evals/live-driver.js` — live fixtures assert `quality-review-gate`; defect column quality-review; historical archive scenarios unchanged [REQ-orchestrator-evals-008, REQ-orchestrator-evals-001, REQ-orchestrator-evals-005]
- [x] 5.9 Update `scripts/selective-4r-parity.test.js`
- [x] 5.10 Update `skills/_shared/openspec-convention.md`, `skills/_shared/sdd-phase-common.md`, `rules/sdd-common.instructions.md`, `rules/sdd-openspec.instructions.md`

---

## Phase 6: Slice 6 — KPI Sidecar, Docs & Final Verification

- [x] 6.1 RED: create `scripts/lib/quality-review-kpis.test.js` — seven KPI envelopes, zero-model rate, router delta, unavailable tokens with reason codes, module has no imports into gate/lineage [REQ-context-measurement-006, REQ-context-measurement-005]
- [x] 6.2 GREEN: implement `scripts/lib/quality-review-kpis.js` — `deriveQualityReviewKpis({ gateAudit, phaseCosts, cx0Records })`, `formula_version: quality-review-kpis/v1`; do not extend CX0 `METRICS` [REQ-context-measurement-006]
- [x] 6.3 Update docs: `docs/sdd-routing.md`, `docs/target-capabilities.md`, `docs/sdd-lifecycle-hooks.md`, `README.md`, `openwiki/agents-skills/agents-and-skills.md`, `skills/_shared/openspec-convention.md`, `rules/sdd-openspec.instructions.md`
- [x] 6.4 Run full targeted test suite
- [x] 6.5 Verify atomic contract integration smoke
