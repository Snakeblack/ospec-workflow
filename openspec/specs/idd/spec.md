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
(REQ-idd-013), else from the default, which is `idd` since E1.6 made IDD the
default entry. A change MUST keep the mode it started with until it is
closed or archived. IDD tooling MUST NOT read or write `openspec/changes/`, and
SDD tooling MUST NOT treat `idd/` as holding SDD changes. No SDD requirement
changes because IDD exists.

#### Scenario: Change mode wins over project mode

- GIVEN `mode: sdd` in `idd/config.yaml`
- AND a change whose state declares `mode: idd`
- WHEN the mode of that change is resolved
- THEN it MUST resolve to `idd`

#### Scenario: Absent configuration resolves to IDD

- GIVEN a project without `mode` in `idd/config.yaml` and a new change without
  `mode`, even when the project has an `openspec/` directory
- WHEN its mode is resolved
- THEN it MUST resolve to `idd`

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
`request`), `facts` (the open-facts declaration of REQ-idd-018: either `open`,
the list of open questions, or `basis`, why none is open), `signals` (each with `id`, `reason` and `source`, `declaration` or
`diff`), `obligations` (each with `id`, `signal`, `status` in `pending`,
`satisfied`, `withdrawn`, the `evidence` ids that satisfy it and, when
withdrawn, `withdrawn_reason`), `gates` (each with `id`, `status` `open` or
`resolved`, an optional `reason` and, when resolved, `answer` and `source`) and
`evidence` (each with `id`, `kind`, `obligation` and `recorded_at`, plus the
`detail` that names the runs behind run evidence), and optionally `base` (the
commit the change started from, or null outside git), `runs` (each
CLI-observed execution of REQ-idd-014) and `reviews` (the trust review
lineages of REQ-idd-016, oldest first), plus `closed_at` once the change is
closed (REQ-idd-017). A state without `base`, `runs`, `reviews` or `facts` MUST
stay valid, as the states written before they existed. While the
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
evidence entry recorded at close, and only when `change.md` keeps the four
sections in order, its `Plan` and `Decisions` are not empty and the evidence
markers are in place. While it is current, `ospec check` MUST NOT report it
as missing.

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
- `tdd-red-green`: a test failing before the code and passing after it, per
  unit of work, both runs recorded by the CLI (REQ-idd-014).
- `repro-run-pair`: the reproduction test failing before the fix and passing
  after it, both runs recorded by the CLI.
- `living-doc-current`: `change.md` holds the template sections and is current
  at close.
- `contract-spec-and-test`: a contract document and a test, both touched by
  the change, with every check passing on the same tree (REQ-idd-015).
- `migration-test`: the declared compatibility or rollback plan plus a passing
  migration test run on the current tree (REQ-idd-015).
- `frozen-review`: an independent trust review with frozen findings and at most
  one bounded correction, approved for the current candidate (REQ-idd-016).
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

### Requirement: Only Four Gates {#REQ-idd-008}

IDD MUST stop for the user only at four gates: `ambiguous-intent` when the
intent is materially ambiguous, `open-facts` when behavior questions that
neither the request nor the code settles are open (REQ-idd-018),
`adr-amend-or-contradict` when the change amends
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

#### Scenario: Open facts stop before anything is built

- GIVEN a change opened with two open facts
- WHEN `next` runs
- THEN the next step MUST be `resolve-gate` for `open-facts`
- AND the pending decision MUST list both questions

### Requirement: Close Requires Settled Obligations {#REQ-idd-009}

`ospec close` MUST succeed only when no obligation is `pending` and no gate is
`open`. Closing MUST set `status: closed` and archive the change transactionally
(REQ-idd-017).
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
ambiguous, else `resolve-gate` while `open-facts` is open, else the first
pending obligation in the order `repro-test`,
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
git diff against a base commit (default: the change's recorded `base`, else
`HEAD`), staged, unstaged and untracked,
give `source: diff`. A signal both planned and in the diff MUST keep
`source: declaration`. Paths under `idd/` MUST NOT count. Every signal MUST
carry a reason naming why it fired, and a path-driven reason MUST name a
matching path and the pattern it matched. The impact patterns MUST be base
patterns for any project plus defaults for each stack detected from its
manifest at the project root (`node`, `jvm`, `dotnet`, `python`, `go`), plus the
lists of the `impact:` section of `idd/config.yaml` (`public_contract`,
`persistent_data`, `security_boundary`). The `public-contract` defaults MUST
also hold, by exact path, the files a `package.json` at the project root
publishes unless it is `private` (`main`, `types`, `typings`, `bin` and every
path of `exports`), and their reason MUST say "published by package.json"
instead of a pattern; a missing or malformed manifest publishes nothing.
`impact.stack` MUST replace the
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

