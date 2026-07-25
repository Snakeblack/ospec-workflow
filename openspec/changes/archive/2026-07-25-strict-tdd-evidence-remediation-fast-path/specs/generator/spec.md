# Delta for generator

## ADDED Requirements

### Requirement: Intentional SDD Agent Model-Tier Migration {#REQ-generator-005}

`models.yaml` MUST define the complete SDD-agent tier policy below. Entries not
listed as SDD phase agents, including review agents and `_default`, MUST retain
their existing tier unless another approved requirement changes them.

| Tier | SDD agents |
|------|------------|
| `premium` | `sdd-propose`, `sdd-design`, `sdd-verify`, `sdd-foundation`, `sdd-workspace` |
| `default` | `sdd-orchestrator`, `sdd-spec`, `sdd-clarify`, `sdd-apply`, `sdd-reconcile`, `sdd-baseline` |
| `cheap` | `sdd-init`, `sdd-explore`, `sdd-tasks`, `sdd-archive`, `sdd-onboard`, `sdd-document` |

The Codex tier definitions MUST resolve `premium` to `gpt-5.6-sol` with
`model_reasoning_effort: medium`, `default` to `gpt-5.6-terra` with
`model_reasoning_effort: medium`, and `cheap` to `gpt-5.6-luna` with
`model_reasoning_effort: low`. This migration MUST be treated as an intentional
policy contract, not as incidental fixture drift.

The generator MUST apply the declared agent tier consistently for every
supported generated target that defines a model value for the selected tier.
Targets without a model column MUST preserve the existing fail-soft omission
behavior. Codex output MUST contain the exact model and reasoning-effort pair above.
Contract tests MUST validate the complete SDD-agent tier partition, reject
missing or duplicate assignments, and verify generated model parity for agents
that moved tiers.

#### Scenario: Complete SDD agent partition is accepted

- GIVEN `models.yaml` contains the approved premium, default, and cheap SDD-agent sets
- WHEN the model-tier contract is validated
- THEN every listed SDD agent MUST occur in exactly one approved tier
- AND the validator MUST accept the mapping without restoring a prior tier

#### Scenario: Promoted proposal agent resolves through premium

- GIVEN `sdd-propose` is assigned to `premium`
- WHEN model-capable target outputs are generated
- THEN each output MUST resolve `sdd-propose` from that target's premium model definition
- AND Codex MUST emit `gpt-5.6-sol` with reasoning effort `medium`

#### Scenario: Default tier resolves to Terra medium on Codex

- GIVEN any approved default SDD agent is generated for Codex
- WHEN model policy is injected
- THEN its model MUST be `gpt-5.6-terra`
- AND its reasoning effort MUST be `medium`

#### Scenario: Cheap tier migration resolves to Luna low on Codex

- GIVEN `sdd-init`, `sdd-tasks`, `sdd-onboard`, or `sdd-document` is generated for Codex
- WHEN model policy is injected
- THEN its model MUST be `gpt-5.6-luna`
- AND its reasoning effort MUST be `low`

#### Scenario: Stale prior assignment fails the contract

- GIVEN a contract fixture keeps `sdd-propose` in default or keeps `sdd-document` in default
- WHEN the complete mapping contract runs
- THEN validation MUST fail with the mismatched agent and expected tier
- AND generation parity MUST NOT be reported as passing

#### Scenario: Model-capable targets preserve tier parity

- GIVEN the approved mapping and tier definitions
- WHEN all model-capable target generators process the same agent roster
- THEN each generated agent MUST use the model belonging to its declared tier for that target
- AND contract tests MUST fail if any target resolves an agent from a different tier

#### Scenario: Target without a model column remains fail-soft

- GIVEN a supported target declares no model column for the selected tier
- WHEN it generates an agent from the approved roster
- THEN it MUST preserve the baseline omission behavior rather than inventing a model
- AND the tier-parity contract MUST NOT treat that omission as a mismatch
