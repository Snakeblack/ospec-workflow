# Delta for skills

## ADDED Requirements

### Requirement: sdd-phase-common Memory Table Is Host-Neutral {#REQ-skills-020}

The "Session memory" row of the Operative Memory Ownership Boundary table in `skills/_shared/sdd-phase-common.md` MUST use host-neutral wording describing an optional, non-authoritative session adapter and MUST reference the `session-memory` domain. It MUST NOT name a specific plugin as an assumed built-in nor claim a native integration. No phase skill MAY gain an Engram read/write obligation from this table.

#### Scenario: Neutral row wording

- GIVEN `skills/_shared/sdd-phase-common.md`
- WHEN the Session memory row is read
- THEN it says session memory is optional and non-authoritative and points to `session-memory`

#### Scenario: Phase obligations unchanged

- GIVEN the Phase-Read Table
- WHEN compared before and after this change
- THEN it is identical and lists only `openspec/memory/` files
