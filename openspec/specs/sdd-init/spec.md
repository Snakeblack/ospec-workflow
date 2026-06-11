# sdd-init Brownfield Detection Specification

## Purpose

Modified capability (authored as a full spec — `openspec/specs/` is empty): `sdd-init` gains a brownfield branch that flags the baseline opportunity without blocking or auto-running anything. Scope: prompt/Markdown layer (`skills/sdd-init/SKILL.md`, `skills/sdd-init/references/init-details.md`).

## Requirements

### Requirement: Brownfield Detection Condition

`sdd-init` MUST classify a project as brownfield when BOTH conditions hold: existing application code is detected AND `openspec/specs/` is empty. An empty repo (no detected code) MUST NOT trigger the brownfield branch — the foundation flow owns that case.

#### Scenario: Brownfield repo detected

- GIVEN a repo with existing code and an empty `openspec/specs/`
- WHEN `sdd-init` runs
- THEN the brownfield branch activates

#### Scenario: Empty repo does not trigger

- GIVEN a repo with no detectable code or stack
- WHEN `sdd-init` runs
- THEN the brownfield branch does NOT activate
- AND `next_recommended` is `sdd-foundation`

#### Scenario: Populated specs do not trigger

- GIVEN a repo with existing code and at least one `openspec/specs/{domain}/spec.md`
- WHEN `sdd-init` runs
- THEN the brownfield branch does NOT activate

### Requirement: Baseline Config Block

On brownfield detection, `sdd-init` MUST write a `baseline` block to `openspec/config.yaml` with `status: pending` plus `domains_pending` and `domains_done` fields. Status values SHALL be `pending`, `partial`, or `done`.

#### Scenario: Sentinel written

- GIVEN brownfield detection succeeded
- WHEN `sdd-init` persists config
- THEN `openspec/config.yaml` contains `baseline.status: pending` with `domains_pending` and `domains_done`

### Requirement: Advisory-Only Recommendation

On brownfield detection, `sdd-init` MUST return `next_recommended: sdd-baseline`. It MUST NOT block subsequent commands and MUST NOT auto-run `sdd-baseline`.

#### Scenario: Recommendation without blocking

- GIVEN brownfield detection succeeded
- WHEN `sdd-init` returns its envelope
- THEN `next_recommended` is `sdd-baseline`
- AND no baseline work has started

### Requirement: Re-Init Preserves Baseline State

If `openspec/config.yaml` already contains a `baseline` block, a re-run of `sdd-init` MUST NOT reset `baseline.status` or the domain lists.

#### Scenario: Re-init on repo with baseline in progress

- GIVEN `baseline.status: partial` with recorded domain lists
- WHEN `sdd-init` runs again
- THEN the `baseline` block is preserved unchanged
- AND `next_recommended` is `sdd-baseline` (resume)

#### Scenario: Re-init after baseline done

- GIVEN `baseline.status: done`
- WHEN `sdd-init` runs again
- THEN the brownfield branch does NOT re-activate
- AND `next_recommended` falls back to the standard logic (`sdd-explore` or `sdd-new`)
