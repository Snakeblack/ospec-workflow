# Delta for archive-plan-contract

## ADDED Requirements

### Requirement: Route-Complete Lite Archive Inventory {#REQ-archive-plan-contract-004}

For a persisted `lite` route, an `archive-plan.json` inventory MUST be complete for the artifacts that actually belong to the five-phase lite contract and MUST NOT reference absent proposal, spec, or design artifacts. The plan MUST still include its required schema-v1 fields, source fingerprint, accepted warnings, rollback strategy, and every existing origin artifact that the runtime must preserve. `spec_writes` MAY be empty for a lite change. The validator and transaction preflight MUST reject an inventory that omits a present required lite artifact, includes a nonexistent artifact, or treats legitimate absence of spec/design as a reason to bypass hash, reference, or inventory integrity checks.

#### Scenario: Complete lite plan has no spec writes

- GIVEN a verified lite change with proposal-lite, tasks, apply progress, and verify report but no specs or design
- WHEN archive prepares schema-v1 plan
- THEN `spec_writes` MAY be empty and the inventory lists the existing lite artifacts
- AND validation succeeds without nonexistent full-planning references

#### Scenario: Invented design reference blocks archive

- GIVEN a lite archive plan includes a missing `design.md` in its inventory or references
- WHEN validator or preflight checks the filesystem snapshot
- THEN the plan MUST be rejected fail-closed with an allowlisted integrity code
- AND runtime archive mutation MUST NOT begin

#### Scenario: Lite plan preserves fail-closed integrity

- GIVEN a lite plan has an incorrect source fingerprint or omits an existing verify report
- WHEN validator or preflight runs
- THEN it MUST reject the plan fail-closed
- AND absence of spec/design MUST NOT relax integrity validation
