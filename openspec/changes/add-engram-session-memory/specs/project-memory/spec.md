# Delta for project-memory

## ADDED Requirements

### Requirement: Session Memory Is an Optional Adapter Outside the Store {#REQ-project-memory-001}

The "Session memory" row of the Ownership Boundary table and the Purpose text MUST describe session memory as an OPTIONAL adapter defined by the `session-memory` domain, not as a built-in dependency. Its owner is the user's Engram plugin (runtime); it is non-authoritative and MUST NOT be required by any phase read/write contract of this domain. Engram MUST store pointers only and MUST NOT duplicate normative content kept in `openspec/memory/*.md` or specs.

(Archive note: the table row and Purpose sentence live outside any requirement block; apply MUST edit them in the promoted baseline to match this requirement.)

#### Scenario: Boundary table wording

- GIVEN the Ownership Boundary table after this change
- WHEN the Session memory row is read
- THEN it names an optional adapter referencing `session-memory` and makes no claim of native integration

#### Scenario: Memory contracts work without Engram

- GIVEN Engram is absent
- WHEN a phase performs its phase-start read or archive/verify writes
- THEN behavior is identical to the Graceful Absence requirement with no Engram dependency

#### Scenario: No duplication of normative content

- GIVEN a resolved decision is written to `openspec/memory/decisions.md`
- WHEN a phase also saves an Engram pointer
- THEN the pointer holds a summary and relative path, not the decision text
