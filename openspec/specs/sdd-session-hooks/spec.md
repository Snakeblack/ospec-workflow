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

## Backend Selection Requirements (workspace-federated)

Merged from change `workspace-federated-backend` (2026-06-11). The four stateful hooks
construct their artifact store from the configured backend via
`createArtifactStoreFromConfig`.

### Requirement: Backend Resolution From Config

Before constructing a store, each stateful hook MUST read `artifact_store.backend` from
`openspec/config.yaml` (when present) and pass it as the store `mode`. When the key is
absent, malformed, or the config is missing, the hook MUST default to `openspec`. An
unknown backend value MUST fall back to `openspec` rather than throwing; surfacing a
warning on the unknown value is RECOMMENDED.

#### Scenario: Federated backend selected

- GIVEN `openspec/config.yaml` contains `artifact_store.backend: workspace-federated`
- WHEN a hook constructs its store
- THEN the store mode is `workspace-federated`

#### Scenario: Absent key defaults to openspec

- GIVEN a config with no `artifact_store` block
- WHEN a hook constructs its store
- THEN the store mode is `openspec`
- AND existing behavior is unchanged

#### Scenario: Unknown backend falls back safely

- GIVEN `artifact_store.backend: dropbox`
- WHEN a hook constructs its store
- THEN the store mode is `openspec`
- AND the hook completes without error

### Requirement: Federated Session Continuity

When the backend is `workspace-federated`, `pre-compact` and `stop` MUST operate on the
aggregated active changes returned by the federated store, selecting the most recently
updated change across all members for the session summary and latest trace. The derived
`.ospec/` write locations MUST remain coordinator-workspace-local.

#### Scenario: Summary spans members

- GIVEN a federated coordinator where a member has the newest active change
- WHEN `pre-compact` runs
- THEN the session summary describes that member's change
- AND it is written under the coordinator `.ospec/session/`

### Requirement: Non-Regression For openspec

With `artifact_store.backend` absent or `openspec`, every hook MUST produce the same
output it produced before backend selection existed.

#### Scenario: openspec output unchanged

- GIVEN a standard single-repo workspace with no `artifact_store` block
- WHEN each hook runs
- THEN its result envelope is identical to the pre-change behavior
