# orchestrator-evals Specification

## Purpose

Golden-scenario eval suite that validates the orchestrator's documented behavior
(routing, gates, blockers) end-to-end against fixture repos, producing objective,
model-agnostic evidence before a `models.yaml` version bump. Scenarios are versioned
data; a runner executes them and asserts only structural outcomes, never prose.

## Requirements

### Requirement: Golden Scenario Corpus {#REQ-orchestrator-evals-001}

The suite MUST retain exactly the 9 golden scenarios below: 6 orchestrator-core plus 3 `sdd-document`. Each golden scenario MUST remain versioned fixture data under the existing `scripts/evals/__fixtures__/` pattern.

The reference benchmark MUST expose exactly nine canonical profiles from `scripts/evals/safe-export.js`. Each profile MUST define or derive its synthetic source files, input request, expected route, expected artifacts and structural outcome. The catalog MUST materialize isolated synthetic repositories without requiring versioned `__fixtures__/benchmark/` directories.
(Previously: exactly 7 goldens, 4 orchestrator-core plus 3 `sdd-document`; the first core golden was vagueness-triggered restatement and specific requests were out of corpus.)

Profiles that assert post-verify review behavior MUST align with Quality Review Gate routing constants and the quality specialist roster in generated route-table copies.

#### Scenario: New eligible request → briefing, no artifact

- GIVEN a fixture repo and a new eligible request (`/sdd-new`, `/sdd-ff`, `/sdd-lite`, or NL equivalent)
- WHEN the orchestrator processes the request before Change Classification
- THEN it MUST emit an intent-briefing gate
- AND no `openspec/changes/{change}/` artifact MUST be created

#### Scenario: Specific request → briefing, no artifact

- GIVEN a fixture repo and a request that names a target, an acceptance criterion, and an explicit scope boundary
- WHEN the orchestrator processes that eligible new-SDD request
- THEN it MUST emit an intent-briefing gate
- AND no `openspec/changes/{change}/` artifact MUST be created

#### Scenario: Continue or later-phase resume → no re-brief

- GIVEN a fixture repo with an existing non-terminal change (accepted intent briefing already recorded, or a later-phase `/sdd-continue`)
- WHEN the orchestrator processes the continue or subsequent-phase request
- THEN it MUST NOT emit a new intent-briefing gate
- AND it MUST proceed with the continue or later-phase flow

#### Scenario: High-risk classification → clarify/standard route

- GIVEN a fixture repo and a request classified `high-risk`
- WHEN the orchestrator resolves a route
- THEN the resolved route MUST include the `clarify` gate per routing config
- AND `state.yaml` MUST record the chosen route name

#### Scenario: Verify FAIL with `spec-gap` origin → routes to sdd-spec

- GIVEN a fixture repo where `sdd-verify` returns `FAIL` tagged `spec-gap`
- WHEN the orchestrator applies Failure & Blocker Routing
- THEN `next_recommended`/dispatch MUST resolve to `sdd-spec`, not `sdd-apply`
- AND `state.yaml` top-level `status` MUST remain `blocked` until re-dispatch

#### Scenario: Apply `design-mismatch` → blocked, routed to sdd-design

- GIVEN a fixture repo where `sdd-apply` returns `status: blocked` with `blocker_type: design-mismatch`
- WHEN the orchestrator processes the envelope
- THEN it MUST route to `sdd-design` (never silently retry `sdd-apply`)
- AND `state.yaml` MUST have `status: blocked` with the blocking reason recorded

#### Scenario: Doc request → batched language+scope gate

- GIVEN a fixture repo with no prior `.last-update.json`
- WHEN `/sdd-document` (or its natural-language equivalent) is requested
- THEN the orchestrator MUST emit exactly ONE `question_gate` containing TWO questions (language, scope) — never two separate blocking round-trips

#### Scenario: Doc update with no changes → no-op

- GIVEN a fixture repo with a persisted `.last-update.json` and no source drift since the last run
- WHEN `/sdd-document` update mode runs
- THEN `sdd-document` MUST report no changes and MUST NOT write new output files
- AND `state.yaml`/`.last-update.json` MUST be left unmodified in content

#### Scenario: Write outside sandbox → blocked

- GIVEN a fixture repo where the `sdd-document` executor's run leaves a changed or untracked path outside the approved output directory/directories and the two declared exceptions
- WHEN the orchestrator runs its J5 post-run sandbox inventory check
- THEN it MUST halt with a `question_gate` offering exactly the two documented options (abort vs. acknowledge-as-accepted-risk)
- AND the route MUST NOT close silently

#### Scenario: Canonical benchmark profile is derived

