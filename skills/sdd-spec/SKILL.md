---
name: sdd-spec
description: "Turn the proposal of an SDD change into testable requirements and scenarios: delta specs for existing capabilities, full specs for new ones. Trigger: orchestrator launches spec work for a change."
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
> `sdd-spec` executor through its host's sub-agent mechanism and does not run
> it in its own thread. Only that executor follows the steps below.

## Role

The specification phase. The executor reads the proposal and writes, for each
capability it names, the requirements and scenarios of the behavior the change
adds, modifies or removes. A capability that already has a spec gets a delta;
a new one gets a full spec. Both stay inside the change folder.

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
- `none`: the specs travel inline in the result of Step 6, and no `openspec/`
  folder or project file is created.

## Steps

### Step 1: Load the procedure

Section A of `skills/_shared/sdd-phase-common.md`: this skill, the common
protocol and the compact project rules of the launch prompt.

### Step 2: Map capabilities to spec files

The `## Capabilities` section of the proposal decides which files to write:

| Proposal list | File in the change folder | What it holds |
|---|---|---|
| New Capabilities | `specs/{capability-name}/spec.md` | A full spec: there is no current behavior to change |
| Modified Capabilities | `specs/{capability-name}/spec.md` | A delta against `openspec/specs/{capability-name}/spec.md`, read first |

This phase never writes under `openspec/specs/`: `sdd-archive` promotes the
change-local specs there. An older proposal without `## Capabilities` falls
back to its Affected Areas; when the section exists, it wins.

### Step 3: Read the current specs

With `openspec`, each modified capability's `openspec/specs/{domain}/spec.md`
is read before its delta is written, to start from the behavior it has today.
A new capability needs no read. With `none`, there is nothing to read.

### Step 4: Write the specs

With `openspec`, the specs go under the change folder:

```
openspec/changes/{change-name}/
├── proposal.md          (written by sdd-propose)
└── specs/
    └── {domain}/
        └── spec.md      (delta for an existing domain, full spec for a new one)
```

A full spec for a new capability lives there only until archive, which is the
one phase allowed to promote it to `openspec/specs/{domain}/spec.md`.

#### Modifying a requirement

Archive replaces the whole requirement in the main spec with the block found
under `## MODIFIED Requirements`, so a modified requirement is always the
complete block:

1. Find the requirement in `openspec/specs/{domain}/spec.md`.
2. Copy all of it, from its `### Requirement:` heading through its last
   scenario, under `## MODIFIED Requirements`.
3. Change the copy to describe the new behavior, keeping its id.
4. Under the requirement text, add `(Previously: {the old behavior, in one line})`.

A scenario left out of the copy disappears from the main spec at archive. New
behavior that changes nothing existing goes under `## ADDED Requirements`
instead.

#### Requirement ids

Every added requirement carries a stable id at the end of its heading,
`{#REQ-{domain}-{NNN}}`: `NNN` counts up from the highest id of the domain's
baseline spec (`001`, `002`, …). A modified requirement keeps its id, and ids
are never reused after removal. The ids are the start of the chain from
requirement to task, commit and test.

#### Delta spec

```markdown
# Delta for {Domain}

## ADDED Requirements

### Requirement: {name} {#REQ-{domain}-{NNN}}

The system {MUST | SHALL | SHOULD | MAY} {behavior}.

#### Scenario: {the expected case}

- GIVEN {starting state}
- WHEN {action}
- THEN {result}
- AND {another result, when there is one}

#### Scenario: {a boundary or failure case}

- GIVEN {starting state}
- WHEN {action}
- THEN {result}

## MODIFIED Requirements

### Requirement: {current name} {#REQ-{domain}-{NNN}}

{the complete new text of the requirement}
(Previously: {the old behavior, in one line})

#### Scenario: {a scenario that still holds, copied as it is}

- GIVEN {starting state}
- WHEN {action}
- THEN {result}

#### Scenario: {a changed or added scenario}

- GIVEN {starting state}
- WHEN {action}
- THEN {result}

## REMOVED Requirements

### Requirement: {name of the requirement that goes away}

(Reason: {why the behavior goes away})
```

#### Full spec

A new domain has no baseline, so its spec is complete rather than a delta:

```markdown
# {Domain} Specification

## Purpose

{what this domain covers}

## Requirements

### Requirement: {name}

The system {MUST | SHALL | SHOULD | MAY} {behavior}.

#### Scenario: {name}

- GIVEN {starting state}
- WHEN {action}
- THEN {result}
```

### Step 5: Save the artifact