#### Scenario: A published file is a public contract

- GIVEN a public `package.json` with `"types": "index.d.ts"`
- WHEN a change plans to touch `index.d.ts` and its signals are derived
- THEN `public-contract` MUST be recorded with the reason
  "public contract: touches index.d.ts (published by package.json)"

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
`strict_tdd` (`true` or `false`, default `false`), `checks` (the checks
`ospec check` runs, as `name: command` in declared order, REQ-idd-014; absent
means none), `impact` (the impact section of REQ-idd-012) and `contracts`
(where contract documents and their tests live, REQ-idd-015). An unknown or repeated key, a value outside its
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

### Requirement: Check And Run Record Observed Executions {#REQ-idd-014}

Opening a change MUST record as `base` the commit `HEAD` names, or null
outside git or before the first commit; the base never moves afterwards.
`ospec check` MUST recompute the signals from the diff against the change's
base and record what that adds (REQ-idd-006), then run every check of
`idd/config.yaml` in declared order through the shell in the project root, and
record each execution as a run. `ospec run` MUST run one test command for
`repro-test` or `tdd-red-green`, with an optional `--unit`, or for
`migration-compat-and-test` (REQ-idd-015), and record it as a run; it MUST
refuse any other obligation, an obligation the change does not have and an
ambiguous intent. A run MUST hold `id`, `purpose` (`checks`, `repro-test`,
`tdd-red-green` or `migration-test`), `command`, `exit_code`, `output_sha256`,
`tree`, `recorded_at` and, for a check, its `name`. `tree` MUST digest the
working tree the run executed on: `HEAD`, the binary diff of tracked files
against it and the content of untracked files, never anything under `idd/`. A
command that cannot start or ends by a signal MUST NOT count as passing.

`check-run` evidence MUST name its tree and the runs of one `check` in which
every declared check passed on that tree, the tree current when the checks
finished. After each `check`, `checks-pass` MUST be satisfied exactly when that
check recorded such evidence; otherwise it MUST return to `pending`, because
older evidence proved an older tree. `repro-run-pair` and `tdd-red-green`
evidence MUST name a failing run and a later passing run of the same purpose,
command and unit on a different tree, and `ospec run` MUST record it when such
a passing run is recorded.

`ospec check` MUST answer `missing` while an obligation is pending, naming
each with the reason it is not met, else `needs-decision` while a gate is open,
else `ready`. While the intent is ambiguous it MUST answer `needs-decision`
without running anything. A completed check MUST exit with 0 whatever its
answer; outside a git work tree it MUST be refused with `not-a-git-repo`.

#### Scenario: A claimed passing run closes nothing

- GIVEN an open change whose declared check fails
- WHEN the model reports that the tests pass and `ospec check` runs
- THEN the run MUST be recorded with its non-zero exit code
- AND `checks-pass` MUST stay `pending` with the reason naming the failed check

#### Scenario: A later edit needs a new passing check

- GIVEN `checks-pass` satisfied by a check on one tree
- WHEN a file changes and `ospec check` runs again with the checks passing
- THEN the new evidence MUST name the new tree and `checks-pass` MUST list
  only it

#### Scenario: The diff starts touching a migration

- GIVEN an open feature change without `persistent-data`
- WHEN the working tree adds `db/migrations/004_add_index.sql` and
  `ospec check` runs
- THEN `persistent-data` MUST be recorded with `source: diff`
- AND the answer MUST be `missing` naming `migration-compat-and-test`

#### Scenario: Reproduction pair

