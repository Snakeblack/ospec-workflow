# orchestrator-evals Specification

## Purpose

Golden-scenario eval suite that validates the orchestrator's documented behavior
(routing, gates, blockers) end-to-end against fixture repos, producing objective,
model-agnostic evidence before a `models.yaml` version bump. Scenarios are versioned
data; a runner executes them and asserts only structural outcomes, never prose.

## Requirements

### Requirement: Golden Scenario Corpus {#REQ-orchestrator-evals-001}

The suite MUST include exactly the 7 golden scenarios below: 4 orchestrator-core plus
3 `sdd-document`. Each scenario MUST be versioned data — a fixture repo, an input
request, and an expected structural outcome — reusing the existing `__fixtures__/`
pattern under `scripts/`.

#### Scenario: Vague request → intent restatement, no artifact

- GIVEN a fixture repo and a deliberately vague user request
- WHEN the orchestrator processes the request
- THEN it MUST produce an intent-restatement response
- AND no `openspec/changes/{change}/` artifact MUST be created

#### Scenario: High-risk classification → clarify/standard route

- GIVEN a fixture repo and a request classified `high-risk`
- WHEN the orchestrator resolves a route
- THEN the resolved route MUST include the `clarify` gate per `routing.yaml`
- AND `state.yaml` MUST record the chosen route name

#### Scenario: Verify FAIL with `spec-gap` origin → routes to sdd-spec

- GIVEN a fixture repo where `sdd-verify` returns `FAIL` tagged `spec-gap`
- WHEN the orchestrator applies Failure & Blocker Routing
- THEN `next_recommended`/dispatch MUST resolve to `sdd-spec`, not `sdd-apply`
- AND `state.yaml` top-level `status` MUST remain `blocked` until re-dispatch

#### Scenario: Apply `design-mismatch` → blocked, routed to sdd-design

- GIVEN a fixture repo where `sdd-apply` returns `status: blocked` with
  `blocker_type: design-mismatch`
- WHEN the orchestrator processes the envelope
- THEN it MUST route to `sdd-design` (never silently retry `sdd-apply`)
- AND `state.yaml` MUST have `status: blocked` with the blocking reason recorded

#### Scenario: Doc request → batched language+scope gate

- GIVEN a fixture repo with no prior `.last-update.json`
- WHEN `/sdd-document` (or its natural-language equivalent) is requested
- THEN the orchestrator MUST emit exactly ONE `question_gate` containing TWO
  questions (language, scope) — never two separate blocking round-trips

#### Scenario: Doc update with no changes → no-op

- GIVEN a fixture repo with a persisted `.last-update.json` and no source drift
  since the last run
- WHEN `/sdd-document` update mode runs
- THEN `sdd-document` MUST report no changes and MUST NOT write new output files
- AND `state.yaml`/`.last-update.json` MUST be left unmodified in content

#### Scenario: Write outside sandbox → blocked

- GIVEN a fixture repo where the `sdd-document` executor's run leaves a changed or
  untracked path outside the approved output directory/directories and the two
  declared exceptions
- WHEN the orchestrator runs its J5 post-run sandbox inventory check
- THEN it MUST halt with a `question_gate` offering exactly the two documented
  options (abort vs. acknowledge-as-accepted-risk)
- AND the route MUST NOT close silently

### Requirement: Structural-Only Assertion Contract {#REQ-orchestrator-evals-002}

Every scenario assertion MUST target only structural fields: the route/phase taken,
`blocker_type`, artifact existence/absence (file paths), specific `state.yaml` fields
(`status`, `blocking_questions`, phase entries), and `question_gate` shape (question
count, option count/labels present, `recommended` flags). Assertions MUST NOT inspect
or compare free-text prose (`executive_summary`, question/option wording, rationale
text), since prose varies between models and would make the suite non-portable.

#### Scenario: Assertion targets a structural field

- GIVEN a scenario's expected outcome names `state.yaml status: blocked`
- WHEN the assertion library evaluates the captured run
- THEN it MUST compare only the `status` field value, not any narrative text
  produced alongside it

#### Scenario: Prose difference does not fail a scenario

- GIVEN two different models produce different wording for the same
  `question_gate.reason`
- WHEN the same golden scenario runs against both models
- THEN both runs MUST pass, provided the structural fields (question/option
  count, `blocker_type`, artifacts, route) match expectations

### Requirement: Eval Runner and Report {#REQ-orchestrator-evals-003}

The suite MUST include a runner and an assertion library under `scripts/evals/` that
executes each scenario against its fixture, captures the artifacts/`state.yaml`
produced, and evaluates the Structural-Only Assertion Contract. The runner MUST
produce a pass/fail result per scenario plus a suite-level summary.

The runner's execution model MUST be a **live invocation**: it dispatches the
orchestrator against the fixture repo and a configured model (per the Approach
section and REQ-orchestrator-evals-004's "manually runnable... against a configured
model" scenario), then captures whatever artifacts/`state.yaml` that live run
produces. It MUST NOT replay a pre-recorded golden transcript/envelope as a
substitute for an actual model invocation. This follows directly from the
non-determinism risk already named in the proposal's Risks table ("Modelo en el
loop: no determinismo, costo, API keys") and from the Structural-Only Assertion
Contract (REQ-orchestrator-evals-002), which is designed specifically to tolerate
model-to-model prose variance — a guarantee that only has value if the suite is
actually exercising a live model rather than asserting against a fixed transcript.
Fixture repos MAY still capture reusable starting states (e.g., a pre-seeded
`.last-update.json`), which is a fixture-authoring detail distinct from the
runner's live-vs-replay execution model.

#### Scenario: Runner produces per-scenario pass/fail

- GIVEN all 7 golden scenarios are configured
- WHEN the runner executes the suite
- THEN it MUST emit a pass/fail verdict for each of the 7 scenarios individually
- AND an aggregate summary (e.g., N/7 passed)

#### Scenario: Runner failure is attributable

- GIVEN one scenario's structural assertion fails
- WHEN the runner reports results
- THEN the failing scenario's report MUST name which structural field diverged
  from the expected value

### Requirement: Pre-Version-Bump Gate Documentation {#REQ-orchestrator-evals-004}

The suite MUST be documented: how to run it locally against a model, and its role as
an evidence gate consulted before bumping a model tier in `models.yaml`. `models.yaml`
MUST carry a comment referencing this gate.

#### Scenario: Documentation present and discoverable

- GIVEN a contributor wants to bump a model in `models.yaml`
- WHEN they read `models.yaml`
- THEN a comment MUST point them to the `scripts/evals/` suite as a pre-bump gate

#### Scenario: Suite is manually runnable in this iteration

- GIVEN this capability targets roadmap 2.1 (manual/local execution, no CI wiring)
- WHEN a contributor runs the documented command
- THEN the suite MUST execute locally against a configured model without requiring
  CI or headless-mode infrastructure (deferred to a later change)
