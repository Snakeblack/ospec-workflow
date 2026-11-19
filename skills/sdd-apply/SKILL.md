---
name: sdd-apply
description: "Turn the assigned SDD tasks into code and tests within the approved behavior contract. Trigger: orchestrator launches apply for one or more change tasks."
disable-model-invocation: true
user-invocable: false
license: MIT AND Commons-Clause
metadata:
  author: manuel-retamozo-garcia
  version: "4.0"
  delegate_only: true
runtime_capabilities:
  execute: true
  mcp: false
  write: true
---

> **ORCHESTRATOR GATE**: an orchestrator that loaded this skill hands it to the
> `sdd-apply` executor through its host's sub-agent mechanism and does not run
> it in its own thread. Only that executor follows the steps below.

## Role

The implementation phase. The executor turns the tasks of one batch into code
and tests and changes nothing the behavior contract does not ask for. The
route decides the contract: proposal, specs and design on the standard route,
`proposal-lite.md` on the lite route.

## Inputs

The launch prompt names:

- the change and the task ids of this batch (`1.1-1.3`, for example);
- the artifact store, `openspec` or `none`;
- the delivery strategy (`ask-on-risk`, `auto-chain`, `single-pr` or
  `exception-ok`) and, when the forecast demanded a decision, the one taken:
  the PR slice to build or `size:exception`;
- the implementation mode, `standard` or `lite`.

## Artifact store

Reading and writing artifacts follow Sections B and C of
`skills/_shared/sdd-phase-common.md`.

- `openspec`: paths as `skills/_shared/openspec-convention.md` sets them.
  `openspec/changes/{change-name}/state.yaml` and the phase artifacts carry
  the state to resume from; the conversation never does. Task marks go to
  `tasks.md` and the batch's record to `apply-progress.md`.
- `none`: the project stays untouched. No source, test, task, progress or
  lineage file is created or edited, and no remediation runs that would write.
  The code and the progress of the batch travel inline in the result, and the
  steps below describe that result rather than writes.

## Steps

### Step 1: Load the procedure

Section A of `skills/_shared/sdd-phase-common.md`: this skill, the common
protocol, the memory files listed for this phase and the compact project rules
of the launch prompt.

### Step 2: Choose the path

The path is chosen from `state.yaml` before any backlog context is read.

#### Step 2a: Remediation

This path runs when the orchestrator asks for remediation or `state.yaml`
holds `verify_lineage.status: remediation-pending`, and it needs that status.

1. `prepareRemediation(verify_lineage, { changeRoot })`, from
   `{{ospec-runtime}}/scripts/lib/verify-lineage.js`, restores the frozen
   baseline from `verify_lineage.candidate_recovery.current` and nowhere else,
   and checks its blob digest and canonical `candidate_id`. A Candidate held in
   memory never stands in for it. When recovery blocks or reports
   `candidate-drift`, return at once: no file edited, no attempt counted.
2. Read the frozen findings in `verify_lineage.findings` and nothing more:
   their `summary`, `validation` and `allowed_paths`. The backlog, the full
   specs and design, code the findings do not name and the workload forecast
   stay unread.
3. Fix each finding by editing only the files in its `allowed_paths`. No task
   or feature joins the fix.
4. Take the successor with `captureCandidateSnapshot(changeRoot, { rootDir })`,
   from `{{ospec-runtime}}/scripts/lib/verify-lineage-candidate-store.js`, read
   it back with `verifyLiveWorkspace: true`, and pass it to
   `recordRemediationAttempt(verify_lineage, { changeRoot, candidate, candidate_snapshot, rootDir })`.
   The changed paths come from the persisted baseline and successor Git trees
   alone, never from a digest label, a list of paths or a description. The
   lineage points to the successor, and reaches `recheck-pending`, only once
   its record and snapshot are persisted and validate again.
