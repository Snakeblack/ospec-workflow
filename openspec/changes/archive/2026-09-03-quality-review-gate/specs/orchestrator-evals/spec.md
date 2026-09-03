# Delta for orchestrator-evals

## ADDED Requirements

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

## MODIFIED Requirements

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

## Clarifications

### Session 2026-09-03

- Q: ¿Cómo debe persistirse la identidad del Quality Review Gate en rutas activas (config.yaml), state.yaml (gates.*) y constantes de routing? → A: Renombre canónico versionado (A4). Fixtures live usan `quality-review-gate`; `4r-review-gate` solo en escenarios legacy v1/archivados; sin alias no calificado en fixtures actuales.
