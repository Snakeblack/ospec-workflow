# K12 focal corpus — measurement contract

First cut of the K12 focal slice (roadmap priority 4; canonical design:
"Evaluación mínima útil: K12 focal antes de K9" in
`docs/architecture/ospec-adaptive-critical-design.md`). This directory holds
the **measurement contract** for the focal corpus: what a run is, what the
independent obligations oracle expects, and how repetitions aggregate into a
baseline. It is derived measurement tooling — it grants no operational
authority and does not activate any Adaptive runtime. Policy is `fixed`
only; no second executable policy exists yet.

## Modules

| Module | Responsibility |
| --- | --- |
| `obligation-oracle.js` | Versioned catalog of expected obligations per fixture, external to the task-contract producer. `compareObligations` reports `missing`/`unexpected`/`matched`; the verdict fails only when a catalog `must` obligation is absent from the observed manifest/executionGraph. Complements the K6b verifier: it detects omissions the executor's own contract cannot see. |
| `run-manifest.js` | `RunManifest v1` (`schemas/kernel/run-manifest/v1.schema.json`): binds one run to fixture, policy, repetition, order seed, isolated worktree/cache namespace, evaluator, host, oracle catalog digest, and outcome. Fail-closed builder; deterministic content-derived `run_id`; canonical digest. |
| `cohort.js` | Loads and shape-validates a cohort: bidirectional catalog↔workspace matching, strata coverage, holdout families. The seed cohort lives at `scripts/evals/__fixtures__/k12/` (11 tasks, 4 strata, 4 holdout families). |
| `runner.js` | `planRuns` (deterministic seeded shuffle per repetition; unique worktree/cache per run; planned manifests never claim outcomes), `executePlan` (sequential, injectable executor, immutable records), `summarizeCohort` (task-grouped variance: repetitions are correlated, the task is the statistical unit; explicit numerators/denominators; exclusions listed, never dropped; `usable-baseline` verdict only for complete cohorts). |

## Growth path (not yet built)

- **Operational campaign bridge**: an executor that materializes each task
  workspace and drives it through the K2 Minimal Kernel Harness / conformance
  host (adversarial stratum via fault injection), recording O1 phase costs and
  CX0 context measurements into each run's outcome. The injectable-executor
  seam in `runner.js` is the integration point.
- **Corpus growth**: seed 11 tasks → 20–30 tasks × 3 repetitions per policy,
  stratified, with holdout rotation and exposure logging.
- **Margins**: non-inferiority/practical-improvement/veto margins are a
  product decision that requires this baseline first; they are deliberately
  not invented here.

## Guarantees kept

- `fixed` remains the only measured policy; nothing here promotes, compares,
  or gates delivery.
- Planning never fabricates outcomes (`outcome.status = "incomplete"` until a
  real executor reports).
- Determinism: identical seed + catalog digest ⇒ identical run order and
  identical plans (byte-equal JSON).
- Fail-closed everywhere: malformed catalogs, manifests, options, and
  cohort/workspace mismatches throw typed errors; `validateRunManifest` and
  `validateCohortShape` are non-throwing for report consumers.
