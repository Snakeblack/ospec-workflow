# sdd-orchestrator Baseline Advisory Specification

## Purpose

Modified capability (authored as a full spec — `openspec/specs/` is empty): the orchestrator gains a Baseline Advisory that educates the user and routes only on explicit consent. Scope: prompt/Markdown layer (`agents/sdd-orchestrator.agent.md`).

## Requirements

### Requirement: Advisory Trigger

After the Init Guard completes, the orchestrator MUST surface the Baseline Advisory when `openspec/config.yaml` has `baseline.status: pending` or `partial`, before executing the first `sdd-new` or `sdd-explore` of the session.

#### Scenario: Pending baseline surfaces advisory

- GIVEN `baseline.status: pending`
- WHEN the user invokes `/sdd-new` for the first time in a session
- THEN the advisory is shown before any proposal work starts

#### Scenario: Done baseline is silent

- GIVEN `baseline.status: done` or no `baseline` block
- WHEN the user invokes any SDD command
- THEN no advisory is shown

### Requirement: Mandatory Advisory Content

The advisory text MUST cover all four points: (1) what `/sdd-baseline` is — baseline specs of existing behavior that become the source of truth in `openspec/specs/`; (2) gains — grounded changes and accurate archive merges; (3) costs — batched exploration, token spend, resumable across sessions; (4) the skip-rule loss — domains that evolve via archived changes before baseline runs permanently lose their current-state baseline spec.

#### Scenario: Advisory is complete

- GIVEN the advisory is triggered
- WHEN it is rendered to the user
- THEN it contains purpose, gains, costs, and the skip-rule loss warning

### Requirement: Non-Blocking Consent Routing

The advisory MUST be advisory-only. The orchestrator MUST NOT block other SDD commands, MUST NOT auto-run `sdd-baseline`, and MUST route to `sdd-baseline` only on explicit user consent. A decline MUST let the requested command proceed normally.

#### Scenario: User declines

- GIVEN the advisory was shown
- WHEN the user declines and asks to continue with `/sdd-new`
- THEN the orchestrator proceeds with `/sdd-new` without further baseline prompts that session

#### Scenario: User consents

- GIVEN the advisory was shown
- WHEN the user accepts
- THEN the orchestrator launches the `sdd-baseline` executor
- AND relaunches it from the first pending domain while it returns `partial`, until done or the user defers
