# agent-identity Specification

## Purpose

Canonical resolution of a registered agent name (possibly host/plugin-prefixed) to a
harness canonical agent. One shared authority consumed by the `SubagentStop` phase-cost
emitter (JS and Go) and by bench/CX0 coverage validation, replacing per-site string
conventions (`agent === \`sdd-${phase}\``, duplicated `derivePhaseKey`/`canonicalAgentPhase`).

## Requirements

### Requirement: Canonical Agent Resolution {#REQ-agent-identity-001}

The harness MUST provide a single shared resolution point that maps any registered
agent name to exactly one canonical harness agent or to `unresolved`. The set of
resolvable canonical agents MUST be closed and MUST cover every harness-owned agent:
all `sdd-*` phase agents and all first-party non-`sdd-*` agents (including the
allowlisted review lifecycle agents). Resolution MUST tolerate a single host/plugin
prefix on the registered name (e.g. `plugin-host:sdd-spec` MUST resolve to `sdd-spec`).
A name that does not resolve to a harness-owned canonical agent — including foreign
or arbitrary `review-*` names — MUST be `unresolved`.

#### Scenario: Unprefixed sdd name resolves unchanged

- GIVEN the registered name `sdd-spec`
- WHEN canonical resolution runs
- THEN it MUST return the canonical agent `sdd-spec`
- AND the result MUST be identical to the value emitted today for that name

#### Scenario: Prefixed sdd name canonicalizes

- GIVEN the registered name `plugin-host:sdd-spec`
- WHEN canonical resolution runs
- THEN it MUST return the canonical agent `sdd-spec`

#### Scenario: Prefixed non-sdd harness agent canonicalizes

- GIVEN the registered name `host:review-runtime`
- WHEN canonical resolution runs
- THEN it MUST return the canonical agent `review-runtime`

#### Scenario: Foreign agent is unresolved

- GIVEN the registered name `review-invented` (or any name outside the harness-owned closed set)
- WHEN canonical resolution runs
- THEN it MUST return `unresolved`
- AND the result MUST NOT be accepted as a harness-owned agent by any consumer

### Requirement: Single Shared Authority {#REQ-agent-identity-002}

Phase-cost emission (`scripts/hooks/subagent-stop.js`, Go mirror `internal/hooks/subagentstop.go`)
and bench/CX0 coverage validation (`scripts/evals/lib/benchmark.js`) MUST derive agent
identity through this same resolution point. Consumers MUST NOT embed their own
`sdd-`-prefix string conventions where the shared resolution applies. The resolution
MUST NOT introduce a plugin registry or configuration surface.

#### Scenario: Emitter and validator agree for the same registered name

- GIVEN the registered name `host:sdd-design` observed by both the emitter and the validator
- WHEN each consumer resolves the name
- THEN both MUST obtain the same canonical agent `sdd-design`
- AND the emitted `row.agent` MUST pass the validator's coverage check

#### Scenario: Prefix-free compatibility with current attestation (O1)

- GIVEN an unprefixed registered name that today produces a `phase`/`agent` value
- WHEN resolution replaces the prior per-site logic
- THEN the produced canonical `phase` and `agent` values MUST be identical to today's
- AND existing persisted O1 rows and attestations MUST remain valid without migration

### Requirement: Go/JS Resolution Parity {#REQ-agent-identity-003}

The JS resolution and its Go mirror MUST behave identically: same closed agent set,
same prefix grammar, same `unresolved` outcome. Parity MUST be asserted by tests in
both runtimes over the same cases, including a regression case for a previously
unrecognized prefixed name.

#### Scenario: Parity across representative names

- GIVEN the input set `sdd-spec`, `host:sdd-spec`, `review-runtime`, `host:review-runtime`, `review-invented`
- WHEN JS and Go resolution each process the set
- THEN both runtimes MUST produce identical results for every input

#### Scenario: Prefixed-name regression case

- GIVEN a prefixed name that the prior strict-equality logic failed to recognize
- WHEN the JS and Go regression tests run
- THEN both MUST assert the name resolves to its canonical harness agent