- GIVEN a bug change with `repro-test` pending
- WHEN `ospec run --obligation repro-test --command "node verify.js"` fails,
  the fix is applied and the same command passes
- THEN `repro-run-pair` evidence MUST name both runs and `repro-test` MUST be
  `satisfied`
- AND a passing run on the same tree as the failing one MUST NOT record it

### Requirement: Contract And Migration Evidence {#REQ-idd-015}

Contract documents and their tests MUST be recognized by path patterns: base
patterns for any project (OpenAPI, Swagger, AsyncAPI, protobuf, GraphQL, JSON
Schema and `docs/api/**` for documents; `*.test.*`, `*.spec.*` and test
directories for tests), defaults for each detected stack, and the
`documents` and `tests` lists of the `contracts` section of `idd/config.yaml`,
whose only other key is `defaults`;
`contracts.defaults: false` MUST drop the base and stack patterns, and an
unknown key MUST be refused with `config-invalid`. Matching MUST ignore case.
On every `ospec check`, `contract-spec-and-test` MUST be satisfied exactly when
the diff against the change's base touches at least one contract document and
one test and that check recorded `check-run` evidence; the evidence MUST name
the tree, that `check-run` evidence and the matching `documents` and `tests`.
Otherwise it MUST return to `pending` with a reason naming what is missing.

`ospec run --obligation migration-compat-and-test` MUST require `--plan`, the
declared compatibility or rollback plan, and record a run with purpose
`migration-test`. A passing run MUST record `migration-test` evidence naming the
run, its tree and the plan; a failing run MUST return the obligation to
`pending`. On every `ospec check`, migration evidence whose tree is not the
current tree MUST return the obligation to `pending`.

#### Scenario: Contract code without its document stays pending

- GIVEN a change whose diff touches `src/api/orders.js` and every check passes
- WHEN `ospec check` runs
- THEN `contract-spec-and-test` MUST stay `pending` with a reason naming the
  missing contract document
- AND once the diff also touches `api/openapi.yaml` and
  `src/api/orders.test.js`, the next check MUST satisfy it

#### Scenario: Migration evidence follows the tree

- GIVEN `migration-compat-and-test` satisfied by a passing migration test run
- WHEN the migration file changes and `ospec check` runs
- THEN the obligation MUST return to `pending` until the migration test passes
  again on the new tree

### Requirement: Bounded Trust Review {#REQ-idd-016}

`trust-review` MUST be satisfied only through the bounded review lineage
(schema v2) with exactly the `trust` lens: the selective gate gives a change
one lens per obligation that asks for a review, and none when no obligation
does. `ospec review start` MUST freeze the candidate (the paths the diff
changes against the change's base, a digest of their content on both sides and
the changed line counts, from a snapshot of the working tree that excludes
`idd/`) and return the request for the independent `review-trust` reviewer;
while a review is in progress it MUST return that review instead.
`ospec review record` MUST record the reviewer's findings once and freeze them. With
no `BLOCKER` or `CRITICAL` finding the review is approved and `frozen-review`
evidence MUST be recorded, naming the lineage, the candidate, its tree and the
findings digest. Otherwise one bounded correction is allowed:
`ospec review correct` MUST record the changes since the reviewed candidate, refused outside
the frozen paths or over the line budget, and return the frozen IDs for the
read-only `review-correction` validator, and `ospec review validate` MUST apply
its verdict to exactly those IDs. A passing validation approves the review; a
failing one MUST end the lineage, because IDD allows one correction per review.
Results are passed as JSON with `--result`.

Approved evidence proves only its candidate: on every `ospec check`, if the
reviewed paths, or any security-boundary path the diff now touches, differ
from the reviewed candidate, `trust-review` MUST return to `pending`. A
successor review MUST need no approval (REQ-idd-008) but MUST be refused while
the reviewed paths are unchanged since the last review, and a change MUST run
at most 3 reviews; after that `trust-review` stays `pending` with a reason
saying so, and the person decides how to go on. All lineages stay in
`reviews`, each successor naming its predecessor.

#### Scenario: Approved review goes stale with the reviewed code

