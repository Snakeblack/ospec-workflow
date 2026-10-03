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
The deterministic pilot executor runs both arms (pilot slices P2a, P2b and P2c).

## Modules

| Module | Responsibility |
| --- | --- |
| `obligation-oracle.js` | Versioned catalog of expected obligations per fixture, external to the task-contract producer. `compareObligations` reports `missing`/`unexpected`/`matched`; the verdict fails only when a catalog `must` obligation is absent from the observed manifest/executionGraph. Complements the K6b verifier: it detects omissions the executor's own contract cannot see. |
| `run-manifest.js` | `RunManifest v1` (`schemas/kernel/run-manifest/v1.schema.json`): binds one run to fixture, policy, repetition, order seed, isolated worktree/cache namespace, evaluator, host, oracle catalog digest, and outcome. Fail-closed builder; deterministic content-derived `run_id`; canonical digest. |
| `cohort.js` | Loads and shape-validates a cohort: bidirectional catalog↔workspace matching, strata coverage, holdout families. `validatePilotCohortShape` adds the Adaptive Repair pilot shape (slice P3): 20–24 tasks, local-reversible and behavior-repair at least as large as the other strata, and two holdout families per stratum so one can be reserved. The cohort lives at `scripts/evals/__fixtures__/k12/` (catalog `k12-pilot-1`: 22 tasks — 6 local-reversible, 7 behavior-repair, 5 multi-module, 4 adversarial — and 4 holdout families). |
| `pilot-executor.js` | Deterministic Adaptive Repair pilot executor (P2a–P3; judged in P4). Per fixture, a scripted worker output (`pilot.json` v2: base files, one patch, declared obligations, allowed paths, one check per evidence role, and seeded-defect variants) feeds both arms. Each arm compiles its own Execution Graph under its own `PolicySnapshot`; every output then runs through reproduction (acceptance checks must fail on the base), the K4b pure stages (`integrateWorkResultPatches`, K3 Candidate freeze), runtime observation of the checks against the candidate files (only passing checks yield evidence and a runner receipt), the K6b verifier and `compareObligations` (oracle applied). Seeded defects must be rejected at a declared stage: `wrong-patch` and `stale-receipt` at verify, `complacent-test` at reproduction, `scope-drift` at integration; accepted variants are reported as escaped, rejections at another stage fail the run as misattributed. Injected kernel faults (`faults`) run the clean pipeline as the `complete` effect of a one-node lifecycle through the public K2 harness: `interrupt-pre-effect` must resume and run the effect exactly once, `interrupt-mid-executor` must fail closed with `reconciliation-required` without re-running it, and `bypass-without-permit` must be blocked as `unauthorized` before any effect while the authorized retry completes; a fault with any other behavior escapes and fails the run (`interruptions`/`recoveries` record the counts). Arm plans come from the live routing table (`lite` for local-reversible, `bugfix` for behavior-repair, multi-module and adversarial); a multi-module repair is one node whose allowed paths span every touched module. The Repair recipe compresses phases and inherits every control gate. Both arms share every detection stage, so detection parity is the expected result. It does not measure worker isolation (K6a) or model quality; phase counts are a declared hypothesis; checks run in `node:vm` over repository-owned fixtures, not as a sandbox. Runs outside the pilot strata are recorded as excluded. Run with `node scripts/k12-campaign.js --paired --seed <seed>`. |
| `pilot-checkpoint.js` | Checkpoint of the pilot (slice P4). `loadPilotMargins` reads the predeclared margins (`scripts/evals/__fixtures__/k12/pilot-margins.json`: non-inferiority, practical improvement, holdout family per stratum) before any run and digests them; `evaluatePilotCheckpoint` judges the paired runs and report: any fixed veto (`must-omitted`, `fault-escaped`, `defect-regression`, `pass-regression`) rejects, anything that keeps the comparison from being judged or a missed margin revises, otherwise `continue`. `k12-campaign.js --paired` prints it and exits 1 on `reject`. |
| `runner.js` | `planRuns` (deterministic seeded shuffle per repetition; unique worktree/cache per run; planned manifests never claim outcomes), `executePlan` (sequential, injectable executor, immutable records), `summarizeCohort` (task-grouped variance: repetitions are correlated, the task is the statistical unit; explicit numerators/denominators; exclusions listed, never dropped; `usable-baseline` verdict only for complete cohorts; rejects mixed policies), `planPairedRuns` (both arms per fixture repetition, same task order as `planRuns`, seeded arm order, per-arm worktree/cache), `summarizePairedCohort` (per-task paired deltas adaptive − fixed, cohort mean/sd/95% t interval over tasks, regressions as veto candidates, seeded-defect tallies per arm with adaptive-only escapes as `defect_regressions`, excluded pairs listed, unapplied oracles counted, `usable-comparison` only when every pair is complete). |

## Growth path (not yet built)

- **Operational campaign bridge**: `campaign-executor.js` materializes each
  task workspace and runs the fixed lifecycle through the K2 Minimal Kernel
  Harness, with interruption and recovery for adversarial fixtures. Run the
  three-repetition machinery baseline with
  `node scripts/k12-campaign.js --seed <seed>`. This measures lifecycle
  machinery only; model-level quality still requires real agents.
- **Real-agent calibration**: the deterministic pilot reached `continue`
  (see `docs/analysis/2026-10-03-adaptive-pilot-report.md`); the next cut runs
  the same margins with versioned model/effort agents.
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