5. Write the returned `verify_lineage` to `state.yaml`, add the attempt to
   `apply-progress.md` and return `success`, or `blocked` when the fix failed.
   The backlog does not run in this launch.

A recovery successor waiting in `recheck-pending`, and a directed operation
still being reconciled, follow the last two sections of this skill instead.

#### Step 2b: Backlog context

1. `state.yaml.route.actual_route` comes first and decides the contract. A
   mode in the prompt that disagrees with it blocks the run.
2. `tasks.md`, and `apply-progress.md` when it exists.
   `resolveRemainingTasks(tasksContent, applyProgressContent)`, from
   `{{ospec-runtime}}/scripts/lib/apply-resume.js`, gives the tasks still open,
   so work already marked `[x]` is not repeated. Task ids are dotted numbers
   (`1.2.3`); every line in its `unparsed` list goes back to the orchestrator
   rather than getting a guessed state.
3. The contract of the route: on `standard`, the proposal, specs and design,
   each one required; on `lite`, `proposal-lite.md` and the tasks, with spec
   and design absent by design.
4. The files the tasks touch, to follow their patterns, and the conventions of
   `config.yaml`.
5. `skills/_shared/engineering-judgment.md`, read once: proportional changes,
   claims that can be verified, an existing helper before a new layer, and no
   clean-up beyond the tasks.

#### Step 2c: Review budget

The tasks artifact may carry a `Review Workload Forecast` (Section E of
`skills/_shared/sdd-phase-common.md`). When it reads
`400-line budget risk: High`, `Chained PRs recommended: Yes` or
`Decision needed before apply: Yes`, the batch needs a delivery path settled
in the prompt:

- `auto-chain`, or a chained or stacked mode the user chose: build only the
  assigned slice, keep it autonomous and report where its PR ends;
- `exception-ok`, or one PR over the budget: only when the prompt says the
  maintainer accepts `size:exception`.

With no settled path, write nothing and return `blocked`, asking the
orchestrator to have the user pick `stacked-to-main`, `feature-branch-chain`
or `size:exception`, because the work may pass the 400 changed lines of one
review. A low forecast needs no chain strategy just because the field is
missing.

A `Chain strategy` other than `pending` fixes where each PR points. With
`stacked-to-main`, each PR targets the branch of the one before it, or `main`
once that one merged. With `feature-branch-chain`, the first PR targets the
tracker branch, each later PR the one before it, and no child PR targets
`main`: the tracker PR brings the whole branch there, and each child diff
holds only its own work unit.

While building, compare the real size with the forecast. If it grows more
than half again over it, or would cross the 400 lines before the next task
boundary, stop before that task, persist what is done with accurate marks and
return `partial` with risk `workload-escalation`.

### Step 3: TDD mode

`testing.tdd_mode` in `openspec/config.yaml` is the only source of the mode.
Without a `testing` section, the project's own files (`package.json`,
`go.mod`, `pyproject.toml`) tell whether a test runner exists.

| `testing.tdd_mode` | Mode | Module to read |
|---|---|---|
| `strict` | Strict TDD, with or without a runner | `skills/sdd-apply/strict-tdd.md` |
| `focused`, with a runner | Focused TDD | `skills/sdd-apply/focused-tdd.md` |
| `standard`, or no runner and not `strict` | Standard | none |

Read only the module of the resolved mode and keep the mode for the result.
Strict without a runner defers execution as its module explains; it never
turns into Standard, silently or otherwise. Under Strict TDD the progress must
carry the TDD Cycle Evidence table of that module, one row per task. A task
built without its test first appears there as failed, and verify rejects a
missing or incomplete table.

### Step 4: Implement Tasks

Standard runs the cycle of Step 4a. Focused and Strict swap in the cycle of
their module and change nothing else. In every mode the guards under Rules
come before each task: the task agrees with the contract and the design, stays
inside the assigned scope, the remaining size is estimated again, and each
mark tells the truth. On `blocked: spec-change-required` or `blocked: design-mismatch`, persist partial progress for the tasks of this batch already completed, then stop.

