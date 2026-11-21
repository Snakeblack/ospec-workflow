---
name: sdd-design
description: "Decide how an SDD change will be built: approach, architecture decisions, data flow, file changes and test strategy. Trigger: orchestrator launches design for a change."
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
> `sdd-design` executor through its host's sub-agent mechanism and does not run
> it in its own thread. Only that executor follows the steps below.

## Role

The design phase. The executor reads the proposal, and the specs when they
exist, and writes `design.md`: how the change will be built, which decisions
that takes and why, how data moves, which files change and how each behavior
will be verified.

## Inputs

The launch prompt names:

- the change name;
- the artifact store, `openspec` or `none`.

## Artifact store

Reading and writing artifacts follow Sections B and C of
`skills/_shared/sdd-phase-common.md`.

- `openspec`: paths as `skills/_shared/openspec-convention.md` sets them.
  `openspec/changes/{change-name}/state.yaml` and the phase artifacts carry
  the state to resume from; the conversation never does.
- `none`: the design travels inline in the result of Step 5, and no
  `openspec/` folder or project file is created.

## Steps

### Step 1: Load the procedure

Section A of `skills/_shared/sdd-phase-common.md`: this skill, the common
protocol and the compact project rules of the launch prompt. Then
`skills/_shared/engineering-judgment.md`, read once, for the decisions below;
it asks for no further skill discovery.

### Step 2: Choose the mode and read the inputs

The mode is chosen before anything is written:

| Mode | When | Inputs |
|---|---|---|
| `design-after-spec` | At least one change-local spec exists | Proposal, `openspec/changes/{change-name}/specs/**/spec.md` and the code |
| `design-from-proposal` | No spec exists yet | Proposal and the code |

- One change-local spec is enough to force `design-after-spec`, and those
  specs are read before the design starts.
- In `design-after-spec`, every MUST scenario gets a place in the design: a
  component, an interface, a file, a flow or a rollout step.
- In `design-from-proposal`, every provisional assumption is marked as one,
  so `sdd-spec` or `sdd-tasks` can settle it later.

Then the code the change reaches is read: its entry points and modules, the
patterns and conventions it follows, its dependencies and interfaces, and the
tests that exist.

### Step 3: Write `design.md`

With `openspec`, the design sits next to the other artifacts:

```
openspec/changes/{change-name}/
├── proposal.md
├── specs/
└── design.md        (written by this phase)
```

With `none`, nothing is created and the design is returned inline.

The sections follow the size of the change: only the decisions that matter
and the contracts and flows the change touches, with no template rows that do
not apply. Boundaries, invariants and the evidence for quality claims go in
the section they belong to, not in a separate checklist.

```markdown
# Design: {Change Title}

## Technical Approach

{the overall strategy, how it follows the approach of the proposal, and the
specs it serves}

## Architecture Decisions

### Decision: {title}

**Choice**: {what is chosen}
**Alternatives considered**: {what is set aside}
**Rationale**: {why this one wins}
**Evidence and consequences**: {the requirement or code behind it; what it costs and how hard it is to undo}

## Data Flow

{who owns each piece of data, where it crosses a boundary and how it fails;
an ASCII sketch when it helps}

    Caller ──→ Service ──→ Store
       └────── error path ──┘

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `{new path}` | Create | {what the file is for} |
| `{existing path}` | Modify | {what changes, and why} |
| `{old path}` | Delete | {why it goes} |

## Interfaces / Contracts

{the interfaces the change touches, what must stay compatible and the
invariants that keep holding, in code blocks of the project's language}

## Testing Strategy

| Behavior or quality concern | Situation | Expected result | How it is verified |
|---|---|---|---|
| {behavior or attribute} | {a realistic case} | {what can be observed, or the agreed target} | {test layer, measurement or inspection, and any gap in the evidence} |

## Migration / Rollout

{data migration, feature flags or a phased rollout, or "No migration
required."}

## Open Questions

- [ ] {a technical question still open}
- [ ] {a decision the team has to take}
```

### Step 3b: Record Significant Change Decisions

With `openspec`, once `design.md` is written, each significant decision of the
change also gets a short file of its own,
`openspec/changes/{change-name}/decisions/dc-NNN.md`, numbered `001`, `002`, …
in the order the design takes them. With `none`, significant decisions stay
inline and no decision file or folder is created.

A decision is significant when it does at least one of these: it touches a
public contract, it changes a data model, it adds a new dependency or it sets
a cross-cutting pattern. Any other decision lives only in `design.md`.

These are the change's development decisions (`kind: dc`), not architecture
ADRs. They stay with the change and go with it to the archive, which
never promotes them. Architecture ADRs live in `docs/architecture/decisions/`
and come from the foundation.

A decision file stays under about 40 lines:

```markdown
# DC-NNN: {title}

- Status: proposed
- Change: {change-name}
- Date: {YYYY-MM-DD}

## Context
{one to three sentences on what forced the decision}

## Decision
{what is chosen, said as a decision}

## Alternatives
{each option set aside, with the reason it lost in one line}

## Consequences
{what gets easier, what gets harder, and whether it can be undone}
```

Each file repeats its `### Decision:` entry of `design.md`, which stays the
source. With no significant decision there is no `decisions/` folder, and the
summary says "No significant decisions". The paths of the decision files go
into `artifacts`.

### Step 4: Save the artifact

This step always runs with `openspec`. Section C of
`skills/_shared/sdd-phase-common.md` writes the artifact `design` to
`openspec/changes/{change-name}/design.md`.

### Step 5: Return the summary

```markdown
## Design Created

**Change**: {change-name}
**Location**: `openspec/changes/{change-name}/design.md` (openspec) | inline (none)

### Summary
- **Approach**: {one line}
- **Key Decisions**: {how many are recorded}
- **Files Affected**: {how many are created, modified and deleted}
- **Testing Strategy**: {the unit, integration and end-to-end coverage planned}

### Open Questions
{the questions still open, or "None"}

### Next Step
Tasks (sdd-tasks) can start.
```

## Rules

- The design starts from code that was read, never from assumptions about it
- Existing change-local specs are always read, and they make `design-after-spec` the mode
- Every decision states why it was taken
- File changes name concrete paths
- Patterns and quality claims rest on `skills/_shared/engineering-judgment.md`; a structure is not added only because a skill or this template shows it
- ASCII sketches stay simple: they explain, they do not decorate
- The `rules.design` of `openspec/config.yaml` apply
- An open question that blocks the design is reported as blocking, never guessed
- A design aims at 800 words when it touches up to three modules and may reach 1200 when it crosses more or needs cross-cutting rollout detail; decisions read best as option, tradeoff and choice, and code appears only for patterns that are not obvious
- The envelope follows Section D of `skills/_shared/sdd-phase-common.md`
