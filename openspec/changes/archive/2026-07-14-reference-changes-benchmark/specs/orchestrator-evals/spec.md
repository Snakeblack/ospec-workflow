# Delta for orchestrator-evals

## MODIFIED Requirements

### Requirement: Golden Scenario Corpus {#REQ-orchestrator-evals-001}

The suite MUST retain exactly the 7 golden scenarios below: 4 orchestrator-core plus
3 `sdd-document`. Each golden scenario MUST remain versioned fixture data under the
existing `scripts/evals/__fixtures__/` pattern.

The reference benchmark MUST expose exactly nine canonical profiles from
`scripts/evals/safe-export.js`. Each profile MUST define or derive its synthetic source
files, input request, expected route, expected artifacts and structural outcome. The
catalog MUST materialize isolated synthetic repositories without requiring versioned
`__fixtures__/benchmark/` directories.
(Previously: The corpus contained only seven versioned golden scenarios.)

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

#### Scenario: Canonical benchmark profile is derived

- GIVEN one of the nine benchmark profiles defined by `safe-export.js`
- WHEN the runner materializes that profile
- THEN it MUST produce an isolated synthetic repository and the declared live request
- AND its expected route, artifacts and structural outcome MUST come from that catalog

---

### Requirement: Eval Runner and Report {#REQ-orchestrator-evals-003}

The suite MUST retain a runner and assertion library under `scripts/evals/` that execute
golden scenarios against their fixtures, capture artifacts and `state.yaml`, and apply
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
to `unavailable`, MUST NOT block independently verified run-level scoring and MUST NOT
cause weighted redistribution of run totals.

This change MUST deliver the catalog, runner, guards, run-level scoring, cache,
identity checks, recovery and atomic publication controls as locally tested benchmark
infrastructure. Verification and archive readiness MUST be assessed from that
deliverable and MUST NOT require a live core execution or an existing reference
baseline.

As a non-blocking operational follow-up, operators SHOULD execute live profiles
`docs-one-file`, `small-bugfix` and `security-sensitive-change` when a compatible host
and budget are available. The runner MAY publish an experimental baseline only after
all three produce accepted, compatible and comparable results. If the set is
incomplete, publication MUST fail closed and the baseline MUST remain absent; the
runner MUST NOT invent, synthesize or promote missing rows.

The accepted Sol observation and the rejected Luna-low observation MUST remain
diagnostic evidence outside the comparable baseline. Their retention MUST NOT be
reported as a completed core run or as proof that a baseline exists. The other six
profiles MUST remain available in the optional nine-profile `extended` suite and MUST
NOT gate verification or archive readiness.

Cached results MUST be reused only when schema, profile, git revision, CLI, runtime
surface, working tree, installed runtime, remote model, manifest, prompt and synthetic
payload identities are known and exactly compatible. An unknown or mismatched identity
MUST produce a cache miss.

The threat model MUST be documented as a cooperative orchestrator. Transcript hashes,
checksums and replay validation MUST be described as correlation and corruption or
post-persistence tamper detection, not cryptographic authenticity against fabricated
internally consistent evidence.
(Previously: The runner produced structural pass/fail output for seven live golden scenarios.)

#### Scenario: Runner produces per-scenario pass/fail

- GIVEN all 7 golden scenarios are configured
- WHEN the runner executes the suite
- THEN it MUST emit a pass/fail verdict for each scenario
- AND it MUST emit an aggregate summary

#### Scenario: Runner failure is attributable

- GIVEN one scenario's structural assertion fails
- WHEN the runner reports results
- THEN the report MUST name the structural field that diverged

#### Scenario: Locally verified infrastructure is archive-ready

- GIVEN the benchmark catalog, runner, guards, run-level scoring, cache, identity,
  recovery and atomic publication controls are implemented
- WHEN their relevant local tests and structural checks pass
- THEN verification MUST assess this change's infrastructure deliverable independently
  of live core execution
- AND the absence of a reference baseline alone MUST NOT block archive readiness

#### Scenario: Core live pilot may publish the experimental baseline

- GIVEN no accepted core result is fabricated or replayed
- WHEN the three core profiles complete successfully through live invocations
- THEN the runner MUST capture terminal tokens, host duration, questions and defects
- AND it MUST atomically publish the three-row experimental run-level baseline

#### Scenario: Incomplete core pilot does not publish

- GIVEN fewer than three compatible core profiles have passed live scoring
- WHEN the initial suite stops or is resumed
- THEN the runner MUST NOT publish a completed experimental baseline
- AND the remaining core profiles MUST remain pending

#### Scenario: Existing observations remain diagnostic

- GIVEN the accepted Sol observation and the rejected Luna-low observation exist
- WHEN benchmark evidence is summarized or a core follow-up is resumed
- THEN both observations MUST remain identifiable as diagnostics
- AND neither observation MUST enter the comparable baseline or count toward its 3/3 completion

#### Scenario: Extended suite remains optional

- GIVEN the benchmark infrastructure is locally verified
- WHEN a contributor does not request `extended`
- THEN the remaining six profiles MUST NOT gate verification or archive readiness
- AND all nine profiles MUST remain selectable through `extended`

#### Scenario: Compatible result resumes after a late failure

- GIVEN an accepted profile result has complete strong identities and replay-valid evidence
- WHEN a later profile fails and the suite is rerun with exactly matching identities
- THEN the accepted result MUST be reused without another live invocation
- AND an unknown or mismatched identity MUST produce a cache miss

#### Scenario: Public benchmark command rejects replayed workspaces

- GIVEN a preconstructed workspace with internally consistent evidence
- WHEN `run.js benchmark` is invoked without the live-driver capability
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