- GIVEN an approved trust review of `src/auth/tokens.js`
- WHEN only `notes.md` changes and `ospec check` runs
- THEN `trust-review` MUST stay `satisfied`
- AND when `src/auth/tokens.js` changes, the next check MUST return it to
  `pending` and `ospec review start` MUST open review 2

#### Scenario: One bounded correction

- GIVEN a trust review whose frozen findings hold one `BLOCKER`
- WHEN the code is corrected inside the frozen paths and `ospec review correct`
  runs
- THEN it MUST return that finding's ID for `review-correction`
- AND a validation that resolves it MUST approve the review, while one that
  does not MUST end the lineage

#### Scenario: Documentation-only change closes without review

- GIVEN a `docs` change that only touches `docs/security/token-rotation.md`
- WHEN `ospec check` runs with the checks passing
- THEN the answer MUST be `ready` with no `trust-review` obligation

### Requirement: Transactional Close {#REQ-idd-017}

`ospec close` MUST refuse with `evidence-stale` when the `check-run` evidence
that satisfies `checks-pass` was not recorded on the current tree, because the
last `ospec check` settled every tree-bound obligation on that tree. It MUST
then, under a lock held outside the change directory, settle `living-doc`
(REQ-idd-004), refuse with `close-refused` naming every pending obligation and
open gate, and record `status: closed` with `closed_at` atomically; that state
is the resume marker. It MUST then rewrite the evidence section of `change.md`,
when it exists, and move `idd/<change-id>/` to
`idd/archive/<YYYY-MM-DD>-<change-id>/`, dated by `closed_at`. The move MUST
keep the inventory digest of the archive transaction (O6A) equal on both
sides; when a rename fails it MUST copy to a staging directory, compare the
inventories and only then replace the destination and remove the origin. Run
again after an interruption, close MUST finish the move: a destination with the
origin's inventory removes the origin, a destination with other content MUST
be refused with `archive-conflict`, and an already archived change MUST report
`already_complete`. A refused close MUST leave the change open where it was.
The result MUST name the destination, its file count and its inventory digest.
`openspec/` is never touched (REQ-idd-002).

#### Scenario: Edit after the last check

- GIVEN a change whose checks passed on one tree
- WHEN a file changes and `ospec close` runs
- THEN it MUST be refused with `evidence-stale` and the change MUST stay open
  in `idd/<change-id>/`

#### Scenario: Close finishes an interrupted move

- GIVEN a closed change whose copy reached `idd/archive/` before its origin was
  removed
- WHEN `ospec close` runs again
- THEN the origin MUST be removed and the result MUST name the archive

### Requirement: Open Facts Declaration {#REQ-idd-018}

Recording a resolved intent, including the resolution of `ambiguous-intent`,
MUST declare its open facts: the behavior questions that neither the request
nor the code settles, such as defaults, invalid or edge input, error versus
silent handling, normalization and compatibility with existing behavior. The
declaration MUST be either at least one question (`--open-fact`, repeatable)
or `--no-open-facts` with the `--basis` that settles every behavior, never both
and never neither; otherwise `record intent` MUST be refused with
`facts-undeclared`. The declaration MUST be stored in `facts`, with repeated
questions recorded once. Open facts MUST open the `open-facts` gate, which only
`record intent` opens, and which MUST be resolved only by the user's answer
with its source. While it is open, `next` MUST return the questions as one
batch, so they are asked together before the change is built.

#### Scenario: An intent without the declaration is refused

- GIVEN a new change with kind, summary and acceptance
- WHEN `record intent` runs without `--open-fact` or `--no-open-facts`
- THEN it MUST be refused with `facts-undeclared` and no change MUST be opened

#### Scenario: No open facts records its basis

- GIVEN a typo fix whose request settles every behavior
- WHEN it is recorded with `--no-open-facts --basis "only the spelling changes"`
- THEN `facts.basis` MUST hold that basis and no gate MUST be open

#### Scenario: Open facts are answered by the user

- GIVEN a change opened with the open facts "Is an unknown code an error?" and
  "Does case matter?"
- WHEN the user answers both
- THEN `record gate --gate open-facts --resolve --answer <their words> --source user`
  MUST resolve the gate
- AND an attempt to open `open-facts` through `record gate` MUST be refused
