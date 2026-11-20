---
name: sdd-tasks
description: "Plan an SDD change as ordered, verifiable implementation tasks, with the review workload forecast that decides how it will be delivered. Trigger: orchestrator launches task planning for a change."
disable-model-invocation: true
user-invocable: false
license: MIT AND Commons-Clause
metadata:
  author: manuel-retamozo-garcia
  version: "3.0"
  delegate_only: true
runtime_capabilities:
  execute: false
  mcp: false
  write: true
---

> **ORCHESTRATOR GATE**: an orchestrator that loaded this skill hands it to the
> `sdd-tasks` executor through its host's sub-agent mechanism and does not run
> it in its own thread. Only that executor follows the steps below.

## Role

The task planning phase. The executor takes the accepted behavior contract of
the change, which is the proposal, specs and design on the full route and
`proposal-lite.md` on the lite route, and writes `tasks.md`: the work in
phases, in dependency order, each task small enough to finish and check, plus
the forecast of how much a reviewer will have to read.

## Inputs

The launch prompt names:

- the change name;
- the artifact store, `openspec` or `none`;
- the delivery strategy: `ask-on-risk`, `auto-chain`, `single-pr` or
  `exception-ok`;
- the planning mode, `full` or `lite`.

## Artifact store

Reading and writing artifacts follow Sections B and C of
`skills/_shared/sdd-phase-common.md`.

- `openspec`: paths as `skills/_shared/openspec-convention.md` sets them.
  `openspec/changes/{change-name}/state.yaml` and the phase artifacts carry
  the state to resume from; the conversation never does.
- `none`: the tasks travel inline in the result of Step 5, and no `openspec/`
  folder or project file is created.

## Steps

### Step 1: Load the procedure

Section A of `skills/_shared/sdd-phase-common.md`: this skill, the common
protocol and the compact project rules of the launch prompt.

### Step 2: Check the contract before planning

#### Lite route

1. `state.yaml.route.actual_route` is read first and decides. A planning mode
   in the prompt that disagrees with it blocks the run; prose never settles
   the conflict.
2. `openspec/changes/{change-name}/proposal-lite.md` is the behavior contract.
3. The change must still be `trivial` or `small` and still need no spec or
   design of its own. When it no longer fits, the phase returns `blocked`
   with the risk `escalate-to-standard-sdd`.
4. `tasks.md` carries `## Lite Change Contract` in place of
   `## Spec/Design Reconciliation`.

#### Full route

Every requirement and scenario of the specs is matched against the part of
the design that builds it, and each scenario gets one status:

- `covered-by-design`: the design gives it a clear path;
- `missing-design`: the specs ask for it and the design gives it no place;
- `ambiguous`: the specs and the design contradict each other, or neither is
  clear enough.

The statuses decide what happens next:

1. A MUST scenario in `missing-design` blocks the phase: it returns
   `status: blocked` and writes no `tasks.md`.
2. A SHOULD or MAY scenario in `missing-design` becomes a WARNING in the
   detailed summary, and planning goes on only while the core behavior can
   still be built.
3. An `ambiguous` scenario is named in the reconciliation section, and
   planning goes on only while the intended behavior can still be split into
   work that can be checked.

From the design come the files to create, modify or delete, the order they
depend on and the tests each part needs. Accepted quality scenarios and
architectural constraints go into the tasks they affect, as the observable
result and the way to check it, keeping the tradeoffs and evidence limits of
the design. No numeric target is invented and no task exists only to name a
quality attribute; an existing test or check that proves a scenario is
reused.

### Step 3: Write `tasks.md`

With `openspec`:

```
openspec/changes/{change-name}/
├── proposal-lite.md   (lite route)
└── tasks.md           (written by this phase)
```

On the full route the folder also holds `proposal.md`, the change-local
`specs/` and `design.md`. With `none`, nothing is created and the tasks are
returned inline.

#### Format

The route decides which of the first two sections appears: `## Lite Change
Contract` on the lite route, `## Spec/Design Reconciliation` on the full one.