This step always runs with `openspec`. Section C of
`skills/_shared/sdd-phase-common.md` writes the artifact `spec` to
`openspec/changes/{change-name}/specs/{domain}/spec.md`.

#### Step 5b: Declare the touched baseline domains

Each domain that got a delta goes into the `touched_baseline_domains:` list of
the result. That is all this phase does about baselines: it has no tool that
can hash a file, so it never computes a fingerprint and never edits the
`baseline_fingerprints:` block of `state.yaml`.

Right after a `status: success` return, the orchestrator hashes the current
`openspec/specs/{domain}/spec.md` of each declared domain, or records `null`
when the domain has no baseline yet, and writes the values to
`baseline_fingerprints:` in `state.yaml`. At merge time `sdd-archive` compares
them to find out whether another change moved a baseline first
(`skills/_shared/gate-change-collision.md`, Baseline fingerprint at archive).

### Step 6: Return the summary

Before returning, every open question of the specification is sorted into the
four ambiguity signals. Every successful `sdd-spec` return carries all four,
next to the prose envelope and inside the strict `json:result-envelope`
object:

```yaml
residual_ambiguity: false
public_contract_questions: []
conflicting_requirements: []
missing_acceptance_criteria: []
```

`validateEnvelope(obj, { phase: "sdd-spec" })`, from
`{{ospec-runtime}}/scripts/lib/result-envelope.js`, rejects a success that
lacks any of them. The strict fence has this shape, with the real summary,
paths, next phase, risks and domains:

```json:result-envelope
{"status":"success","executive_summary":"Wrote testable delta specifications.","artifacts":["openspec/changes/example/specs/domain/spec.md"],"next_recommended":"sdd-design","risks":"None","skill_resolution":"injected","residual_ambiguity":false,"public_contract_questions":[],"conflicting_requirements":[],"missing_acceptance_criteria":[]}
```

`false` with three empty arrays means the specs can go to design with nothing
left to clarify. Otherwise the boolean is `true`, or each open item goes, as a
string, into the array it belongs to. On `status: success` none of the four is
left out, set to `null` or replaced with prose.

```markdown
## Specs Created

**Change**: {change-name}

### Specs Written
| Domain | Kind | Requirements | Scenarios |
|---|---|---|---|
| {domain} | Delta / New | {added, modified, removed} | {count} |

### Coverage
- Expected cases: {covered | missing}
- Boundary cases: {covered | missing}
- Failure cases: {covered | missing}

### Touched Baseline Domains
`touched_baseline_domains: [{domain}, ...]`: declared only; the orchestrator writes `state.yaml.baseline_fingerprints` for each one after this return.

### Next Step
Design (sdd-design) comes next, or tasks (sdd-tasks) when the design already exists.

residual_ambiguity: {true|false}
public_contract_questions: [{string}, ...]
conflicting_requirements: [{string}, ...]
missing_acceptance_criteria: [{string}, ...]
```

## Rules

- Scenarios are written as GIVEN, WHEN and THEN steps
- Requirement strength uses the RFC 2119 keywords MUST, SHALL, SHOULD and MAY
- The `## Capabilities` section of the proposal is read first: it names the spec files to write
- A domain with a current spec gets a delta with ADDED, MODIFIED and REMOVED sections; a domain without one gets a full spec
- Each requirement has at least one scenario, and the specs cover the expected cases and the boundary cases
- Each added requirement heading ends with a stable `{#REQ-{domain}-{NNN}}` id; a modified one keeps its id, and ids are never reused after removal
- A scenario is concrete enough for someone to write an automated test from it
- Specs say what the system does, never how it is built
- A modified requirement is the complete block from the main spec, edited; a partial block loses scenarios at archive
- New behavior that leaves the existing one as it is goes under ADDED, not MODIFIED
- New capabilities stay under `openspec/changes/{change-name}/specs/{domain}/spec.md` until archive; this phase never writes into `openspec/specs/`
- The `rules.specs` of `openspec/config.yaml` apply
- Each domain file aims at 650 words or fewer, with tables before prose and scenarios of three to five lines; a change with several domains may pass 650 words in total
- The envelope follows Section D of `skills/_shared/sdd-phase-common.md`
- On `status: success`, the four ambiguity signals appear as typed JSON values in the strict fence and also next to the prose envelope

## RFC 2119 keywords

| Keyword | Strength |
|---|---|
| **MUST** / **SHALL** | Required, with no exception |
| **MUST NOT** / **SHALL NOT** | Forbidden, with no exception |
| **SHOULD** | Expected; departing from it needs a stated reason |
| **SHOULD NOT** | Discouraged; doing it needs a stated reason |
| **MAY** | Allowed, not expected |
