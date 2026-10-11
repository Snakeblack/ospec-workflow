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
that output. An ADR recovered from an existing repository is `inferred` and
cites `path:line` evidence (REQ-decision-records-006). A Markdown ADR in the
foundation template parses into the same record (REQ-decision-records-007);
this repository's ADRs in `docs/architecture/decisions/` lint that way.

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

### Requirement: An Inferred ADR Cites Evidence That Resolves {#REQ-decision-records-006}

Only an ADR MAY have `status` `inferred`. An inferred ADR MUST cite at least
one `path:line` reference in `evidence`; without it the record MUST be
rejected. When the user confirms or corrects it, it becomes `accepted` and
MAY keep its evidence. A rejected inferred ADR is not written; the component
map records it as a divergence. When the caller passes `root`, every
reference MUST resolve as REQ-component-map-002 requires, or the record MUST
be rejected with rule `evidence`; this is an error, never a warning.

#### Scenario: Evidence past the end of a file rejects the record

- GIVEN an ADR whose evidence names a line past the end of an existing file
- WHEN it is linted with the repository as root
- THEN it MUST be rejected with rule `evidence`
- AND it MUST NOT produce a warning

### Requirement: A Markdown ADR Lints As Its Record {#REQ-decision-records-007}

`parseAdrMarkdown` MUST read the ADR template of
`skills/foundation/references/foundation-details.md`: the `# NNNN. <title>`
heading gives `id` and `title`; the `Status`, `Date` and `Evidence` items give
`status`, `date` and the comma-separated `evidence`; `superseded by NNNN`
MUST read as `superseded`. The sections `Context and drivers`, `Options
considered`, `Decision`, `Consequences`, `Fitness function` and `Review
trigger` MUST give their fields, each numbered option one entry. Each
backticked `scenario:<id>`, `constraint:<id>` or `assumption:<id>` in the
context MUST become one driver, once, in order of appearance; prose without
that form MUST NOT. `stack` MUST come from the caller and be empty without it.
A missing part MUST stay absent, so that the schema rejects the record.

#### Scenario: The template parses into a quiet record

- GIVEN a Markdown ADR in the template with two cited drivers
- WHEN it is parsed and linted with the repository as root
- THEN it MUST be valid with no warnings
- AND its drivers MUST be the two cited ids

#### Scenario: A missing section rejects the ADR

- GIVEN a Markdown ADR without its `Decision` section
- WHEN it is parsed and linted
- THEN it MUST be rejected
- AND it MUST NOT produce a warning

### Requirement: Executable Checks Of A Fitness Function {#REQ-decision-records-008}

Each line `` - Check: `<command>` `` of a Markdown ADR's `Fitness function`
section MUST be one executable check of that ADR (REQ-idd-022), in order; a
line of that form in any other section MUST NOT. The prose of the section
stays the `fitness_function` of the record, and a section without a `Check:`
line is a fitness function to check by hand. Check lines MUST NOT change the
lint of the record.

#### Scenario: A boundary rule becomes a check

- GIVEN an ADR whose `Fitness function` says that the domain never imports an
  adapter and adds `` - Check: `npm run lint:deps` ``
- WHEN its checks are read
- THEN they MUST be `["npm run lint:deps"]`
- AND the record MUST lint as before
