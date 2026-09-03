# Delta for generator

## ADDED Requirements

### Requirement: Quality Review Runtime Script Parity {#REQ-generator-014}

Cross-target generation MUST preserve semantic and byte parity for `scripts/lib/review-dimensions.js`, `scripts/lib/review-gate-state.js`, and `scripts/lib/review-lineage.js` relative to source behavior after the quality-domain migration. Generated copies embedded in target trees MUST reflect deterministic-first routing, `sufficient|ambiguous` classification, union domain selection, removal of `normal-signal-overflow`, quality-domain specialist maps, and mixed-taxonomy fail-closed guards.

#### Scenario: Generated review-dimensions matches source contract

- GIVEN configure emits a target tree containing `review-dimensions.js`
- WHEN parity tests compare source and generated copies
- THEN normalized evidence for identical input MUST yield identical domain selection and classification status

#### Scenario: Generated review-lineage rejects mixed taxonomy

- GIVEN generated `review-lineage.js` receives classifier domains with 4R lineage owners
- WHEN validation runs
- THEN it MUST fail closed
- AND MUST NOT dispatch or complete archive under mixed identities

## MODIFIED Requirements

### Requirement: Review Agents May Emit Readonly Frontmatter {#REQ-generator-008}

A target profile MAY declare an agent-readonly policy. When declared, each listed review agent MUST emit `readonly: true` in output frontmatter. For the `cursor` profile the six quality-review agents MUST be covered: `review-trust`, `review-runtime`, `review-evolution`, `review-efficiency`, `review-change`, and `review-correction`.

(Previously: six `review-*` agents referenced the 4R specialist roster.)

#### Scenario: Cursor quality specialists are readonly

- GIVEN the cursor readonly policy lists the six quality-review agents
- WHEN those agents are transformed
- THEN each emitted agent file MUST include `readonly: true`

#### Scenario: Retired 4R agents are not required readonly targets

- GIVEN configure runs after roster migration
- WHEN readonly policy is validated
- THEN it MUST NOT require `review-risk`, `review-reliability`, `review-resilience`, or `review-readability` as live readonly targets

### Requirement: Codex Review And Apply/Verify Sandbox Validator Rules {#REQ-generator-011}

For the Codex target, `validate-codex.js` MUST require every generated agent TOML whose basename starts with `review-` to declare `approval_policy = "never"`. This MUST apply to the quality-domain roster and `review-change` / `review-correction`. For `sdd-apply.toml` and `sdd-verify.toml` it MUST require a `[sandbox_workspace_write]` table and `network_access = false`.

(Previously: example referenced `review-risk.toml`.)

#### Scenario: Quality review agent TOML missing approval_policy fails

- GIVEN a Codex agent file `review-trust.toml` lacks `approval_policy = "never"`
- WHEN the Codex validator runs
- THEN it MUST emit an error naming that file and the missing policy

#### Scenario: Apply/verify sandbox network must be disabled

- GIVEN `sdd-apply.toml` or `sdd-verify.toml` omits `[sandbox_workspace_write]` or leaves network access enabled
- WHEN the Codex validator runs
- THEN it MUST emit an error for the missing table and/or disabled-network requirement

## MODIFIED Requirements (runtime inventory)

The generator runtime inventory MUST continue to include `review-dimensions.js`, `review-gate-state.js`, and `review-lineage.js` for every supported target. `models.yaml` mappings MUST list the four quality specialists and retain `review-change` tier as configuration data, not spec-prescribed premium/default policy.

#### Scenario: Configure collects quality review runtime modules

- GIVEN configure runs for any supported target
- WHEN runtime modules are collected
- THEN `review-dimensions.js`, `review-gate-state.js`, and `review-lineage.js` MUST appear in the emitted runtime set

#### Scenario: models.yaml maps quality specialists

- GIVEN `models.yaml` defines model tiers for review agents
- WHEN configure validates policy
- THEN entries for `review-trust`, `review-runtime`, `review-evolution`, and `review-efficiency` MUST be present
- AND validation MUST fail if any required quality specialist mapping is missing
