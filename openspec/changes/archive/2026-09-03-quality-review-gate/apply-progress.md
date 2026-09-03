# Apply Progress: quality-review-gate

**Mode**: Focused TDD  
**Delivery**: size:exception (single PR)  
**Branch**: feat/k6d-cx0-parallel

## Batch 1 — Core taxonomy, classifier, gate planner, lineage v2, hooks, evals, KPIs

### Completed (verified locally)

- [x] 1.1–1.2 `review-taxonomy.js` + tests (QUALITY_DOMAINS, gate admission, mixed detectors)
- [x] 1.3 Four quality agent templates (`review-trust|runtime|evolution|efficiency`)
- [x] 1.4 Four quality skill contracts with ownership tables
- [x] 1.5 Legacy 4R agents/skills retained unchanged
- [x] 1.6 `models.yaml` quality specialist mappings + `review-change: premium`
- [x] 2.2–2.5 `review-dimensions.js` v2: `normalizeQualityReviewEvidence`, `classifyQualityReview`, `validateRouterDecision`, residual payload
- [x] 3.2 `review-gate-state.js` v2 planner, mixed gate keys, ambiguous vs contract-remediation
- [x] 5.6 `route-dispatcher.js` lexical vs semantic gates + live-v2 admission
- [x] 5.7 `openspec/config.yaml` live routes → `quality-review-gate`
- [x] 5.8 Eval fixtures + `safe-export.js` live gate identity
- [x] 4.3–4.4 Hooks phase-cost allowlist (JS + Go) + test updates
- [x] 4.5 `target-profiles/cursor.js` readonly active six
- [x] 4.8 Golden fixtures regenerated via configure CLI
- [x] 6.1–6.2 `quality-review-kpis.js` + tests

## Batch 2 — Classifier matrix, gate tests, contracts, configure parity, lineage GREEN, docs, suite

### Completed (verified locally)

- [x] 2.1 RED/GREEN matrix in `scripts/review-dimensions.test.js` (scopes, no POSIX inference, global fact without capability attribution, per-cap residual, blast-radius, union, overflow gone on v2, high-risk)
- [x] 3.1 RED/GREEN in `scripts/review-gate-state.test.js` (sufficient skip router, high-risk four, zero-model, valid sufficient merge, valid ambiguous → `quality-review-ambiguity-unresolved` no freeze, malformed → `contract-remediation`, mixed keys, v1 LEGACY_V1 dispatch)
- [x] 3.3 `skills/review-change/SKILL.md` + `agents/review-change.agent.md` residual-only per-capability contract
- [x] 3.4 `skills/_shared/gate-4r-review.md` body rewrite (deterministic-first, v2 domains, lineage boundary)
- [x] 3.5 `scripts/review-change-contract.test.js`
- [x] 4.1 `agents/sdd-orchestrator.agent.md` dual-bind allowlist (ACTIVE_V2 + review-change/correction)
- [x] 4.2 `scripts/lib/model-resolver.js` require active six; allow legacy four
- [x] 4.6 `scripts/configure/validate-cursor.js` live readonly roster = active six; legacy 4R optional
- [x] 4.7 Configure tests + `__fixtures__/source/models.yaml`; goldens regen from fixture source
- [x] 4.9 `scripts/model-tier-contract.test.js`
- [x] 4.10 `scripts/lib/target-transform.test.js`
- [x] 5.1 RED/GREEN `scripts/review-lineage.test.js` (v2 owners, mixed fail-closed, dual-schema correction, migrate preconditions, receipt in digest)
- [x] 5.2 RED/GREEN `scripts/review-lineage-o4-migration.test.js` (v1 fixture bytes preserved; v2 migrate cases)
- [x] 5.3 GREEN `scripts/lib/review-lineage.js` (dual schema, `migrateLineageTaxonomyV2`, v2 lens owners, follow-ups)
- [x] 5.4 `skills/review-correction/SKILL.md` + `agents/review-correction.agent.md` dual-schema owners
- [x] 5.5 `scripts/review-correction-contract.test.js`
- [x] 5.9 `scripts/selective-4r-parity.test.js` (union/ambiguity mutants; PROBE v2)
- [x] 5.10 Shared convention/rules docs (`openspec-convention.md`, `sdd-phase-common.md`, `sdd-common.instructions.md`, `sdd-openspec.instructions.md`)
- [x] 6.3 Docs sweep: `docs/sdd-routing.md`, `docs/target-capabilities.md`, `docs/sdd-lifecycle-hooks.md`, `README.md`, `openwiki/agents-skills/agents-and-skills.md`
- [x] 6.4 Targeted suite: **466 pass, 0 fail, 2 skipped** (`node --test scripts/review-*.test.js scripts/lib/review-taxonomy.test.js scripts/lib/quality-review-kpis.test.js scripts/hooks/subagent-stop.test.js scripts/selective-4r-parity.test.js scripts/evals/safe-export.test.js scripts/configure/*.test.js`)
- [x] 6.5 Atomic contract smoke: `atomic-smoke-ok` (config gate key, mixed taxonomy fail-closed, v2 agent files present)

