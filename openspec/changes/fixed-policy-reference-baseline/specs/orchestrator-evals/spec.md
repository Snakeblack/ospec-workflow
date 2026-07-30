# Delta for orchestrator-evals

## ADDED Requirements

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
question count and verify/4R defect metrics. The documented reproducible command MUST
be node scripts/evals/live-driver.js extended. This contract MUST NOT enable adaptive
policy, an adaptive-promotion gate, mandatory CI, dynamic model selection, or changes
to adaptive defaults.

#### Scenario: Nine compatible fixed rows publish the reference baseline

- GIVEN extended completes live invocations for the nine named profiles under one known fixed policy and shared identities
- WHEN every row has complete provenance, valid quality evidence and comparable metrics
- THEN the runner MUST atomically publish one versioned 9/9 reference baseline
- AND the report MUST expose quality, cost/tokens, duration, questions and verify/4R defects per row

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

## MODIFIED Requirements

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

#### Scenario: Runner produces per-scenario pass/fail

- GIVEN all 7 golden scenarios are configured
- WHEN the runner executes the suite
- THEN it MUST emit a pass/fail verdict for each of the 7 scenarios individually
- AND an aggregate summary (e.g., N/7 passed)

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
