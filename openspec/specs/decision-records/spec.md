# Decision Records Specification

## Purpose

Three decision records share one document model, `ospec-decision-record/v1`
(`schemas/foundation/decision-records/v1.schema.json`). Fixtures are JSON of
that model. `lintDecisionRecord` reports warnings and does not reject a
record for a warning. A record that does not match the schema is rejected.

An ADR cites driver ids and keeps product names out of its decision. A TSR
implements one or more ADRs and names a dated source. A DC is a development
decision. Foundation still writes the technology record as a section of
`docs/architecture/technical-baseline.md`; this requirement does not move
that output. Dogfood of this repository's ADRs stays in E2.6.

## Requirements

### Requirement: A Valid Record Has No Warnings {#REQ-decision-records-001}

An ADR MUST name `kind` `adr`, at least two options, a decision, consequences,
a fitness function, a review trigger and a `stack` list. It MUST cite at
least one driver whose `kind` is `scenario`, `constraint` or `assumption`.
A product or library name from `stack` inside an option MUST NOT warn when
the decision text does not contain that name. A TSR MUST name `kind` `tsr`,
at least one implemented ADR id and one source whose `date` is `YYYY-MM-DD`.
A DC MUST name `kind` `dc` and a decision. Each of these MUST lint with no
warnings. A record whose `kind` is none of `adr`, `tsr` or `dc` MUST be
rejected and MUST NOT be reported as a warning.

#### Scenario: The three valid records stay quiet

- GIVEN a valid ADR, a valid TSR and a valid DC
- WHEN each is linted
- THEN each MUST be accepted with no warnings

#### Scenario: An unknown kind is not a warning

- GIVEN a record whose `kind` is `note`
- WHEN it is linted
- THEN it MUST be rejected
- AND it MUST NOT produce a warning

### Requirement: Technology In The Decision Is A Warning {#REQ-decision-records-002}

The stack list accompanies the record in `stack`, or the caller passes
`stack` to `lintDecisionRecord` and that argument wins. A name matches the
decision as a whole phrase, ignoring case. `Go` MUST match `go` and MUST NOT
match `goal`. A match MUST add the warning `technology-in-decision` and MUST
NOT reject the ADR.

#### Scenario: A product named in the decision warns

- GIVEN an ADR whose decision names a stack entry in another case
- WHEN it is linted
- THEN it MUST stay valid
- AND its only warning MUST be `technology-in-decision`

#### Scenario: The argument replaces the record stack

- GIVEN a valid ADR whose decision does not name its own stack
- WHEN it is linted with a `stack` argument that the decision does name
- THEN the warning MUST be `technology-in-decision`

### Requirement: A Development Decision Classified As An ADR Is A Warning {#REQ-decision-records-003}

A record declares its type in `kind`. Classifying it as something else sets
`as`. `kind` `dc` with `as` `adr` MUST add the warning
`misclassified-development-decision` and MUST NOT reject the record. A DC
without `as`, or with `as` `dc`, MUST NOT add that warning.

#### Scenario: kind dc validated as an ADR warns

- GIVEN a DC whose `as` is `adr`
- WHEN it is linted
- THEN it MUST stay valid
- AND its warning MUST be `misclassified-development-decision`

### Requirement: An ADR Without A Driver Id Is A Warning {#REQ-decision-records-004}

An ADR whose `drivers` list is empty MUST add the warning `missing-driver`
and MUST NOT be rejected. Prose in `context_and_drivers` without a driver id
MUST NOT count as the citation.

#### Scenario: Empty drivers warn

- GIVEN an ADR with an empty `drivers` list and context prose
- WHEN it is linted
- THEN it MUST stay valid
- AND its warning MUST be `missing-driver`

### Requirement: A TSR Without An ADR Or A Dated Source Is A Warning {#REQ-decision-records-005}

A TSR whose `implements` list is empty MUST add `missing-adr`. A TSR with no
source dated `YYYY-MM-DD` MUST add `missing-dated-source`. Either warning
MUST leave the record valid. Both MUST be reported, `missing-adr` first,
when both apply.

#### Scenario: A missing ADR and a missing date warn separately

- GIVEN a TSR that implements no ADR and has a dated source
- AND a TSR that implements an ADR and has only an undated source
- WHEN each is linted
- THEN the first warning MUST be `missing-adr` and the second `missing-dated-source`
- AND both records MUST stay valid