### Focused TDD evidence (batch 2 highlights)

| Task | Test File | Layer | Safety Net | RED | GREEN | Notes |
| ---- | --- | ----- | ---- | --- | ----- | ----- |
| 2.1 | `review-dimensions.test.js` | classifier | taxonomy + gate | extended matrix | pass | scopes explicit; no POSIX; per-cap residual |
| 3.1 | `review-gate-state.test.js` | planner | dimensions | router cases | pass | ambiguous ≠ contract-remediation |
| 3.5 | `review-change-contract.test.js` | contract | parity probe | v2 envelope | pass | residual-only generalist |
| 5.1–5.3 | `review-lineage.test.js` | lineage | taxonomy | migrate + owners | pass | receipt in v2 digest |
| 5.9 | `selective-4r-parity.test.js` | integration | generated targets | union mutants | pass | regen goldens from fixture source |

### Files touched (batch 2)

| Area | Files |
|------|-------|
| Tests | `review-dimensions.test.js`, `review-gate-state.test.js`, `review-change-contract.test.js`, `review-lineage.test.js`, `review-lineage-o4-migration.test.js`, `review-correction-contract.test.js`, `selective-4r-parity.test.js`, `model-tier-contract.test.js`, `target-transform.test.js`, `configure/*.test.js` |
| Implementation | `review-lineage.js`, `model-resolver.js`, `validate-cursor.js` |
| Agents/skills | `sdd-orchestrator.agent.md`, `review-change.*`, `review-correction.*`, `gate-4r-review.md` |
| Docs | `README.md`, `docs/sdd-routing.md`, `docs/target-capabilities.md`, `docs/sdd-lifecycle-hooks.md`, `openwiki/...`, `openspec-convention.md`, `sdd-openspec.instructions.md` |
| Goldens | `scripts/configure/__fixtures__/golden/**` (from fixture source) |

### Deviations

None material — v1 legacy paths preserved; overflow retained only on v1 `deriveReviewDimensions`; CX0 METRICS not extended; K6d paths and `openspec/changes/archive/**` untouched.

### Issues / follow-ups

None blocking verify. Optional post-verify: active note in `docs/roadmaps/harness-evolution.md` (prose reference to shared gate protocol only).

## Remediation attempt 1 (verify_lineage V001–V003)

**Branch**: feat/k6d-cx0-parallel  
**Lineage**: recheck-pending (attempt 1/2)  
**Successor candidate**: `sha256:b3d93acc44810c57613fe8cfeb0875bf51b40f6c61b505bd9e6ee96976b12f67`

### Fixes applied

| Finding | Files | Validation |
|---------|-------|------------|
| V001 | `quality-review-kpis.js`, `.test.js` | KPI_NAMES spec set; CX0 sources; router_delta_rate denominator = review-change invocations |
| V002 | `subagentstop_test.go` | Go test expects 7 quality rows (trust/runtime/evolution/efficiency + change/correction) |
| V003 | `benchmark.js`, `live-driver.js` | `quality_review_defects` / Quality-review defects column replaces 4R |

### Frozen validation (all exit 0)

- `node -e` KPI_NAMES assertion
- `node --test scripts/lib/quality-review-kpis.test.js`
- `go test ./internal/hooks/ -run TestSubagentStop_ReviewPhaseCostAllowlistAndRelaunch`
- `node -e` benchmark.js quality-review defect probe
