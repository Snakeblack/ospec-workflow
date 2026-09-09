# Delta for agents

## ADDED Requirements

### Requirement: Lite Recovery and Summary Continuity {#REQ-agents-028}

The orchestrator and phase-agent contracts MUST recover an active lite change from `state.yaml`, `proposal-lite.md`, `tasks.md`, and any `apply-progress.md` without inferring missing spec or design artifacts. Each lite phase that persists an artifact MUST write its factual phase summary and applicable key decisions from that artifact, with the same evidence and recovery semantics as other routes. Persisted route identity and artifact references MUST remain available for artifact-size and read-volume cohort measurement without weakening evidence retention. Recovery MUST resolve the next declared lite phase from persisted phase status and artifact availability, preserve approvals, assumptions, gates, and progress, and MUST NOT fabricate completion or silently promote the change to a different route.

#### Scenario: Lite continuation resumes from persisted state

- GIVEN `state.yaml` records `route.actual_route: lite`, completed proposal/tasks, and partial apply progress
- WHEN the orchestrator continues the change in a new session
- THEN it selects the next declared incomplete lite phase from persisted state
- AND it does not require or generate spec/design artifacts to reconstruct context

#### Scenario: Lite summary is factual and compact

- GIVEN a lite phase writes an artifact with an explicit decision
- WHEN it updates its phase state
- THEN its summary states only what the artifact produced within the configured compact bound
- AND its key decision is derived from that artifact rather than inferred

#### Scenario: Lite records remain measurable

- GIVEN equivalent lite and standard change records are available
- WHEN a measurement consumer compares artifact size or read volume by route
- THEN persisted route identity and artifact references identify each cohort
- AND the measurement does not require invented evidence or missing artifacts

#### Scenario: Missing required lite planning artifact blocks recovery

- GIVEN a persisted lite change lacks `proposal-lite.md` or `tasks.md` needed by its next phase
- WHEN recovery resolves dependencies
- THEN it MUST return a recoverable blocked result identifying the missing artifact
- AND it MUST NOT claim the phase completed or substitute a full-planning artifact
