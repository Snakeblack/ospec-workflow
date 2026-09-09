# Delta for skills

## ADDED Requirements

### Requirement: Route-Appropriate Lite Artifact Production and Consumption {#REQ-skills-017}

For an active `lite` route, `sdd-propose` MUST persist a compact `proposal-lite.md` containing intent, bounded scope, acceptance criteria, risks, and rollback information; `sdd-tasks` MUST derive actionable tasks and verification evidence from it. `sdd-apply`, `sdd-verify`, and `sdd-archive` MUST condition required reads on the persisted route and MUST treat absent spec/design artifacts as valid only for the lite contract. They MUST preserve task status, independent verification, accepted warnings, archive inventory, and all applicable state evidence. `sdd-apply` MUST read and merge an existing `apply-progress.md`; it MUST NOT replace prior progress. Non-lite routes MUST retain their declared full-planning dependencies.

#### Scenario: Resumed lite apply retains progress

- GIVEN a lite change has `proposal-lite.md`, `tasks.md`, and prior `apply-progress.md`
- WHEN a later apply batch runs
- THEN it reads the lite planning contract and prior progress before writing
- AND the resulting progress preserves prior entries and records the new batch

#### Scenario: Lite verify is independent without specs

- GIVEN a completed lite apply with no spec or design artifact
- WHEN `sdd-verify` evaluates the change
- THEN it checks the proposal-lite acceptance criteria, tasks, implementation, and evidence independently
- AND absence of spec/design alone MUST NOT be reported as a verification failure

#### Scenario: Standard route keeps full dependencies

- GIVEN a standard change reaches tasks, apply, verify, or archive
- WHEN a consumer resolves its required artifacts
- THEN proposal, change-local specs, and design remain required as declared
- AND a missing full-planning artifact MUST NOT be treated as lite compatibility