#### Step 4a: Standard cycle

For each task:

1. Read the task, then the spec scenarios and design decisions it touches, or
   `proposal-lite.md` on the lite route.
2. Check the guards under Rules.
3. Write the change in the style of the surrounding code.
4. Run the cheapest local check that covers it.
5. Mark the task `[x]` when the change and its check both passed, or `[~]` when
   the code exists but the check has not run yet.
6. Estimate the remaining size again and note any deviation before the next
   task.

### Step 5: Task marks

`tasks.md` changes as each task changes state, not at the end:

| Mark | Meaning |
|---|---|
| `[ ]` | not started |
| `[~]` | implemented, local check still pending |
| `[x]` | implemented and checked locally |

```markdown
## Phase 2: Currency validation

- [x] 2.1 Accept only ISO 4217 codes in `src/orders/schema.ts`
- [~] 2.2 Reject unsupported currencies in `src/orders/service.ts`
- [ ] 2.3 Map the new error to HTTP 422 in `src/api/errors.ts`
```

### Step 6: Persist the progress

Required with `openspec`: Section C of `skills/_shared/sdd-phase-common.md`,
artifact `apply-progress` at `openspec/changes/{change-name}/apply-progress.md`,
plus the marks in `tasks.md`.

`apply-progress.md` only grows:

1. Whatever the file held when Step 2b read it stays as it was; this batch
   goes after it. The file is never regenerated from memory.
2. Use the host's append operation when it has one, or else the smallest edit
   that only adds lines.
3. Each new entry gives the task id, its mark, the local check behind the mark
   and any blocker or deviation found in this batch.
4. No earlier section is rewritten to add an entry.

### Step 7: Return the result

The envelope of Section D of `skills/_shared/sdd-phase-common.md`, with this
report:

```markdown
## Implementation Progress

**Change**: {change-name}
**Route**: {standard | lite}
**Mode**: {Strict TDD | Focused TDD | Standard}

### Tasks of this batch
- [x] {id} {what now works}
- [~] {id} {what still awaits its local check}

### Files Changed
| File | Action | Summary |
|---|---|---|
| `{path}` | {created | modified | deleted} | {one line} |

{Strict TDD: the TDD Cycle Evidence table and the Test Summary of strict-tdd.md}

### Deviations
{each departure from design.md or proposal-lite.md and its reason, or "None"}

### Issues
{each problem found while building, or "None"}

### Still open
- [ ] {id} {task}

### Delivery boundary
- Delivery: {one PR | slice of a chained PR | slice of a stacked PR | size:exception}
- Work unit: {name, or N/A}
- From / to: {where this batch starts and where it ends}
- Review budget: {estimated changed lines against the 400 of one review}

### Status
{done}/{total} tasks. {Next batch | Ready for verify | Blocked: reason}
```

## Rules

