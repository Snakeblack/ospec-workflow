# Delta for skills

## MODIFIED Requirements

### Requirement: Baseline Fingerprint Recording and Verification

`sdd-spec` MUST declare, for each delta domain it writes (Step 5b), the domain name
under a `touched_baseline_domains:` list in its return envelope — it MUST NOT compute
or write the SHA-256 fingerprint itself, since it has no execute tool capable of
hashing files. Immediately after `sdd-spec` returns `status: success`, the
ORCHESTRATOR MUST compute the SHA-256 fingerprint of each declared domain's current
baseline `openspec/specs/{domain}/spec.md` (or `null` if no baseline exists yet) and
write it into `state.yaml`'s `baseline_fingerprints:` block (see agents domain spec,
Orchestrator-Computed Baseline Fingerprints).

At archive time, stale-baseline detection MUST be enforced by the archive transaction
runtime during preflight (comparing `state.yaml` fingerprints and each plan
`spec_writes[].target_before_sha256` to live target bytes). `sdd-archive` MUST embed
the expected before-hashes in `archive-plan.json` and MUST NOT blind-merge deltas into
`openspec/specs/`. On mismatch the runtime MUST fail closed; the archive skill MUST
surface that failure via its return path / orchestrator halt rather than merging.
A missing `baseline_fingerprints` block (pre-feature changes) MAY skip the fingerprint
portion of preflight only when the plan's `target_before_sha256` checks still pass.

(Previously: `sdd-archive` itself re-hashed baselines in Step 2 and returned
`blocker_type: stale-baseline` before merging.)

#### Scenario: sdd-spec declares a touched domain without computing a hash

- GIVEN `sdd-spec` writes a delta for domain `auth`
- WHEN Step 5b runs
- THEN `sdd-spec` adds `auth` to `touched_baseline_domains` in its return envelope
- AND `sdd-spec` does NOT compute or write any SHA-256 value itself
- AND `state.yaml.baseline_fingerprints` is left untouched by `sdd-spec`

#### Scenario: Fingerprint computed by the orchestrator after spec returns

- GIVEN `sdd-spec` returned `status: success` with `touched_baseline_domains: [auth]`
- WHEN the orchestrator processes the return
- THEN `state.yaml.baseline_fingerprints.auth` holds the SHA-256 of the current
  baseline spec (or `null` if no baseline exists yet), written by the orchestrator

#### Scenario: Stale baseline detected at archive preflight

- GIVEN another change already merged into `openspec/specs/auth/spec.md` after this
  change's fingerprint / `target_before_sha256` was recorded
- WHEN the archive transaction runtime runs preflight for the plan
- THEN the hashes mismatch and the transaction fails closed
- AND live specs are not blind-merged by `sdd-archive`

### Requirement: sdd-archive ADR Promotion

The `sdd-archive` skill MUST, after persisting the archive report and writing
resolved decisions to memory, include every ADR from
`openspec/changes/{change-name}/decisions/adr-*.md` whose decision was NOT
invalidated during verify as an `adr_promotions[]` entry in `archive-plan.json`
(source path, intended `docs/adr/adr-{YYYYMMDD}-{NNN}-{kebab-title}.md` target,
`content_sha256`). On planned filename collision, the plan MUST bump `NNN` past the
highest existing suffix for that date. The skill MUST NOT write live `docs/adr/**`
files itself; the archive transaction runtime applies promotions during commit.
Change-local `decisions/` copies stay in the change folder and travel unchanged into
the archived folder as the audit trail; `docs/adr/` remains the living project memory
once the runtime commits.

(Previously: `sdd-archive` copied ADRs into `docs/adr/` during Step 4b before the
folder move.)

#### Scenario: ADR listed in plan for runtime promotion

- GIVEN a change folder contains `decisions/adr-001.md` with `Status: proposed`
- WHEN `sdd-archive` emits `archive-plan.json`
- THEN `adr_promotions` includes that ADR with target under `docs/adr/` and
  `content_sha256`
- AND the skill has not yet created the live `docs/adr/` file

#### Scenario: No decisions directory — empty promotions

- GIVEN a change folder has no `decisions/` directory
- WHEN `sdd-archive` emits the plan
- THEN `adr_promotions` is an empty array and plan emission continues without error

