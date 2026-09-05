# Delta for orchestrator-evals

## ADDED Requirements

### Requirement: Bench Coverage Validation via Canonical Agent Resolution {#REQ-orchestrator-evals-009}

The bench coverage check (`validCostRow` in `scripts/evals/lib/benchmark.js`) and the CX0 coverability consumption MUST determine whether a phase-cost row's `agent` is a harness-owned agent through the shared canonical agent resolution (agent-identity), not through strict equality `agent === \`sdd-${phase}\``. A row whose registered name carries a host/plugin prefix (e.g. `plugin-host:sdd-spec`) MUST pass coverage when its resolved canonical agent matches the row's phase. Any harness-owned canonical agent (sdd phases and first-party non-sdd agents) MUST count as covered. An `unresolved` agent MUST fail the coverage check and MUST NOT be accepted as harness-owned. Existing rows with unprefixed names MUST keep passing validation unchanged (O1 attestation compatibility).

#### Scenario: Prefixed sdd row passes coverage

- GIVEN a phase-cost row with `phase: "spec"` and `agent: "plugin-host:sdd-spec"`
- WHEN `validCostRow` evaluates coverage via canonical resolution
- THEN the row MUST pass because the name resolves to canonical agent `sdd-spec`
- AND the same resolution MUST be consumed by the CX0 coverability check

#### Scenario: Non-sdd harness agent counts as covered

- GIVEN a phase-cost row emitted for the canonical agent `review-runtime`
- WHEN the bench coverage check evaluates the row
- THEN the row MUST pass coverage
- AND it MUST NOT be rejected for not matching `sdd-${phase}`

#### Scenario: Unprefixed sdd row keeps current validation result

- GIVEN a phase-cost row with `phase: "design"` and `agent: "sdd-design"` that passes validation today
- WHEN the bench uses canonical resolution instead of strict equality
- THEN the row MUST still pass validation with identical outcome

#### Scenario: Foreign agent fails coverage

- GIVEN a phase-cost row whose `agent` resolves to `unresolved` (e.g. `review-invented`)
- WHEN the bench coverage check evaluates the row
- THEN the row MUST fail coverage
- AND the failure MUST NOT be bypassed by any prefix string

#### Scenario: Go/JS parity of consumed resolution

- GIVEN the resolution cases exercised by the bench (prefixed, unprefixed, foreign)
- WHEN the JS and Go resolution mirrors run over those cases
- THEN both MUST produce identical outcomes so bench validation is runtime-independent
