# sdd-session-hooks Baseline Awareness Specification

## Purpose

Modified capability (authored as a full spec — `openspec/specs/` is empty): the SessionStart hook surfaces baseline status at session open. Scope: Node.js hook runtime (`scripts/hooks/session-start.js`), additive only.

## Requirements

### Requirement: SessionStart Baseline Hint

When `openspec/config.yaml` exists and contains `baseline.status: pending` or `partial`, the SessionStart hook MUST emit a hint stating the baseline state and that `/sdd-baseline` can run or resume it. The hint MUST be informational only — it MUST NOT block session start or invoke any agent.

#### Scenario: Pending baseline at session start

- GIVEN `baseline.status: pending`
- WHEN a session starts
- THEN the hook emits a baseline-pending hint
- AND session start completes normally

#### Scenario: Partial baseline at session start

- GIVEN `baseline.status: partial`
- WHEN a session starts
- THEN the hint indicates baseline is resumable from the first pending domain

### Requirement: Staleness Surfacing

When `baseline.status` is `done` or `partial`, the hint SHOULD flag baseline-owned domains whose files changed since the commit hash recorded in `_baseline/manifest.md`, so a refresh can be offered.

#### Scenario: Stale domain flagged

- GIVEN a baseline-owned domain with file changes since its recorded commit hash
- WHEN a session starts
- THEN the hint lists that domain as stale

### Requirement: Silent Non-Trigger

The hook MUST emit no baseline hint when `openspec/config.yaml` is absent, when the `baseline` block is absent, or when `baseline.status: done` with no stale domains. Failures while reading baseline state MUST NOT break the existing SessionStart behavior.

#### Scenario: No baseline block

- GIVEN a config without a `baseline` block
- WHEN a session starts
- THEN no baseline hint is emitted
- AND existing skill-registry checks run unchanged

#### Scenario: Unreadable manifest degrades gracefully

- GIVEN `baseline.status: partial` but `_baseline/manifest.md` is missing or unreadable
- WHEN a session starts
- THEN the hook emits the basic pending/partial hint without staleness detail
- AND the hook exits without error
