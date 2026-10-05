# K12 focal corpus — measurement contract

First cut of the K12 focal slice (roadmap priority 4; canonical design:
"Evaluación mínima útil: K12 focal antes de K9" in
`docs/roadmaps/archive/2026-10-03-arquitectura/ospec-adaptive-critical-design.md`). This directory holds
the **measurement contract** for the focal corpus: what a run is, what the
independent obligations oracle expects, and how repetitions aggregate into a
baseline. It is derived measurement tooling — it grants no operational
authority and does not activate any Adaptive runtime. `fixed` is the control
policy; the Adaptive Repair pilot adds one recorded arm, `adaptive-repair-v1`
(see [`docs/analysis/2026-10-02-adaptive-pilot-scoping.md`](../../../docs/analysis/2026-10-02-adaptive-pilot-scoping.md)).
The deterministic pilot executor that ran both arms (slices P2a–P3) and the
operational campaign bridge were retired in E1.5 (v2.96.0) together with the
kernel they drove; their last runs are kept as fixtures in
`scripts/evals/__fixtures__/k12/snapshots/`. E4.1 reuses the modules below to
record and compare real agents.

## Modules

| Module | Responsibility |
| --- | --- |
| `obligation-oracle.js` | Versioned catalog of expected obligations per fixture, external to the task-contract producer. `compareObligations` reports `missing`/`unexpected`/`matched`; the verdict fails only when a catalog `must` obligation is absent from the observed manifest/executionGraph. Complements the K6b verifier: it detects omissions the executor's own contract cannot see. |
| `run-manifest.js` | `RunManifest v1` (`schemas/kernel/run-manifest/v1.schema.json`): binds one run to fixture, policy, repetition, order seed, isolated worktree/cache namespace, evaluator, host, oracle catalog digest, and outcome. Fail-closed builder; deterministic content-derived `run_id`; canonical digest. |
| `cohort.js` | Loads and shape-validates a cohort: bidirectional catalog↔workspace matching, strata coverage, holdout families. `validatePilotCohortShape` adds the Adaptive Repair pilot shape (slice P3): 20–24 tasks, local-reversible and behavior-repair at least as large as the other strata, and two holdout families per stratum so one can be reserved. The cohort lives at `scripts/evals/__fixtures__/k12/` (catalog `k12-pilot-1`: 22 tasks — 6 local-reversible, 7 behavior-repair, 5 multi-module, 4 adversarial — and 4 holdout families). |
| `pilot-checkpoint.js` | Checkpoint of the pilot (slice P4). `loadPilotMargins` reads the predeclared margins (`scripts/evals/__fixtures__/k12/pilot-margins.json`: non-inferiority, practical improvement, holdout family per stratum) before any run and digests them; `evaluatePilotCheckpoint` judges the paired runs and report: any fixed veto (`must-omitted`, `fault-escaped`, `defect-regression`, `pass-regression`) rejects, anything that keeps the comparison from being judged or a missed margin revises, otherwise `continue`. |
| `worker-record.js` | Recorded real-agent outputs for the calibration: `loadWorkerRecord` validates a record (versioned worker, protocol per arm, one patch + artifacts + usage per fixture and arm), `recordCohort` narrows the cohort to the recorded fixtures while keeping the catalog digest, and `summarizeWorkerUsage` reports per-task usage deltas. Records and the exact prompt protocol live in `scripts/evals/__fixtures__/k12/calibration/`; their replayed runs (agent duration as `wall_ms`) are judged against `calibration-margins.json`. |
| `runner.js` | `planRuns` (deterministic seeded shuffle per repetition; unique worktree/cache per run; planned manifests never claim outcomes), `executePlan` (sequential, injectable executor, immutable records), `summarizeCohort` (task-grouped variance: repetitions are correlated, the task is the statistical unit; explicit numerators/denominators; exclusions listed, never dropped; `usable-baseline` verdict only for complete cohorts; rejects mixed policies), `planPairedRuns` (both arms per fixture repetition, same task order as `planRuns`, seeded arm order, per-arm worktree/cache), `summarizePairedCohort` (per-task paired deltas adaptive − fixed, cohort mean/sd/95% t interval over tasks, regressions as veto candidates, seeded-defect tallies per arm with adaptive-only escapes as `defect_regressions`, excluded pairs listed, unapplied oracles counted, `usable-comparison` only when every pair is complete). |

## Growth path (not yet built)

- **Real-agent calibration**: done for behavior-repair (see
  `docs/analysis/2026-10-03-adaptive-pilot-report.md`); other strata and models
  add a new record and, if they need other margins, a new margins version first.
- **Margins**: declared in `pilot-margins.json` (`k12-pilot-margins-1`); a
  new campaign that needs other margins declares a new version first.

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