### Requirement: sdd-archive Plan-and-Report Contract

`sdd-archive` MUST be scoped to semantic archive work the executor can perform:
interpreting deltas, preparing resulting spec content (with hashes), detecting
semantic conflicts, proposing ADR promotions, recording accepted warnings,
persisting the archive report, and emitting `archive-plan.json` plus a return
envelope that references the plan. The executor MUST NOT delete the source directory
`openspec/changes/{change-name}/`, MUST NOT copy the change folder to
`openspec/changes/archive/...` as the completion mechanism, MUST NOT write live
`openspec/specs/**` as the closure write path, and MUST NOT claim in its return
envelope or report that the move is "complete" or that the source no longer exists —
completion (transaction + receipt) is the orchestrator's runtime invocation
responsibility (see agents domain, Orchestrator-Owned Archive Move Completion).

The plan's `archive_inventory` MUST list the origin paths that the runtime must
preserve into the archived folder. The executor MAY still materialize prepared
content as change-local artifacts for hashing, but live promotion/commit is runtime-
owned.

(Previously: Copy-and-Report — executor copied artifacts to the destination archive
path and reported a copy-inventory list for an orchestrator ad-hoc diff.)

#### Scenario: Executor reports plan instead of claiming completion

- GIVEN `sdd-archive` finishes semantic preparation
- WHEN it composes its return envelope
- THEN the envelope references `archive-plan.json` (path and/or inventory summary)
- AND the envelope does NOT assert that the source directory has been deleted or that
  the "move is complete"

#### Scenario: Partial semantic prep is reported, not concealed

- GIVEN the executor cannot produce a complete valid plan (e.g. unresolved semantic
  conflict or missing prepared content hash)
- WHEN it returns to the orchestrator
- THEN it MUST NOT return `status: success` with an incomplete plan presented as ready
- AND it MUST NOT imply that the archive operation is finished
- Evidence: static contract-test anchor on Plan-and-Report / "MUST NOT claim" strings

#### Scenario: Source directory left intact by the executor in all cases

- GIVEN `sdd-archive` completes plan emission and archive-report persistence
- WHEN the executor's run ends
- THEN the source directory `openspec/changes/{change-name}/` still exists on disk
- AND no instruction in the `sdd-archive` skill directs the executor to delete it
- Evidence: static contract-test anchor on the `sdd-archive` SKILL.md source text

### Requirement: sdd-archive Cost Summary Block

Archive cost for closure authority MUST appear on the transaction runtime receipt
(see `archive-transaction-runtime`). The receipt MUST aggregate
`.ospec/session/{change-name}/phase-costs.jsonl` when present:

- **Aggregation Rules**: Group records by `phase`, summing `duration_ms` and each of
  the four estimated token categories (`estimated_prompt_tokens`,
  `estimated_artifact_tokens`, `estimated_tool_output_tokens`, and
  `estimated_output_tokens`), listing distinct `model_tier`s and return `status`es.
- **Relaunches calculation**: `invocations - 1` (floored at 0) per phase.
- **Total user questions asked**: sum of `gates.*.questions_asked` from `state.yaml`.
- **Fail-safe Fallback**: If the cost JSONL is missing or empty, receipt emission
  MUST NOT fail; cost MUST be marked unavailable / empty explicitly.

The `sdd-archive` skill MAY still render a human-readable `## Cost` section in
`archive-report.md` using the same rules, but that section MUST NOT be treated as
proof that the archive move completed. Token column headers/values MUST remain
labeled "estimated".

(Previously: `sdd-archive` alone parsed JSONL and appended Cost to `archive-report.md`
as the Cost contract.)

#### Scenario: Cost data on success receipt

- GIVEN the change has cost entries in `phase-costs.jsonl`
- WHEN the runtime emits a success receipt
- THEN the receipt includes the aggregated cost table fields
- AND all token fields remain labeled as estimated

#### Scenario: Missing cost data does not block receipt

- GIVEN `phase-costs.jsonl` is missing or empty
- WHEN the runtime emits a receipt after an otherwise successful transaction
- THEN cost is explicitly marked unavailable / empty
- AND outcome remains driven by transaction success, not cost presence
