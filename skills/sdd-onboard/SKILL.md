---
name: sdd-onboard
description: "Teach SDD by running one small, real change on the user's own codebase, from exploration to verification. Trigger: orchestrator launches onboarding."
disable-model-invocation: true
user-invocable: false
license: MIT AND Commons-Clause
metadata:
  author: manuel-retamozo-garcia
  version: "2.0"
  delegate_only: true
runtime_capabilities:
  execute: true
  mcp: false
  write: true
---

> **ORCHESTRATOR GATE**: an orchestrator that loaded this skill hands it to the
> `sdd-onboard` executor through its host's sub-agent mechanism and does not run
> it in its own thread. Only that executor follows the steps below.

## Role

The onboarding phase. The executor picks a small improvement in the user's
repository and carries it through the SDD phases, explaining each one as it
goes. The change is real: its artifacts and its code are held to the same
standard as any other change. The user learns the cycle by watching it work
on code they know.

The executor never talks to the user. It stops twice with a `question_gate`,
and the orchestrator asks, then launches it again with the answer.

## Inputs

The first launch prompt names:

- the artifact store, `openspec` or `none`;
- optionally, an area or an improvement the user wants to focus on.

A relaunch also carries the user's answer to the last `question_gate` and,
once the proposal exists, the change name.

## Artifact store

Reading and writing artifacts follow Sections B and C of
`skills/_shared/sdd-phase-common.md`, and each step writes its artifact in the
format of the phase skill it runs.

- `openspec`: paths as `skills/_shared/openspec-convention.md` sets them.
  From the proposal on, `openspec/changes/{change-name}/state.yaml` and the
  phase artifacts carry the state a relaunch resumes from; the conversation
  never does.
- `none`: the artifacts travel inline in the result, as each phase skill does
  with that store, and only the code of the approved improvement changes.

## Steps

### Step 1: Load the procedure

Section A of `skills/_shared/sdd-phase-common.md`: this skill, the common
protocol and the compact project rules of the launch prompt.

### Step 2: Find candidates (first launch)

A repository with no application code, no manifest and no documentation
worth acting on has nothing to teach with: return `blocked` and recommend
`foundation`. Never make up a change for an empty workspace.

Otherwise read the code and look for two or three improvements that:

- fit in one session, about half an hour to an hour;
- break no public behavior and migrate no data;
- are worth doing for their own sake, never an exercise;
- give at least one requirement with two scenarios.

Typical finds are an input that is not validated, error messages that
disagree within one flow, logic repeated in several places, an asynchronous
view with no loading or error state, or a `TODO` whose intent is clear. When
the launch prompt names a focus, look there first.

Return `status: blocked` with `blocker_type: needs_user_decision` and a
`question_gate` that offers the candidates, each with the files it touches,
one of them recommended, and free input for an improvement of the user's
own.

### Step 3: Explore and propose (after the choice)

An improvement the user proposed must pass the criteria of Step 2 before
anything is written; one that does not comes back as a new `question_gate`
saying why, with the candidates again.

Explore the chosen area as `sdd-explore` does and explain in plain words what
the code does today and what has to change. Then create the change and write
its proposal as `sdd-propose` does.

Return `blocked` again, with a `question_gate` that asks the user to approve
the proposal or say what to adjust. The result names the proposal and points
at its Capabilities section, which tells the spec phase which files to write.

### Step 4: Build and verify (after the approval)

Apply what the user asked to adjust, then run, in order and following each
phase skill:

1. `sdd-spec`: the delta specs. Point out that every scenario in Given, When,
   Then form is a test waiting to be written.
2. `sdd-design`: `design.md`. Point out the decisions section, which records
   why this way was chosen over the others.
3. `sdd-tasks`: `tasks.md`. Point out that each task names the file and what
   changes in it, so it is clear when it is done.
4. `sdd-apply`: the code, task by task, with one line per finished task. With
   Strict TDD active, each task goes through RED, GREEN, TRIANGULATE and
   REFACTOR as `sdd-apply` sets them: the failing test first, then the least
   code that passes it.
5. `sdd-verify`: the verification report. Point out that each scenario gets
   the evidence level that proves it and a result, ✅ or ❌, and that this is
   where the specs pay off.

A failing test, a design that does not hold or code too tangled for one
session stops the cycle: return `blocked` or `partial` with what happened,
and never push past it.

### Step 5: Hand over to archive

Archiving is not this executor's: the orchestrator runs `sdd-archive`, its
archive guard and the archive runtime, as for any other change. Return
`status: success` with `next_recommended: sdd-archive`, and never call the
change archived.

The result closes with this recap:

```markdown
## Onboarding: {change-name}

**Artifacts**
- proposal.md: why the change exists
- specs/{capability}/spec.md: what the system must do
- design.md: how it is built
- tasks.md: the steps

**Code**
- {each file changed}

**The cycle**: explore → propose → spec → design → tasks → apply → verify → archive

**Still to do**: archiving merges the delta specs into `openspec/specs/` and keeps
the change folder as its record; the orchestrator runs it next.

**When to use SDD**: when it pays to agree on the behavior before writing code,
as with features, APIs and architecture choices. A small fix needs none.

**Next**: `/sdd-new` for the next real change.
```

## Rules

- The change is real: its artifacts and code meet the standard of any other change
- The executor never asks the user directly; the two pauses are `question_gate` returns
- Nothing past the proposal runs until the user approves it
- A candidate proposed by the user meets the criteria of Step 2 or is turned down with the reason
- Each explanation is one to three sentences, in the language and the mentorship mode that Section F of `skills/_shared/sdd-phase-common.md` sets; it travels in the result for the orchestrator to relay
- Each artifact follows the format of its phase skill: `sdd-propose`, `sdd-spec`, `sdd-design`, `sdd-tasks`, `sdd-apply` and `sdd-verify`
- A blocker stops the cycle and is reported; it is never worked around
- The executor never archives and never reports the change as archived
- The envelope follows Section D of `skills/_shared/sdd-phase-common.md`: `status` is `success`, `blocked` or `partial`; `next_recommended` is `foundation` for an empty workspace, `sdd-onboard` after a pause and `sdd-archive` after verification