- GIVEN one of the nine benchmark profiles defined by `safe-export.js`
- WHEN the runner materializes that profile
- THEN it MUST produce an isolated synthetic repository and the declared live request
- AND its expected route, artifacts and structural outcome MUST come from that catalog

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

### Requirement: Intent-Briefing Structural Contract Coverage {#REQ-orchestrator-evals-006}

Prose-landmark contract tests for the orchestrator CORE Intent Restatement
subsection MUST cover the briefing public contract without asserting user-facing
briefing wording. Those tests MUST fail closed when CORE text still instructs
skip-if-not-vague, and MUST assert landmarks for: briefing of eligible specific
requests; skip for `/sdd-continue` and later phases of an already-accepted change;
a maximum of 2 correction rounds then confirm-last-synthesis or abort; no OpenSpec
artifacts during briefing; and persist-accepted-intent before `classifyChange`.

Golden evals that exercise this gate MUST remain structural per
REQ-orchestrator-evals-002 (gate fired, artifact absence, skip on resume).
Ledger-entry-after-accept MUST be asserted by the contract tests above and MAY
be asserted by a golden only when the fixture already contains post-accept
`state.yaml`; assertions MUST NOT compare synthesis prose.

#### Scenario: Contract tests reject a skip-if-specific CORE regression

- GIVEN the orchestrator CORE Intent Restatement subsection is under contract test
- WHEN the subsection still tells the orchestrator to skip briefing when the request is not vague
- THEN the contract tests MUST fail
- AND they MUST NOT inspect the wording of any user-facing briefing

#### Scenario: Contract tests pin bounded rounds without asserting prose

- GIVEN the same CORE subsection is under contract test
- WHEN the landmarks for a 2-round correction cap and confirm-or-abort are missing
- THEN the contract tests MUST fail
- AND golden evals MUST still be forbidden from comparing briefing free text

### Requirement: Eval Runner and Report {#REQ-orchestrator-evals-003}

The suite MUST retain a runner and assertion library under scripts/evals/ that execute
golden scenarios against their fixtures, capture artifacts and state.yaml, and apply
the Structural-Only Assertion Contract. Benchmark scoring MUST capture run-level input
and output tokens from terminal host usage, measured host duration, questions and
verify/4R defects. It MUST record phase attribution as unavailable rather than infer
dispatch counts, relaunches, tiers or phase costs.

Benchmark evidence MUST come from a live orchestrator invocation against the derived
synthetic repository and a configured model. Productive scoring MUST require a
host-owned, in-memory, single-use capability bound to the workspace, exact event-stream
bytes, session, transcript hash and host-observed CLI version. Public commands MUST NOT
score replayed or preconstructed workspaces.

O1 MAY be attached as supplementary phase evidence only when its native rows preserve
their emission-time host binding. Missing or invalid O1 MUST downgrade phase evidence
to unavailable, MUST NOT block independently verified run-level scoring and MUST NOT
cause weighted redistribution of run totals.

This change MUST deliver the catalog, runner, guards, run-level scoring, cache,
identity checks, recovery and atomic publication controls as locally tested benchmark
infrastructure. Verification and archive readiness MUST be assessed from that
deliverable and MUST NOT require a live fixed-policy reference baseline.

The smoke suite MUST retain its three rapid-cycle profiles and MUST NOT be presented as
the fixed-policy reference baseline. The extended suite MUST make all nine canonical
profiles selectable and MUST support the fixed-policy 9/9 publication contract in
REQ-orchestrator-evals-005. An incomplete extended run MUST NOT publish a reference
baseline, invent or synthesize missing rows, or silently substitute incompatible rows.

Cached results MUST be reused only when schema, profile, git revision, CLI, runtime
surface, working tree, installed runtime, remote model, manifest, prompt and synthetic
payload identities are known and exactly compatible. An unknown or mismatched identity
MUST produce a cache miss.

The threat model MUST be documented as a cooperative orchestrator. Transcript hashes,
checksums and replay validation MUST be described as correlation and corruption or
post-persistence tamper detection, not cryptographic authenticity against fabricated
internally consistent evidence.

The runner's execution model MUST be a live invocation: it dispatches the orchestrator
against the fixture repo and a configured model, then captures whatever artifacts and
state.yaml that live run produces. It MUST NOT replay a pre-recorded golden
transcript/envelope as a substitute for an actual model invocation. Fixture repos MAY
still capture reusable starting states, which is distinct from the runner's live-vs-
replay execution model.

(Previously: the three core profiles could publish an experimental 3/3 baseline and the other six extended profiles were explicitly non-gating.)
(Previously: runner per-scenario counts referenced 7 goldens; updated to 9 to match REQ-orchestrator-evals-001.)

#### Scenario: Runner produces per-scenario pass/fail

