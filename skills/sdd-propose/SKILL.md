---
name: sdd-propose
description: "Write the proposal of an SDD change: why it is needed, what it covers, which capabilities it touches and how it will be built. Trigger: orchestrator launches proposal work for a change."
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
> `sdd-propose` executor through its host's sub-agent mechanism and does not run
> it in its own thread. Only that executor follows the steps below.

## Role

The proposal phase. The executor turns the exploration, or the user's own
description, into the proposal of one change: `proposal.md` on the standard
route, `proposal-lite.md` on the lite route.

## Inputs

The launch prompt names:

- the change name, in kebab-case (`add-dark-mode`, for example);
- the result of `sdd-explore`, or the user's description when there was no
  exploration;
- the artifact store, `openspec` or `none`;
- the proposal mode, `standard` or `lite`.

## Artifact store

Reading and writing artifacts follow Sections B and C of
`skills/_shared/sdd-phase-common.md`.

- `openspec`: paths as `skills/_shared/openspec-convention.md` sets them.
  `openspec/changes/{change-name}/state.yaml` and the phase artifacts carry
  the state to resume from; the conversation never does.
- `none`: the proposal travels inline and no project file is created or
  edited.
- An `openspec/` folder is created only when the user asked for persistence
  in files.

## Steps

### Step 1: Load the procedure

Section A of `skills/_shared/sdd-phase-common.md`: this skill, the common
protocol and the compact project rules of the launch prompt.

### Step 2: Open the change folder

With `openspec`, the folder `openspec/changes/{change-name}/` holds the
proposal. When it already holds the artifact of this mode, that artifact is
read and updated instead of written again. With `none`, nothing is created.

### Step 3: Read the current behavior

With `openspec`, the specs under `openspec/specs/` that the change may touch
are read before writing, so the proposal names existing capabilities by their
real names. With `none`, there is nothing to read.

### Step 4: Write the proposal

The mode chooses the artifact: `standard` writes `proposal.md`, `lite` writes
`proposal-lite.md`. Both keep the headings below, which later phases read.

#### `proposal.md`

```markdown
# Proposal: {Change Title}

## Intent

{the problem the change solves and the need behind it, for whom}

## Scope

### In Scope
- {something the change delivers}

### Out of Scope
- {something it leaves out, including related work for later}

## Capabilities

### New Capabilities
- `{capability-name}`: {the behavior it covers}

### Modified Capabilities
- `{existing-capability-name}`: {the requirement that changes}

## Approach

{how the change will be built, following the recommendation of the
exploration when there is one}

## Affected Areas

| Path | Change | Reason |
|------|--------|--------|
| `{path}` | New / Modified / Removed | {why} |

## Risks

| Risk | Odds | How it is contained |
|------|------|---------------------|
| {risk} | Low / Med / High | {mitigation} |

## Rollback Plan

{the concrete steps that undo the change}

## Dependencies

- {a prerequisite, or None}

## Success Criteria

- [ ] {an observable result that shows the change worked}
```

`## Capabilities` is what `sdd-spec` reads to know which spec files to write:

- each New Capability becomes a full spec at
  `openspec/changes/{change-name}/specs/{capability-name}/spec.md`, which
  only `sdd-archive` promotes to `openspec/specs/{capability-name}/spec.md`;
  names are kebab-case (`user-auth`, `data-export`);
- each Modified Capability is an existing spec from `openspec/specs/` whose
  requirements change, not only its implementation, and becomes a delta spec
  in the change folder;
- a change with no behavior change at the spec level, such as a pure refactor
  or a configuration change, writes `None` under both lists.

#### `proposal-lite.md`

The lite route is for `trivial` and `small` changes, which need neither specs
nor a design.

```markdown
# Proposal Lite: {Change Title}

## Change Class

{trivial | small}

## Intent

{one short paragraph: the problem and the result wanted}

## Boundaries

- In scope: {the change, kept narrow}
- Out of scope: {what would move it to the standard route}

## Affected Areas

| Path | Change | Reason |
|------|--------|--------|
| `{path}` | Modify | {why} |

## Acceptance Checks

- [ ] AC-1: {a behavior to observe or a local check to run}
- [ ] AC-2: {another bounded check, when needed}

## Risks and Rollback

- Risk: {Low | Medium | High}, {the main concern}
- Rollback: {how one step undoes it}
```

### Step 5: Save the artifact

This step always runs with `openspec`. Section C of
`skills/_shared/sdd-phase-common.md` writes the artifact `proposal` to
`openspec/changes/{change-name}/proposal.md` or
`openspec/changes/{change-name}/proposal-lite.md`.

### Step 6: Return the summary

```markdown
## Proposal Created

**Change**: {change-name}
**Location**: `openspec/changes/{change-name}/{proposal.md | proposal-lite.md}` (openspec) | inline (none)

### Summary
- **Intent**: {one line}
- **Scope**: {N items in, M left out}
- **Approach**: {one line}
- **Risk Level**: {Low | Medium | High}

### Next Step
Specs (sdd-spec) or design (sdd-design) can start.
```

## Rules

- With `openspec`, the artifact matches the mode: `proposal.md` for `standard`, `proposal-lite.md` for `lite`
- An existing proposal of the same mode is read and updated, never replaced blindly
- A proposal is a short planning document: bullets and tables before prose
- Every proposal has a rollback plan and success criteria
- Affected Areas name concrete paths whenever they are known
- The `rules.proposal` of `openspec/config.yaml` apply
- `## Capabilities` is always filled, with the real names found under `openspec/specs/`, because it is the contract with `sdd-spec`
- A New Capability stays at `openspec/changes/{change-name}/specs/{name}/spec.md` until archive promotes it
- A Modified Capability becomes a delta spec in the change folder
- No change at the spec level writes `None` under both capability lists, never the template placeholders
- `proposal-lite.md` is only for `trivial` or `small` changes; work that needs capabilities, spec deltas or architecture decisions moves to the standard mode
- Lite acceptance checks carry unique `AC-N` labels that never change once work starts, because tasks, apply progress and verification cite them
- A standard proposal aims at 450 words or fewer and a lite one at 250 or fewer
- The envelope follows Section D of `skills/_shared/sdd-phase-common.md`
