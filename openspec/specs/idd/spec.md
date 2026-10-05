# IDD Specification

## Purpose

IDD (impact-driven development) is the change workflow in which the impact of a
change on what the project knows decides how much ceremony it gets, and recorded
evidence decides when it is done. The `ospec` CLI derives signals, obligations
and transitions; the model decides content. SDD remains an optional mode that
shares the repository with IDD. The machine-readable catalog lives in
`scripts/lib/idd-contract.js` and MUST stay in parity with this spec.

## Requirements

### Requirement: Workflow Mode Resolution And Coexistence {#REQ-idd-001}

Each change MUST run in exactly one mode, `idd` or `sdd`. The mode MUST resolve
from the change's own `mode`, else from `workflow.mode` in
`openspec/config.yaml`, else from the default, which is `sdd` until E1.6 makes
IDD the default entry. A change MUST keep the mode it started with until it is
closed or archived. IDD tooling MUST NOT read or write `openspec/changes/`, and
SDD tooling MUST NOT treat `idd/` as holding SDD changes. No SDD requirement
changes because IDD exists.

#### Scenario: Change mode wins over project mode

- GIVEN `workflow.mode: sdd` in `openspec/config.yaml`
- AND a change whose state declares `mode: idd`
- WHEN the mode of that change is resolved
- THEN it MUST resolve to `idd`

#### Scenario: Absent configuration keeps SDD before E1.6

- GIVEN a project without `workflow.mode` and a new change without `mode`
- WHEN its mode is resolved
- THEN it MUST resolve to `sdd`

#### Scenario: SDD changes in flight are untouched

- GIVEN an active SDD change under `openspec/changes/`
- WHEN the project switches `workflow.mode` to `idd`
- THEN that change MUST finish in SDD with its current state and artifacts

### Requirement: IDD Change Layout {#REQ-idd-002}

An IDD change MUST live in `idd/<change-id>/` at the project root, where
`<change-id>` is kebab-case. The directory MUST hold `state.yaml` and, only when
the `living-doc` obligation is active, `change.md`. Closing a change MUST move it
to `idd/archive/<YYYY-MM-DD>-<change-id>/`. Behavioral contracts a change updates
MUST stay canonical in `openspec/specs/`; `idd/` holds change state, never
canonical specs.

#### Scenario: Trivial change creates no document

- GIVEN a change whose only obligation is `checks-pass`
- WHEN it is opened and closed
- THEN `idd/<change-id>/` MUST NOT contain `change.md` at any point

#### Scenario: Closed change is archived by date

- GIVEN a change `fix-login-timeout` closed on 2026-10-05
- WHEN the close completes
- THEN its directory MUST be `idd/archive/2026-10-05-fix-login-timeout/`

### Requirement: CLI-Owned Minimal State {#REQ-idd-003}

`state.yaml` MUST declare `schema` as `idd-state/v1` and hold only `change`, `mode`,
`status` (`open` or `closed`), `intent` (`kind` in `bug`, `feature`,
`refactor`, `docs`, plus `summary` and `acceptance`), `signals` (each with `id`,
`reason` and `source`, `declaration` or `diff`), `obligations` (each with `id`,
`signal`, `status` in `pending`, `satisfied`, `withdrawn`, the `evidence` ids
that satisfy it and, when withdrawn, `withdrawn_reason`), `gates` (each with
`id`, `status` `open` or `resolved` and, when resolved, `answer` and `source`)
and `evidence` (each with `id`, `kind`, `obligation` and `recorded_at`). Only
the `ospec` CLI MAY write `state.yaml`, and every write MUST be atomic. The model
MUST NOT edit it.

#### Scenario: Satisfied obligation names its evidence

- GIVEN a state whose obligation `repro-test` has status `satisfied`
- WHEN the state is validated
- THEN the obligation MUST list at least one evidence id
- AND each listed id MUST name an `evidence` entry of kind `repro-run-pair`
  recorded for `repro-test`

#### Scenario: Unknown field is rejected

- GIVEN a `state.yaml` with a top-level field outside the schema
- WHEN the state is validated
- THEN validation MUST fail naming that field

### Requirement: Living Document Template {#REQ-idd-004}

When the `living-doc` obligation is active, `change.md` MUST carry the sections
`Intent and acceptance`, `Plan`, `Decisions` and `Evidence`, in that order. The
model writes the first three. The `Evidence` section MUST be written only by the
CLI, between `<!-- ospec:evidence:start -->` and `<!-- ospec:evidence:end -->`.
The `living-doc` obligation MUST be satisfied only by a `living-doc-current`
evidence entry recorded at close.

#### Scenario: Evidence section is CLI-owned

- GIVEN a `change.md` whose model-written sections changed
- WHEN the CLI records evidence
- THEN it MUST rewrite only the text between the evidence markers

### Requirement: Signal Obligation Evidence Catalog {#REQ-idd-005}

Obligations MUST come only from this catalog. Each active signal adds its
obligations, and each obligation is closed only by evidence of its kind. Every
signal MUST carry a human-readable reason. `always` MUST be active for every
change with a resolved intent. `adr-or-quality-attribute` MUST stay inactive
until E3.1 delivers ADR impact declarations.