```markdown
# Tasks: {Change Title}

## Lite Change Contract

- Change class: {trivial | small}
- Behavioral contract: {one line from `proposal-lite.md`}
- Acceptance checks: {the AC-N labels, briefly}
- Traceability: `AC-N` → task id → the command or inspection that proves it
- Escalation trigger: {what would move the change to full SDD}

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| {REQ id / scenario} | MUST | `{path}`, {interface or flow} | covered-by-design | {note} |
| {REQ id / scenario} | SHOULD | (none) | missing-design | {warning or blocker} |

### Reconciliation Verdict
- MUST coverage: {complete | blocked}
- SHOULD/MAY gaps: {none | which}
- Ambiguities to track: {none | which}

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | {a range} |
| 400-line budget risk | Low, Medium or High |
| Chained PRs recommended | Yes or No |
| Suggested split | {one PR, or PR 1 → PR 2 → …} |
| Delivery strategy | {the one received} |
| Chain strategy | {stacked-to-main, feature-branch-chain, size-exception or pending} |

Decision needed before apply: <Yes|No>
Chained PRs recommended: <Yes|No>
Chain strategy: <stacked-to-main|feature-branch-chain|size-exception|pending>
400-line budget risk: <Low|Medium|High>

### Suggested Work Units

| Unit | Delivers | PR | Notes |
|---|---|---|---|
| 1 | {something that works on its own} | PR 1 | {its base branch; tests and docs included} |
| 2 | {something that works on its own} | PR 2 | {its base, the PR it depends on, or independent} |

### Checklist Status Legend

- `[ ]` not started
- `[~]` built, local verification still pending
- `[x]` built and verified locally

## Phase 1: {name, for example Foundation}

- [ ] 1.1 {file and change} [REQ-{domain}-{NNN}]
- [ ] 1.2 {file and change} [REQ-{domain}-{NNN}, REQ-{domain}-{MMM}]

## Phase 2: {name, for example Core behavior}

- [ ] 2.1 {file and change}
- [ ] 2.2 {file and change}

## Phase 3: {name, for example Tests}

- [ ] 3.1 {the test, and the scenario it proves}
```

Each task line is a checkbox followed by a dotted id (`1.2`, `1.2.3`):
`resolveRemainingTasks`, from `{{ospec-runtime}}/scripts/lib/apply-resume.js`,
reads that form to know what `sdd-apply` still has to do, and hands any
checkbox line without an id back to the orchestrator instead of guessing it.

#### What makes a good task

| A task is | Like this | Not like this |
|---|---|---|
| **Specific** | "Add `src/billing/invoice.ts` with the total calculation" | "Billing" |
| **Actionable** | "Give `InvoiceService` a `void(id)` method" | "Deal with voiding" |
| **Verifiable** | "Test: voiding a paid invoice returns 409" | "Check it works" |
| **Small** | One file or one logical unit | "Build the feature" |

The marks mean exactly this: `[ ]` for work not started, `[~]` only when the
code exists and local verification is still pending, `[x]` only once the task
is done and verified locally.

#### Phases

Phases follow dependencies: first what the rest stands on (types, interfaces,
schema and configuration changes), then the core behavior, then the wiring
that connects it (routes, screens, adapters), then the tests against the spec
scenarios, and a clean-up phase for docs and dead code only when it is
needed.

#### Review workload forecast

Before the tasks are final, the phase estimates whether building them may
exceed the review budget of **400 changed lines** (`additions + deletions`).
It is a planning guard, not a diff count: it rests on the number of files,
phases and integration points, the tests, docs, generated files and
migrations, and how many concerns the change crosses.

When the risk is High, or the estimate likely passes 400 lines:

1. `Chained PRs recommended` is `Yes`.
2. The tasks are grouped into work units that can each become a PR of a chain.
3. Every suggested PR has a clear start and end, its own verification and a
   scope that stands alone.
4. The chain shape is a team decision for the user. The forecast offers the
   three shapes and what each one fits, and `Chain strategy` stays `pending`
   until the user's choice is known:
   - **Stacked PRs to main**: each PR merges into main in order; fast, with
     fixes made along the way, for teams that favor speed and slices that
     stand alone.
   - **Feature Branch Chain**: a tracker branch gathers the slices; PR 1
     targets the tracker and each later PR targets the branch of the PR
     before it, so every diff shows one slice, and only the tracker merges
     into main; for rollback control and coordinated releases.
   - **size:exception**: one PR, approved by the maintainer; for generated
     code, migrations or vendored diffs.
