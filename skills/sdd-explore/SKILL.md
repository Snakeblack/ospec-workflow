---
name: sdd-explore
description: "Investigate an idea or a requirement in the codebase and compare ways to build it, before any change is proposed. Trigger: orchestrator launches exploration or requirement clarification."
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
> `sdd-explore` executor through its host's sub-agent mechanism and does not run
> it in its own thread. Only that executor follows the steps below.

## Role

The exploration phase. The executor studies one topic in the real code, weighs
the ways to address it and reports what it found. It researches and reports;
it writes a file only when the exploration belongs to a named change.

## Inputs

The launch prompt names:

- the topic: a feature, a bug, a refactor or a requirement to clarify;
- the artifact store, `openspec` or `none`;
- the change name, when the exploration belongs to one.

## Artifact store

Reading and writing artifacts follow Sections B and C of
`skills/_shared/sdd-phase-common.md`.

- `openspec`: paths as `skills/_shared/openspec-convention.md` sets them. The
  context is `openspec/config.yaml` and the specs under `openspec/specs/`.
  With a change name, the result is saved as
  `openspec/changes/{change-name}/exploration.md`, and that change's
  `state.yaml` and phase artifacts carry the state to resume from; the
  conversation never does.
- `none`: the context is what the launch prompt carries, and the result
  travels inline. No project file is created.

## Steps

### Step 1: Load the procedure

Section A of `skills/_shared/sdd-phase-common.md`: this skill, the common
protocol and the compact project rules of the launch prompt.

### Step 2: Frame the question

Say what kind of work the topic is (new behavior, a defect, a restructuring)
and which part of the system it lives in. A topic too vague to investigate
stops here: the result names the clarification it needs.

### Step 3: Read the code

Start from the entry points and follow the calls the topic reaches. Find the
modules that would change, the behavior they have today, the tests that cover
them, the patterns the code already uses and what couples them to the rest.
Every claim about the code comes from a file that was read, never from a
guess.

### Step 4: Weigh the options

When there is more than one reasonable way, compare them on what each gains,
what each costs and how much work it takes. One obvious way needs no
comparison; say why it is the only one.

### Step 5: Save the result

With a change name and the `openspec` store, this step always runs. Section C
of `skills/_shared/sdd-phase-common.md` writes the artifact `explore` to
`openspec/changes/{change-name}/exploration.md`.

### Step 6: Return the analysis

The result, and `exploration.md` when it is saved, use these sections in this
order:

```markdown
## Exploration: {topic}

### Current State
{what the system does today in the area of the topic}

### Affected Areas
- `{path}`: {the reason it would change}

### Approaches
1. **{name}**: {what it does}
   - Pros: {what it gains}
   - Cons: {what it costs}
   - Effort: {Low | Medium | High}

### Recommendation
{the approach to take, and the evidence behind the choice}

### Risks
- {a risk the next phases must handle}

### Ready for Proposal
{Yes or No, and what the orchestrator should tell the user}
```

## Rules

- `exploration.md` in the folder of a named change is the only file this phase may create
- Existing code and files stay untouched: exploration reads, it never edits
- Every statement about the codebase comes from code that was read
- The orchestrator needs a short analysis it can act on, not a long report
- When the code does not answer the question, the result says so
- A topic too vague to explore returns the clarification it needs
- The envelope follows Section D of `skills/_shared/sdd-phase-common.md`
