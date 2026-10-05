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
from the change's own `mode`, else from `mode` in `idd/config.yaml`
(REQ-idd-013), else from the default, which is `sdd` until E1.6 makes IDD the
default entry. A change MUST keep the mode it started with until it is
closed or archived. IDD tooling MUST NOT read or write `openspec/changes/`, and
SDD tooling MUST NOT treat `idd/` as holding SDD changes. No SDD requirement
changes because IDD exists.

#### Scenario: Change mode wins over project mode

- GIVEN `mode: sdd` in `idd/config.yaml`
- AND a change whose state declares `mode: idd`
- WHEN the mode of that change is resolved
- THEN it MUST resolve to `idd`

#### Scenario: Absent configuration keeps SDD before E1.6

- GIVEN a project without `mode` in `idd/config.yaml` and a new change without
  `mode`
- WHEN its mode is resolved
- THEN it MUST resolve to `sdd`

#### Scenario: SDD changes in flight are untouched

- GIVEN an active SDD change under `openspec/changes/`
- WHEN the project sets `mode: idd` in `idd/config.yaml`
- THEN that change MUST finish in SDD with its current state and artifacts

### Requirement: IDD Change Layout {#REQ-idd-002}

An IDD change MUST live in `idd/<change-id>/` at the project root, where
`<change-id>` is kebab-case. The directory MUST hold `state.yaml` and, only when
the `living-doc` obligation is active, `change.md`. Closing a change MUST move it
to `idd/archive/<YYYY-MM-DD>-<change-id>/`. `idd/` holds the IDD configuration
and change state, never canonical specs or project knowledge. `openspec/`
belongs to the SDD mode: IDD MUST NOT keep its configuration, state or
artifacts there.

#### Scenario: IDD writes nothing under openspec

- GIVEN a project with an `openspec/` directory
- WHEN an IDD change is opened, recorded and closed
- THEN every file IDD writes MUST be under `idd/`

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
`refactor`, `docs`, plus `summary` and `acceptance`, and optionally the original
`request`), `signals` (each with `id`, `reason` and `source`, `declaration` or
`diff`), `obligations` (each with `id`, `signal`, `status` in `pending`,
`satisfied`, `withdrawn`, the `evidence` ids that satisfy it and, when
withdrawn, `withdrawn_reason`), `gates` (each with `id`, `status` `open` or
`resolved`, an optional `reason` and, when resolved, `answer` and `source`) and
`evidence` (each with `id`, `kind`, `obligation` and `recorded_at`). While the
`ambiguous-intent` gate is open, `intent.kind`, `intent.summary` and
`intent.acceptance` MUST be null, `intent.request` MUST hold the original
request, and `signals` and `obligations` MUST be empty. `state.yaml` MUST be
written as JSON, which is valid YAML 1.2. Only the `ospec` CLI MAY write
`state.yaml`, and every write MUST be atomic. The model MUST NOT edit it.

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

#### Scenario: Ambiguous intent keeps only the request

- GIVEN a change opened from the request "improve the login" with
  `ambiguous-intent` open
- WHEN the state is validated
- THEN `intent.request` MUST hold that request and `intent.kind` MUST be null
- AND once the gate is resolved, a null `intent.kind` MUST fail validation

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
- `contract-spec-and-test`: the contract document and its test, both touched
  by the change, with the test passing.
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
declare its inputs and its expected signals, obligations, gates, whether a
living document exists and its expected `next` step, and its expected
obligations MUST equal the catalog derivation of its expected signals. The CLI items that follow (E1.2–E1.4) MUST
reproduce these expectations.

#### Scenario: Typo closes with checks only

- GIVEN the `typo` fixture
- WHEN its expectations are read
- THEN its only obligation MUST be `checks-pass`, with no gate and no living
  document

### Requirement: CLI Core Status Next And Record {#REQ-idd-011}

The `ospec` CLI MUST expose `status`, `next` and `record`, each with a `--json`
output. `record` MUST accept the types `intent`, `signal`, `gate` and
`withdraw`, and MUST NOT accept evidence: evidence is recorded only by the CLI
commands that observe the execution it proves (REQ-idd-007). Every `record`
MUST be idempotent: repeating it MUST leave `state.yaml` byte-identical, and
rewriting a recorded fact with different content MUST be refused. Every write
MUST run under the state file's lock and replace the file atomically, so an
interrupted `record` leaves the last committed state readable. A change id
MUST be kebab-case before it reaches the filesystem. `next` MUST be a pure
function of the stored state and MUST return the change, its pending
obligations in work order, the pending decision, the next step and the
knowledge references. The next step MUST be `resolve-gate` while the intent is
ambiguous, else the first pending obligation in the order `repro-test`,
`tdd-red-green`, `contract-spec-and-test`, `migration-compat-and-test`,
`adr-impact-declaration`, `trust-review`, `checks-pass`, `living-doc`, else the
first open gate, else `close`. The CLI MUST exit with 0 on success, 1 when the
IDD contract refuses the request and 2 on a usage error.

#### Scenario: Repeated record is a no-op

- GIVEN a change with the `bug-fix` signal recorded
- WHEN the same `record signal` runs again
- THEN it MUST report `changed: false`
- AND `state.yaml` MUST be byte-identical and hold one `bug-fix` signal

#### Scenario: Interrupted record keeps the committed state

- GIVEN a committed `state.yaml`
- WHEN a `record` fails after writing its temporary file and before replacing
  the state
- THEN reading the change MUST return the committed state
- AND the next `record` MUST succeed

#### Scenario: Next is deterministic for the reference fixtures