| Signal | Obligation | Evidence |
| --- | --- | --- |
| `always` | `checks-pass` | `check-run` |
| `strict-tdd` | `tdd-red-green` | `tdd-red-green` |
| `bug-fix` | `repro-test` | `repro-run-pair` |
| `multi-unit-or-decision` | `living-doc` | `living-doc-current` |
| `public-contract` | `contract-spec-and-test` | `contract-spec-and-test` |
| `persistent-data` | `migration-compat-and-test` | `migration-test` |
| `security-boundary` | `trust-review` | `frozen-review` |
| `adr-or-quality-attribute` | `adr-impact-declaration` | `adr-impact-declaration` |

- `check-run`: an execution of each check the project declares, run by the CLI,
  with exit code and output digest.
- `tdd-red-green`: the existing structured Strict TDD RED → GREEN evidence, one
  per unit of work.
- `repro-run-pair`: the reproduction test failing before the fix and passing
  after it, both runs recorded by the CLI.
- `living-doc-current`: `change.md` holds the template sections and is current
  at close.
- `contract-spec-and-test`: the contract spec in `openspec/specs/` and its test,
  both touched by the change, with the test passing.
- `migration-test`: declared compatibility or rollback plus a passing migration
  test.
- `frozen-review`: an independent trust review with frozen findings and at most
  one bounded correction.
- `adr-impact-declaration`: `none`, `conforms`, `amends` or `contradicts` per
  touched ADR or quality attribute.

#### Scenario: Obligations follow active signals only

- GIVEN active signals `always` and `bug-fix`
- WHEN obligations are derived
- THEN they MUST be exactly `checks-pass` and `repro-test`

#### Scenario: Deferred signal stays inactive

- GIVEN a change before E3.1 that touches a component with an ADR
- WHEN signals are derived
- THEN `adr-or-quality-attribute` MUST NOT be active

### Requirement: Recomputed Signals Never Drop Obligations Silently {#REQ-idd-006}

Signals MUST be derived first from the declared intent and planned paths, then
recomputed from the real diff on every check. A signal the diff triggers MUST add
its obligations immediately with `source: diff`. An obligation MUST leave
`pending` only by being satisfied or by an explicit recorded withdrawal with a
reason, and a withdrawal MUST be refused while any active signal still derives
that obligation.

#### Scenario: Diff adds a migration obligation

- GIVEN an open change without `persistent-data`
- WHEN the diff starts touching a migration
- THEN `persistent-data` MUST become active with `source: diff`
- AND `migration-compat-and-test` MUST be added as `pending`

#### Scenario: Withdrawal refused while the signal holds

- GIVEN a pending `trust-review` whose `security-boundary` signal is active
- WHEN a withdrawal of `trust-review` is requested
- THEN it MUST be refused and the obligation MUST stay `pending`

### Requirement: Evidence Is Recorded Never Asserted {#REQ-idd-007}

An obligation MUST be satisfied only by an evidence entry the CLI records, of the
kind the catalog names for it. A statement by the model, such as "the tests
pass", without a recorded execution MUST NOT satisfy any obligation.

#### Scenario: Claimed test run does not close checks

- GIVEN a pending `checks-pass` and no recorded `check-run`
- WHEN the model reports that the tests pass
- THEN `checks-pass` MUST stay `pending`

### Requirement: Only Three Gates {#REQ-idd-008}

IDD MUST stop for the user only at three gates: `ambiguous-intent` when the
intent is materially ambiguous, `adr-amend-or-contradict` when the change amends
or contradicts an ADR, and `irreversible-operation` before a destructive or
irreversible operation. No other question MAY block progress. A gate MUST be
resolved only by an explicit user answer, recorded with its source. While
`ambiguous-intent` is open, no signal MUST be derived.

#### Scenario: Ambiguous intent stops before signals

- GIVEN the request "improve the login"
- WHEN the change is opened
- THEN `ambiguous-intent` MUST be open
- AND the change MUST have no active signal or obligation until it is resolved

#### Scenario: Destructive migration opens the irreversible gate

- GIVEN a change whose migration drops a column holding data
- WHEN signals are derived
- THEN `irreversible-operation` MUST be open alongside the
  `migration-compat-and-test` obligation

### Requirement: Close Requires Settled Obligations {#REQ-idd-009}

`ospec close` MUST succeed only when no obligation is `pending` and no gate is
`open`. Closing MUST set `status: closed` and archive the change transactionally.
Delivery (branch, PR and merge) MUST stay outside close and is the person's
decision.

#### Scenario: Close refused with a pending obligation

- GIVEN an open change with `repro-test` pending
- WHEN close is requested
- THEN it MUST be refused naming `repro-test`

### Requirement: Reference Change Fixtures {#REQ-idd-010}

`scripts/fixtures/idd/` MUST hold one fixture per reference change type
(`typo`, `bug`, `internal-feature`, `public-api`, `migration`, `auth`) plus the
gate cases `ambiguous-intent` and `destructive-migration`. Each fixture MUST
declare its inputs and its expected signals, obligations, gates and whether a
living document exists, and its expected obligations MUST equal the catalog
derivation of its expected signals. The CLI items that follow (E1.2–E1.4) MUST
reproduce these expectations.

#### Scenario: Typo closes with checks only

- GIVEN the `typo` fixture
- WHEN its expectations are read
- THEN its only obligation MUST be `checks-pass`, with no gate and no living
  document