- GIVEN all 9 golden scenarios are configured
- WHEN the runner executes the suite
- THEN it MUST emit a pass/fail verdict for each of the 9 scenarios individually
- AND an aggregate summary (e.g., N/9 passed)

#### Scenario: Runner failure is attributable

- GIVEN one scenario's structural assertion fails
- WHEN the runner reports results
- THEN the failing scenario's report MUST name which structural field diverged from the expected value

#### Scenario: Locally verified infrastructure is archive-ready

- GIVEN the benchmark catalog, runner, guards, scoring, cache, identity, recovery and publication controls are implemented
- WHEN their relevant local tests and structural checks pass
- THEN verification MUST assess the infrastructure deliverable independently of live baseline completion
- AND the absence of a fixed-policy reference baseline alone MUST NOT block archive readiness

#### Scenario: Smoke completes without publishing the reference baseline

- GIVEN the three smoke profiles complete through live invocations
- WHEN the runner reports their accepted rapid-cycle results
- THEN it MUST capture terminal tokens, host duration, questions and defects
- AND it MUST NOT publish a 9/9 fixed-policy reference baseline from those three rows

#### Scenario: Incomplete extended run does not publish

- GIVEN fewer than nine compatible profiles have passed live scoring
- WHEN extended stops or is resumed
- THEN the runner MUST NOT publish a completed fixed-policy reference baseline
- AND the remaining profiles MUST remain pending

#### Scenario: Existing observations remain diagnostic

- GIVEN the accepted Sol observation and the rejected Luna-low observation exist
- WHEN benchmark evidence is summarized or a run is resumed
- THEN both observations MUST remain identifiable as diagnostics
- AND neither observation MUST enter the comparable reference baseline or count toward its 9/9 completion

#### Scenario: Extended suite supports the fixed reference run

- GIVEN the benchmark infrastructure is locally verified
- WHEN a contributor requests extended with the documented reproducible command
- THEN all nine profiles MUST be selectable for the fixed-policy reference run
- AND extended MUST NOT activate adaptive policy or make CI mandatory

#### Scenario: Compatible result resumes after a late failure

- GIVEN an accepted profile result has complete strong identities and replay-valid evidence
- WHEN a later profile fails and the suite is rerun with exactly matching identities
- THEN the accepted result MUST be reused without another live invocation
- AND an unknown or mismatched identity MUST produce a cache miss

#### Scenario: Public benchmark command rejects replayed workspaces

- GIVEN a preconstructed workspace with internally consistent evidence
- WHEN run.js benchmark is invoked without the live-driver capability
- THEN productive scoring MUST fail closed
- AND no completion marker or baseline MUST be published

#### Scenario: Missing native O1 preserves run-level scoring

- GIVEN a live run has sealed terminal usage but no valid emission-bound O1 rows
- WHEN the scorer evaluates supplementary phase evidence
- THEN phase attribution MUST be marked unavailable
- AND the scorer MUST NOT synthesize phase rows or reject the run for O1 absence alone

#### Scenario: Integrity evidence respects the cooperative threat model

- GIVEN a cached result has matching hashes and replay-valid evidence
- WHEN the runner describes its assurance
- THEN it MUST claim correlation and tamper or corruption detection only
- AND it MUST NOT claim cryptographic authenticity against a non-cooperative producer

### Requirement: Fixed-Policy Reference Baseline Contract {#REQ-orchestrator-evals-005}

The extended benchmark MUST execute exactly these nine stable profile identities:
docs-one-file, small-bugfix, small-feature, cross-module-feature,
behavior-preserving-refactor, public-api-change, filesystem-sensitive-change,
security-sensitive-change, and migration-change. It MUST use policy fixed and one
known, identical harness version, target version, model identity and effort identity
for every row. Each row MUST retain complete provenance sufficient to establish profile,
policy, harness, target, model, effort, fixture/synthetic payload and run evidence.

The runner MUST publish the versioned fixed-policy reference baseline only atomically
after all nine rows are valid, attributable and mutually comparable. It MUST fail closed
and leave the published baseline unchanged or absent when any row is missing,
incomplete, incompatible, not attributable to a live invocation, affected by fixture
drift, or synthesized. It MUST expose per-run quality verdict, cost/tokens, duration,
question count and verify/quality-review defect metrics. The documented reproducible command MUST
be node scripts/evals/live-driver.js extended. This contract MUST NOT enable adaptive
policy, an adaptive-promotion gate, mandatory CI, dynamic model selection, or changes
to adaptive defaults.

(Previously: exposed verify/4R defect metrics.)

#### Scenario: Nine compatible fixed rows publish the reference baseline