- GIVEN the state each fixture of REQ-idd-010 reaches through `record`
- WHEN `next` runs, whatever order its signals were recorded in
- THEN it MUST return the fixture's expected next step and pending decision

#### Scenario: Evidence cannot be recorded by hand

- GIVEN an open change with `checks-pass` pending
- WHEN `ospec record evidence` is requested
- THEN the CLI MUST exit with 2 and `checks-pass` MUST stay `pending`

### Requirement: Impact Signal Derivation {#REQ-idd-012}

`ospec signals` MUST derive the signals of an open change with a resolved
intent and record the ones not yet recorded. `always` MUST derive from the
resolved intent; `strict-tdd` from `strict_tdd: true` in `idd/config.yaml`
unless the intent kind is `docs`; `bug-fix` from the intent kind `bug`; and
`multi-unit-or-decision` from more than one declared work unit or a declared
non-obvious decision. `public-contract`, `persistent-data` and
`security-boundary` MUST derive from paths matching their impact patterns: the
planned paths give `source: declaration` and, with `--diff`, the paths of the
git diff against a base commit (default `HEAD`), staged, unstaged and untracked,
give `source: diff`. A signal both planned and in the diff MUST keep
`source: declaration`. Paths under `idd/` MUST NOT count. Every signal MUST
carry a reason naming why it fired, and a path-driven reason MUST name a
matching path and the pattern it matched. The impact patterns MUST be base
patterns for any project plus defaults for each stack detected from its
manifest at the project root (`node`, `jvm`, `dotnet`, `python`, `go`), plus the
lists of the `impact:` section of `idd/config.yaml` (`public_contract`,
`persistent_data`, `security_boundary`); `impact.stack` MUST replace the
detected stacks, `impact.defaults: false` MUST drop the base and stack patterns,
and paths matching `impact.exclude` or the default exclusions
(documentation: `**/*.md`, `**/*.mdx`, `docs/**`) MUST NOT derive any signal.
An unknown `impact:` key or stack MUST be refused. Matching MUST ignore case.
The `irreversible-operation` gate MUST open for a declared irreversible
operation (`drop-table`, `drop-column`, `drop-schema`, `drop-database`,
`truncate-table`, `delete-data`, `rewrite-history`) or for a destructive
statement (drop of a table, schema, database or column, truncate, or a complete
`DELETE` without `WHERE`) in a line the diff adds to a `persistent-data` file;
comment lines MUST NOT count. No other derivation MAY open a gate. The
path-driven signals and `bug-fix` MUST map one to one onto the K1 hard floors
(`public_api`, `data_migration`, `auth_security`,
`localized_reproducible_bug`), and the result MUST report the K1 floor they
yield. Recording MUST be idempotent and MUST NOT drop a recorded signal the new
derivation misses, nor reopen a resolved gate (REQ-idd-006). While
`ambiguous-intent` is open, `signals` MUST be refused.

#### Scenario: Two changed lines in a public contract add its obligation

- GIVEN an open change whose planned paths touch no impact pattern
- WHEN the diff changes two lines of `src/api/orders.js` and `signals --diff`
  runs
- THEN `public-contract` MUST be recorded with `source: diff` and the reason
  "public contract: touches src/api/orders.js (matches **/api/**)"
- AND `contract-spec-and-test` MUST be `pending`

#### Scenario: Large mechanical refactor opens no gate

- GIVEN a refactor touching 240 files outside every impact pattern
- WHEN its signals are derived from the declaration and the diff
- THEN the only signal MUST be `always` and no gate MUST open

#### Scenario: Destructive statement in the diff opens the gate

- GIVEN a diff that adds `ALTER TABLE customers DROP COLUMN fax_number;` to a
  file under `db/migrations/`
- WHEN `signals --diff` runs
- THEN `persistent-data` MUST be recorded with `source: diff`
- AND `irreversible-operation` MUST be open with a reason naming `DROP COLUMN`
  and the file

#### Scenario: Documentation about a boundary derives nothing

- GIVEN a `docs` change that only touches `docs/security/token-rotation.md` in a
  project with `strict_tdd: true`
- WHEN its signals are derived
- THEN the only signal MUST be `always`

#### Scenario: Reference fixtures derive from their declaration

- GIVEN each fixture of REQ-idd-010
- WHEN its signals are derived from its intent, planned paths, work units,
  decision and operations
- THEN they MUST equal its expected signals and gates

### Requirement: IDD Project Configuration {#REQ-idd-013}

The IDD configuration of a project MUST live in `idd/config.yaml`, next to its
changes, and IDD MUST NOT read its configuration from `openspec/`, whose
`config.yaml` configures only the SDD mode. The file is optional; when it is
absent every key takes its default. Its top-level keys MUST be only `mode`
(`idd` or `sdd`, the project mode of REQ-idd-001; absent means none),
`strict_tdd` (`true` or `false`, default `false`) and `impact` (the impact
section of REQ-idd-012). An unknown or repeated key, a value outside its
domain or an unreadable line MUST be refused with the code `config-invalid`;
invalid contents of `impact` keep the code `impact-config-invalid`.

#### Scenario: SDD configuration does not configure IDD

- GIVEN `strict_tdd: true` and an `impact:` section in `openspec/config.yaml`
- AND no `idd/config.yaml`
- WHEN the IDD project context is read
- THEN `strict_tdd` MUST be `false` and only the default impact patterns MUST
  apply

#### Scenario: Unknown configuration key is refused

- GIVEN an `idd/config.yaml` with the top-level key `workflow`
- WHEN `ospec signals` reads the project context
- THEN it MUST exit with 1 and the error code `config-invalid`
