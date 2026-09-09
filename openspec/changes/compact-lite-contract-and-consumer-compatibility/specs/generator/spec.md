# Delta for generator

## ADDED Requirements

### Requirement: Lite Contract Cross-Target Parity {#REQ-generator-017}

Generation and validation MUST preserve the lite artifact contract across `claude`, `vscode`, `github-copilot`, `opencode`, `codex`, and `cursor`. Every generated target MUST retain equivalent route-aware producer, consumer, recovery, and archive instructions: a valid lite flow accepts absent spec/design artifacts, preserves `apply-progress` continuity and verification evidence, and does not add routes or merge phases. Target validation MUST fail when a target requires nonexistent lite spec/design artifacts or diverges from the source lite phase order and dependency behavior.

#### Scenario: All targets accept a complete lite inventory

- GIVEN each target is generated from the same source contract
- WHEN its lite lifecycle fixture omits spec and design artifacts legitimately
- THEN every target accepts the five-phase lite inventory
- AND every target preserves the source phase order and evidence obligations

#### Scenario: Target with an unconditional spec read fails parity

- GIVEN a generated target requires a spec or design artifact for a lite consumer
- WHEN target contract validation runs
- THEN validation MUST fail for that target
- AND generation parity MUST NOT be reported as passing

#### Scenario: Normal target contract remains complete

- GIVEN a generated target handles a standard route
- WHEN it resolves planning dependencies
- THEN it requires proposal, specs, and design as before
- AND lite compatibility MUST NOT weaken the standard contract