- GIVEN extended completes live invocations for the nine named profiles under one known fixed policy and shared identities
- WHEN every row has complete provenance, valid quality evidence and comparable metrics
- THEN the runner MUST atomically publish one versioned 9/9 reference baseline
- AND the report MUST expose quality, cost/tokens, duration, questions and verify/quality-review defects per row

#### Scenario: Missing or incompatible row rejects publication

- GIVEN an extended run has fewer than nine rows or one row differs in required identity, provenance or fixture/payload identity
- WHEN the runner evaluates publication eligibility
- THEN it MUST fail closed and MUST NOT publish or mutate the 9/9 reference baseline
- AND it MUST identify the invalid or non-comparable row without creating a replacement row

#### Scenario: Synthetic or unattributable result is rejected

- GIVEN a result is replayed, fabricated, synthesized or cannot be attributed to its live profile invocation
- WHEN the runner evaluates the result for the fixed-policy baseline
- THEN it MUST reject the result
- AND it MUST NOT count that result toward the nine valid rows

#### Scenario: Smoke remains available for rapid cycles

- GIVEN a contributor runs the smoke suite without requesting extended
- WHEN the three smoke profiles complete
- THEN the suite MUST retain its 3/3 rapid-cycle result behavior
- AND it MUST NOT represent the smoke result as the 9/9 fixed-policy reference baseline

#### Scenario: Reproducible command does not activate adaptive or CI

- GIVEN a contributor follows the documented node scripts/evals/live-driver.js extended command
- WHEN the fixed-policy reference run starts
- THEN it MUST run with policy fixed and without mandatory CI or an adaptive-promotion gate
- AND it MUST NOT select or activate adaptive behavior

### Requirement: Coverage-Aware CX0 Cohort Reporting {#REQ-orchestrator-evals-007}

The evaluation suite MUST read valid CX0 measurement records and publish
deterministic P50/P90 cohort reports by phase, classification, profile, and
host. It MUST validate the record version, metric source, coverage, metric
dimensions, formula version, and fallback reason before aggregation. It MUST
exclude unavailable values from a metric percentile while reporting their count
and coverage; it MUST NOT coerce unavailable values to zero. Invalid CX0
records MUST be reported as unavailable or rejected according to their contract
without changing benchmark scoring, quality gates, routing, or release policy.

#### Scenario: Mixed-coverage cohort reports percentiles honestly

- GIVEN a cohort with eligible and unavailable amplification measurements
- WHEN the evaluation suite creates its CX0 report
- THEN P50/P90 MUST use only eligible measurements
- AND the report MUST disclose cohort size, eligible count, unavailable count, and source composition

#### Scenario: Invalid record is not admitted as a zero measurement

- GIVEN a CX0 row with an unknown source or missing fallback reason
- WHEN the evaluation suite validates the row
- THEN it MUST reject or mark the row unavailable under the CX0 contract
- AND it MUST NOT contribute zero to a percentile or alter benchmark scoring

#### Scenario: CX0 findings are consumed as advisory diagnostics

- GIVEN a CX0 report that supports or contradicts a roadmap hypothesis
- WHEN the evaluation suite publishes the diagnostic
- THEN it MUST expose the hypothesis outcome and coverage basis
- AND it MUST NOT create a pass/fail gate or change routing, authority, or release policy

### Requirement: Quality Review Gate Fixture Coherence {#REQ-orchestrator-evals-008}

Golden fixtures, benchmark profiles, and structural route-table copies that reference the post-verify review gate MUST remain coherent with the live Quality Review Gate identity and quality-domain specialist roster. Live structural expectations MUST use gate key `quality-review-gate` and roster `review-trust|review-runtime|review-evolution|review-efficiency`. Fixtures MAY retain `4r-review-gate` strings only in explicitly legacy schema v1 or archived/historical scenario data; live fixtures MUST NOT treat `4r-review-gate` as an unqualified alias of `quality-review-gate`.

#### Scenario: Live fixture expects quality gate identity

- GIVEN a golden scenario asserts post-verify gate behavior for a current-route profile
- WHEN the runner evaluates structural fields
- THEN expected gate key MUST be `quality-review-gate` and reviewer names MUST match the live roster
- AND MUST NOT require mandatory `review-change` before every sufficient classification

#### Scenario: Historical archived fixture remains valid

- GIVEN a fixture models an archived change with historical `4r-review-gate` audit data under schema v1
- WHEN structural assertions run
- THEN historical fields MUST remain readable without reinterpretation
- AND the fixture MUST NOT require rewriting archived 4R evidence

#### Scenario: Live fixture must not alias legacy gate key

- GIVEN a golden scenario asserts post-verify behavior for a current-route profile
- WHEN structural gate identity is evaluated
- THEN the expected gate key MUST NOT be `4r-review-gate` unless the scenario explicitly models legacy v1 state