5. `Decision needed before apply` follows the delivery strategy:
   - `ask-on-risk`: `Yes`, the orchestrator asks before apply;
   - `auto-chain`: `No`, the orchestrator starts the first slice with the
     chosen shape;
   - `single-pr`: `Yes`, the orchestrator requires `size:exception` before
     apply;
   - `exception-ok`: `No`, the maintainer already accepted `size:exception`.

The forecast goes near the top of `tasks.md`, where the user sees it before
any code is written. Its table is for reading; the guards that come after
this phase match these four plain-text lines literally, so they are always
present, exactly as written:

```text
Decision needed before apply: Yes|No
Chained PRs recommended: Yes|No
Chain strategy: stacked-to-main|feature-branch-chain|size-exception|pending
400-line budget risk: Low|Medium|High
```

In a `feature-branch-chain`, the suggested work units name their base: PR 1
on the tracker branch, PR 2 on the branch of PR 1, PR 3 on the branch of PR 2.
A child PR whose diff shows an earlier slice has the wrong base and is
re-targeted before review.

### Step 4: Save the artifact

This step always runs with `openspec`. Section C of
`skills/_shared/sdd-phase-common.md` writes the artifact `tasks` to
`openspec/changes/{change-name}/tasks.md`.

### Step 5: Return the summary

```markdown
## Tasks Created

**Change**: {change-name}
**Location**: `openspec/changes/{change-name}/tasks.md` (openspec) | inline (none)

### Breakdown
| Phase | Tasks | Focus |
|---|---|---|
| Phase 1 | {N} | {name} |
| Phase 2 | {N} | {name} |
| Total | {N} | |

### Reconciliation
- MUST scenarios blocked: {0, or which}
- SHOULD/MAY gaps: {none, or which}
- Ambiguous scenarios: {none, or which}

### Implementation Order
{the order to follow, and why}

### Review Workload Forecast
- Estimated changed lines: {a range}
- 400-line budget risk: {Low, Medium or High}
- Chained PRs recommended: {Yes or No}
- Delivery strategy: {the one received}
- Decision needed before apply: {Yes or No}
- Suggested work-unit PR split: {the units, or "Not needed"}

### Next Step
{Implementation (sdd-apply) can start, or the user decides on chained PRs first.}
```

## Rules

- Every task names the concrete files it touches
- Tasks follow their dependencies: nothing in Phase 1 waits for Phase 2
- Test tasks cite the spec scenario they prove, or the `proposal-lite.md` acceptance check on the lite route
- A task fits in one session; a bigger one is split
- Ids are hierarchical and dotted: 1.1, 1.2, 2.1
- With specs that carry stable REQ ids (`{#REQ-domain-NNN}` headings), each implementation task ends with the `[REQ-...]` tags it covers, and every MUST requirement appears in at least one task; `sdd-verify` checks the mapping in its traceability matrix
- A task never stays vague, like "build the feature" or "write tests"
- On the full route, `## Spec/Design Reconciliation` comes before the backlog, and a MUST scenario in `missing-design` returns `blocked` instead of writing `tasks.md`
- On the lite route, `## Lite Change Contract` replaces the reconciliation matrix and `proposal-lite.md` is the contract
- On the lite route, each `AC-N` label of the proposal stays on the task it belongs to, with its concrete verification; no full matrix is built to look like the standard route
- Lite planning that finds normal or high risk, or a need for specs or design, returns `blocked` with `escalate-to-standard-sdd`
- The `rules.tasks` of `openspec/config.yaml` apply
- With TDD, the tasks go test first: RED (a failing test), GREEN (the code that passes it), REFACTOR (the clean-up)
- A plain single-PR plan aims at 530 words and may reach 900 when chains, reconciliation detail or work units need it; each task takes one or two lines, as a checklist, never as paragraphs
- The Review Workload Forecast is always there; above 400 likely changed lines it recommends chained PRs, and the delivery strategy received decides whether a decision or an exception is needed before apply
- The envelope follows Section D of `skills/_shared/sdd-phase-common.md`