- On the backlog path the route comes first: `standard` needs proposal, specs and design; `lite` needs `proposal-lite.md` and the tasks and accepts missing spec and design. Remediation (Step 2a) works only from its frozen findings and their paths.
- The contract's decisions bind. A detail it leaves open may be settled with evidence under the assumption rule of Section D of `skills/_shared/sdd-phase-common.md`; an approved boundary is never redrawn.
- Follow the patterns and conventions the project already has.
- With `openspec`, `tasks.md` follows each task as it changes, not at the end of the batch.
- A contract that is wrong, incomplete, contradictory or cannot be verified: persist partial progress for the tasks of this batch already completed, then stop with `blocked: spec-change-required`, naming the spec or the lite proposal at fault. The contract is never patched in passing.
- Code that contradicts the design (an API, module or dependency the design assumes is missing or different, or an approach that cannot fit a pattern the code already set): persist partial progress for the tasks of this batch already completed, then stop with `blocked: design-mismatch`, citing the contradiction and the section of `design.md`. A cosmetic difference, such as another name or an existing helper that fulfils the same contract, is no mismatch: use the existing code and go on.
- Anything else that blocks a task unexpectedly: stop and report it.
- A forecast that demands a decision nobody supplied: write nothing (Step 2c).
- A size that outgrows the forecast by more than half, or the 400-line budget: persist, then return `partial` with `workload-escalation`.
- On the lite route `proposal-lite.md` is the acceptance contract. Work that outgrows a small change returns `blocked` with `escalate-to-standard-sdd`.
- A chained or stacked slice is one deliverable: its own scope, its verification and a clean point to roll back to.
- A batch under `size:exception` says so in `apply-progress.md` and in the result.
- Commits of a work unit of an active change carry, in the message body, the trailers `Ospec-Change: {change-name}` and `Ospec-Task: {task-number}`, with several task numbers separated by commas. While a change is active the `commit-msg` hook checks their format without blocking, and the traceability matrix of verify joins commits to REQs through them.
- Only the assigned tasks.
- Project skills give technical judgment inside this contract, weighed with `skills/_shared/engineering-judgment.md`; their examples are not required architecture. `rules.apply` from `openspec/config.yaml` applies too.
- Strict and Focused TDD replace only the cycle of Step 4a. Guards, remediation routing, persistence limits and the meaning of the marks hold in every mode.
- `[x]` means implemented and checked locally; `[~]` means implemented and not checked yet.
- The result uses the envelope of Section D of `skills/_shared/sdd-phase-common.md`.

### Evidence-only repair under Strict TDD

The `json:strict-tdd-evidence` block of `apply-progress.md` (schema v1,
described in `skills/sdd-apply/strict-tdd.md`) may disagree with the table
derived from it while the work itself is right. Only that disagreement has a
repair narrower than ordinary remediation, and
`{{ospec-runtime}}/scripts/lib/strict-tdd-evidence-remediation.js` decides it:

1. `reduce(null, { type: "classify", ... })` runs `classifyRemediation`. It
   needs a real `rootDir`, the digests of the candidate, the finding and the
   evidence file, before and after snapshots of the evidence, an original
   CRITICAL finding with a non-empty origin, and a gap between block and table
   that it observes in the file itself. Anything missing, unverifiable or
   different, including identity drift, a material functional change or an
   invalid cap, gives `ordinary-routing`: keep the CRITICAL finding and use
   ordinary remediation. A repair keeps that finding, the candidate id and the
   sorted genesis paths unchanged.
2. `repair-pending` allows one write: the evidence region of
   `apply-progress.md`, within the configured cap and never above 40 changed
   lines. Persist the returned state before writing; production, spec and
   test files stay out of reach. Then pass the `write` event, with the
   snapshots and digests it asks for, to `reduce`.
3. `recheck-pending` returns a `next_action` of type `run-focal-recheck`: one
   verify recheck focused on the original finding, never repeated. Its outcome
   goes back to `reduce` as a `focal-recheck` event.

At the write and at the recheck the reducer hashes the functional files again
and compares the exact evidence region, so a change outside that region,
candidate drift or a write it cannot reconcile falls back to ordinary
remediation, as does any other state or a failure at any step.

### Recovery successor and directed operations

An approved recovery successor in `recheck-pending` enters neither ordinary
remediation nor full discovery. It needs its persisted Candidate snapshot and
runs only the frozen recipes of its findings through
`runRecoverySuccessorRecheck`, from
`{{ospec-runtime}}/scripts/lib/verify-lineage-recheck.js`; a result supplied
by the caller is never authority.

A directed operation whose reconciliation is pending, unknown or preserved as
terminal outranks the generic candidate or contract drift routing. An old
journal entry is never replayed, overwritten or promoted: only an approved,
audited reconciliation successor may open a new directed journal.
