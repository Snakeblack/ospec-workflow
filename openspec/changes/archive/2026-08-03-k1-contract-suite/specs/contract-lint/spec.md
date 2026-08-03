# Delta for contract-lint

## ADDED Requirements

### Requirement: Schema And Doc Compatibility Checker {#REQ-contract-lint-008}

The unified contract-lint registry MUST include a checker that rejects
incompatibilities between published kernel schemas and contract documentation
or fixtures that claim to describe those schemas. An offender MUST be
reported when a doc/fixture asserts a required field, enum value, or command
shape that the referenced schema does not allow, or when a required schema
family lacks `$id`/version.

#### Scenario: Doc field not allowed by schema is an offender

- GIVEN a contract doc or fixture that asserts field `F` as required for
  schema family S
- AND schema S does not allow `F`
- WHEN this checker runs in the aggregator
- THEN it MUST report an offender naming the doc/fixture path and field `F`
- AND the overall lint run MUST fail

#### Scenario: Schema family missing $id is an offender

- GIVEN a required kernel schema family file without `$id` or version
- WHEN this checker runs
- THEN it MUST report an offender for that schema path

### Requirement: Undocumented Emission Checker {#REQ-contract-lint-009}

The registry MUST include a checker that rejects documentation, fixtures, or
contracts that name a field or command as emitted when the emitting code
under the declared emission surface does not produce that field or command.
The checker MUST fail closed on such mismatches.

#### Scenario: Named command not emitted by code

- GIVEN a fixture or doc that names command `C` as an emitted execute command
- AND the emitter under test never produces `C`
- WHEN this checker runs
- THEN it MUST report an offender for `C`
- AND the overall lint run MUST fail

#### Scenario: Emitted-only fields pass

- GIVEN docs/fixtures that name only fields and commands the emitter produces
- WHEN this checker runs
- THEN it MUST return an empty offender list for those artifacts

### Requirement: Prose Authority Fallback Checker {#REQ-contract-lint-010}

The registry MUST include a checker that rejects docs or contracts that
instruct or describe an authority-sensitive operation as obtaining its
decision by interpreting free-form prose when a structured field is required.
Claims that Graph IR is independent authority tagged as `implemented` MUST
also be reported as offenders.

#### Scenario: Prose fallback instruction is an offender

- GIVEN a doc that tells an authority operation to infer a missing structured
  transition/reason field from prose
- WHEN this checker runs
- THEN it MUST report an offender for that doc path
- AND the overall lint run MUST fail

#### Scenario: Graph IR implemented-as-authority is an offender

- GIVEN a doc that labels Graph IR independent authority as `implemented`
- WHEN this checker runs
- THEN it MUST report an offender

#### Scenario: Structured-only authority guidance passes

- GIVEN docs that require structured contracts for authority decisions and
  label Graph IR non-implemented
- WHEN this checker runs
- THEN it MUST return an empty offender list for those claims

### Requirement: Maturity Label Checker {#REQ-contract-lint-011}

The registry MUST include a checker that validates harness-evolution (or
equivalent) maturity labeling: each claimed capability in the scoped maturity
register MUST carry exactly one of `implemented`, `target`, or
`experimental`, and MUST NOT present `target`/`experimental` items as
`implemented`.

#### Scenario: Missing maturity tag is an offender

- GIVEN a scoped maturity register entry with no maturity tag
- WHEN this checker runs
- THEN it MUST report an offender for that entry

#### Scenario: Well-tagged register passes

- GIVEN every scoped maturity entry carries exactly one valid tag
- WHEN this checker runs
- THEN it MUST return an empty offender list for maturity labeling
