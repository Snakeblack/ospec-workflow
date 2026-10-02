# K12 focal corpus — measurement contract

First cut of the K12 focal slice (roadmap priority 4; canonical design:
"Evaluación mínima útil: K12 focal antes de K9" in
`docs/architecture/ospec-adaptive-critical-design.md`). This directory holds
the **measurement contract** for the focal corpus: what a run is, what the
independent obligations oracle expects, and how repetitions aggregate into a
baseline. It is derived measurement tooling — it grants no operational
authority and does not activate any Adaptive runtime. `fixed` is the control
policy; the Adaptive Repair pilot adds one recorded arm, `adaptive-repair-v1`
(see [`docs/analysis/2026-10-02-adaptive-pilot-scoping.md`](../../../docs/analysis/2026-10-02-adaptive-pilot-scoping.md)).
No executor for that arm exists yet (pilot slice P2).

## Modules

| Module | Responsibility |
| --- | --- |
| `obligation-oracle.js` | Versioned catalog of expected obligations per fixture, external to the task-contract producer. `compareObligations` reports `missing`/`unexpected`/`matched`; the verdict fails only when a catalog `must` obligation is absent from the observed manifest/executionGraph. Complements the K6b verifier: it detects omissions the executor's own contract cannot see. |
| `run-manifest.js` | `RunManifest v1` (`schemas/kernel/run-manifest/v1.schema.json`): binds one run to fixture, policy, repetition, order seed, isolated worktree/cache namespace, evaluator, host, oracle catalog digest, and outcome. Fail-closed builder; deterministic content-derived `run_id`; canonical digest. |
| `cohort.js` | Loads and shape-validates a cohort: bidirectional catalog↔workspace matching, strata coverage, holdout families. The seed cohort lives at `scripts/evals/__fixtures__/k12/` (11 tasks, 4 strata, 4 holdout families). |
| `runner.js` | `planRuns` (deterministic seeded shuffle per repetition; unique worktree/cache per run; planned manifests never claim outcomes), `executePlan` (sequential, injectable executor, immutable records), `summarizeCohort` (task-grouped variance: repetitions are correlated, the task is the statistical unit; explicit numerators/denominators; exclusions listed, never dropped; `usable-baseline` verdict only for complete cohorts; rejects mixed policies), `planPairedRuns` (both arms per fixture repetition, same task order as `planRuns`, seeded arm order, per-arm worktree/cache), `summarizePairedCohort` (per-task paired deltas adaptive − fixed, cohort mean/sd/95% t interval over tasks, regressions as veto candidates, excluded pairs listed, unapplied oracles counted, `usable-comparison` only when every pair is complete). |

## Growth path (not yet built)

- **Operational campaign bridge**: `campaign-executor.js` materializes each
  task workspace and runs the fixed lifecycle through the K2 Minimal Kernel
  Harness, with interruption and recovery for adversarial fixtures. Run the
  three-repetition machinery baseline with
  `node scripts/k12-campaign.js --seed <seed>`. This measures lifecycle
  machinery only; model-level quality still requires real agents.
- **Corpus growth**: seed 11 tasks → 20–30 tasks × 3 repetitions per policy,
  stratified, with holdout rotation and exposure logging.
- **Margins**: non-inferiority/practical-improvement/veto margins are a
  product decision that requires this baseline first; they are deliberately
  not invented here.

## Guarantees kept

- `fixed` remains the default and the control arm; recording or comparing the
  `adaptive-repair-v1` arm promotes nothing and gates no delivery.
- Planning never fabricates outcomes (`outcome.status = "incomplete"` until a
  real executor reports).
- Determinism: identical seed + catalog digest ⇒ identical run order and
  identical plans (byte-equal JSON).
- Fail-closed everywhere: malformed catalogs, manifests, options, and
  cohort/workspace mismatches throw typed errors; `validateRunManifest` and
  `validateCohortShape` are non-throwing for report consumers.
