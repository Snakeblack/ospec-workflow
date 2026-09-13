# Delta for skills

## ADDED Requirements

### Requirement: Versioned Result Envelope v1 Emission Contract {#REQ-skills-018}

Every SDD phase skill MUST emit its completion outcome conforming strictly to the `result-envelope/v1` JSON schema. The envelope MUST be emitted as a machine-parseable JSON object carrying `schema_version: 1`, `status`, `executive_summary`, `artifacts`, `next_recommended`, `risks`, and `skill_resolution`. Optional fields (`assumptions`, `key_decisions`, `question_gate`, `blocker_type`, and `sdd-spec` ambiguity signals) MUST conform to their respective sub-schemas when present. Phase skills MUST NOT emit semantically conflicting content between structured fields and human-facing prose.

#### Scenario: Valid v1 envelope emitted on phase completion

- GIVEN an SDD phase completing its execution turn
- WHEN the phase agent composes its return payload
- THEN it MUST emit a JSON object carrying `schema_version: 1` and all required `result-envelope/v1` fields
- AND optional fields not relevant to the execution turn MUST be omitted

#### Scenario: Blocked status includes required question gate and blocker type

- GIVEN an SDD phase requiring user decision or encountering a workflow blocker
- WHEN the phase agent composes its return payload
- THEN `status` MUST be `"blocked"`
- AND `question_gate` and `blocker_type` MUST be present and valid according to the schema

#### Scenario: Successful sdd-spec envelope includes ambiguity signals

- GIVEN `sdd-spec` completing with `status: "success"`
- WHEN the envelope is composed
- THEN `residual_ambiguity`, `public_contract_questions`, `conflicting_requirements`, and `missing_acceptance_criteria` MUST be present and type-valid

### Requirement: Decoupled Human Renderer Interface {#REQ-skills-019}

SDD phase skills MUST decouple structured execution results from user-facing presentation by delegating terminal and chat rendering to a pure human renderer function (`renderEnvelopeToMarkdown`). The renderer MUST accept a validated `result-envelope/v1` payload and output formatted markdown matching standard SDD prose conventions without mutating payload data. SDD workflows MUST NOT require phase agents to duplicate prose and JSON in execution returns.

#### Scenario: Deterministic rendering of successful phase completion

- GIVEN a valid `result-envelope/v1` payload with `status: "success"`
- WHEN `renderEnvelopeToMarkdown` processes the payload
- THEN it MUST output human-readable markdown containing status, summary, artifacts, next steps, and risks
- AND MUST NOT alter or drop any semantic field value

#### Scenario: Deterministic rendering of blocked envelope with question gate

- GIVEN a valid `result-envelope/v1` payload with `status: "blocked"` and `question_gate`
- WHEN `renderEnvelopeToMarkdown` processes the payload
- THEN it MUST render the blocker reason, questions, and structured options with recommended trade-offs

#### Scenario: Renderer preserves payload integrity

- GIVEN arbitrary valid envelope metadata
- WHEN rendered to markdown
- THEN the rendering operation MUST be read-only and free of side effects on the source payload

## MODIFIED Requirements

### Requirement: Compact Phase Summaries in state.yaml

Per `skills/_shared/sdd-phase-common.md` §C and §D, SDD phase skills MUST NOT directly mutate or write to `state.yaml`. On completion (`done` or `partial`), every phase skill MUST emit a versioned result envelope containing `executive_summary` (≤160 chars, factual, stating WHAT the phase produced/decided — no process narration) and, when applicable, up to 3 `key_decisions` entries. The runtime `PhaseCompletionReducer` mechanically projects these fields into `phases.{phase}` in `state.yaml`. Both fields MUST be derived only from the artifact just written; the full artifact remains the source of truth and the projected summary is a cache for continuation prompts.
(Previously: every SDD phase skill directly extended its own phases.{phase} entry in state.yaml on completion.)

#### Scenario: Continuation briefed from state alone

- GIVEN a phase completes with `status: success` and writes its artifact
- WHEN the phase emits its versioned result envelope with summary and key decisions
- THEN the runtime `PhaseCompletionReducer` mechanically projects `phases.{phase}.summary` and `key_decisions` into `state.yaml`
- AND a later continuation can be briefed without re-reading the full artifact

#### Scenario: Summary never invents content

- GIVEN a phase artifact contains no explicit rationale for a choice
- WHEN the phase emits its result envelope
- THEN it MUST NOT fabricate a decision not present in the artifact — it omits `key_decisions` instead
- AND the projected `state.yaml` entry omits `key_decisions`

#### Scenario: Phase skills prohibit direct state writes

- GIVEN an executing SDD phase agent
- WHEN it finishes producing its required phase artifacts
- THEN it MUST NOT execute file write operations on `openspec/changes/{change-name}/state.yaml`
- AND MUST emit its state advancement metadata strictly within the result envelope
