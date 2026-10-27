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
closed or archived. IDD tooling MUST NOT read or write `openspec/changes/`,
except `ospec snapshot`, which lists only the directory names of both trees
(REQ-idd-026), and SDD tooling MUST NOT treat `idd/` as holding SDD changes. No SDD requirement
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
the list of open questions, `basis`, why none is open, or `coverage` for a
feature), `assumptions` (text recorded with `ospec record assumption`), `signals` (each with `id`, `reason` and `source`, `declaration` or
`diff`), `obligations` (each with `id`, `signal`, `status` in `pending`,
`satisfied`, `withdrawn`, the `evidence` ids that satisfy it and, when
withdrawn, `withdrawn_reason`), `gates` (each with `id`, `status` `open` or
`resolved`, an optional `reason`, when resolved, `answer` and `source` and, for
`checks-changed`, the `checks` it approves, each with its `name` and `command`,
and the `config` it approves, its `strict_tdd`, `impact` and `contracts`, which
an entry recorded before E1.53 lacks) and
`evidence` (each with `id`, `kind`, `obligation` and `recorded_at`, plus the
`detail` that names the runs behind run evidence), and optionally `base` (the
commit the change started from, or null outside git), `plan` (the plan
`ospec signals` was declared, REQ-idd-012: `paths`, `work_units`, `decision`
and `operations`, plus `decisions`, the texts of `--decision`, once there is
one), `retracted` (each declared signal retracted under
REQ-idd-006, with its `id`, `reason`, `source` and `retract_reason`, plus
`confirmed_by`, `hits`, `answer` and `answer_source` when the user's answer
retracted it), `impacts`
(each declared architecture reference of REQ-idd-020, with its `kind`, `adr` or
`scenario`, its `id`, its `impact`, null until declared, the `reason` once
declared and, for an ADR amended or superseded, the `record` that does it),
`attestations` (the manual evidence of a fitness function no command checks,
REQ-idd-022: one per declared reference, with its `kind`, `id`, `evidence` and
`recorded_at`), `runs` (each
CLI-observed execution of REQ-idd-014) and `reviews` (the trust review
lineages of REQ-idd-016, oldest first), plus `closed_at` once the change is
closed (REQ-idd-017), an ISO 8601 UTC timestamp, since it names the archive. A state without `base`, `plan`, `retracted`, `impacts`,
`attestations`, `runs`, `reviews`, `facts` or `assumptions` MUST stay valid, as the states written before they existed. While the
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
model writes the first three. After every write of the state, the CLI MUST
write the declared plan (its files, its work units above one and its
operations) between `<!-- ospec:plan:start -->` and `<!-- ospec:plan:end -->`
in `Plan`, and the texts of `--decision` between
`<!-- ospec:decisions:start -->` and `<!-- ospec:decisions:end -->` in
`Decisions`, keeping the line endings of the file and the text outside the
markers (E4.16). A document without those markers, as changes opened before
them have, MUST keep its text. The `Evidence` section MUST be written only by the
CLI, between `<!-- ospec:evidence:start -->` and `<!-- ospec:evidence:end -->`.
The `living-doc` obligation MUST be satisfied only by a `living-doc-current`
evidence entry recorded at close, and only when `change.md` keeps the four
sections in order, its `Plan` is not empty, its `Decisions` is not empty unless
the declared plan holds no decision, and the evidence markers are in place. A
marker line alone MUST NOT count as content, and it MUST end the decision
before it for the knowledge records of REQ-idd-024. While it is current,
`ospec check` MUST NOT report it as missing.

#### Scenario: Evidence section is CLI-owned

- GIVEN a `change.md` whose model-written sections changed
- WHEN the CLI records evidence
- THEN it MUST rewrite only the text between the evidence markers

#### Scenario: A decision closes without a hand edit

- GIVEN a bug fix recorded with `--path src/pages.js --path test/pages.test.js`
  and `--decision "A partial page counts as a page."`
- WHEN its red and green runs pass and it closes, with `change.md` untouched
- THEN `close` MUST succeed and return that decision as a knowledge record
- AND a change of two work units without a decision MUST close with an empty
  `Decisions`, and `--decision` without its text MUST be a usage error

### Requirement: Signal Obligation Evidence Catalog {#REQ-idd-005}

Obligations MUST come only from this catalog. Each active signal adds its
obligations, and each obligation is closed only by evidence of its kind. Every
signal MUST carry a human-readable reason. `always` MUST be active for every
change with a resolved intent. `adr-or-quality-attribute` MUST be active only
when the change declares the ADRs or quality scenarios it touches
(REQ-idd-020).

| Signal | Obligation | Evidence |
| --- | --- | --- |
| `always` | `checks-pass` | `check-run` |
| `strict-tdd` | `tdd-red-green` | `tdd-red-green` |
| `bug-fix` | `repro-test` | `repro-run-pair` |
| `untested-product` | `boundary-tests` | `tested-check` |
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
- `tested-check`: a passing check run on the current tree that reports more
  than zero tests, or whose diff touches a test when the output has no count.
- `living-doc-current`: `change.md` holds the template sections and is current
  at close.
- `contract-spec-and-test`: a contract document and a test, both touched by
  the change, with every check passing on the same tree (REQ-idd-015).
- `migration-test`: the declared compatibility or rollback plan plus a passing
  migration test run on the current tree (REQ-idd-015).
- `frozen-review`: an independent trust review with frozen findings and at most
  one bounded correction, approved for the current candidate (REQ-idd-016).
- `adr-impact-declaration`: `none`, `conforms`, `amends`, `supersedes` or
  `contradicts` per declared ADR or quality scenario, with the user's answer
  to `adr-amend-or-contradict` for the last three and, for an ADR amended or
  superseded, a new ADR that passes the decision-record lint (REQ-idd-020),
  plus every executable fitness function of those references passing on the
  current tree (REQ-idd-022).

#### Scenario: Obligations follow active signals only

- GIVEN active signals `always` and `bug-fix`
- WHEN obligations are derived
- THEN they MUST be exactly `checks-pass` and `repro-test`

#### Scenario: Only a declaration activates the ADR signal

- GIVEN a change that touches a component an ADR governs and declares no ADR
- WHEN its signals are derived from its paths and its diff
- THEN `adr-or-quality-attribute` MUST NOT be active

### Requirement: Recomputed Signals Never Drop Obligations Silently {#REQ-idd-006}

Signals MUST be derived first from the declared intent and planned paths, then
recomputed from the real diff on every check. A signal the diff triggers MUST add
its obligations immediately with `source: diff`. An obligation MUST leave
`pending` only by being satisfied or by an explicit recorded withdrawal with a
reason, and a withdrawal MUST be refused while any active signal still derives
that obligation. `ospec check` MUST also reopen as `pending` every obligation an
active signal derives that the state holds `withdrawn` or lacks, which only a
hand edit leaves (REQ-idd-009).

A declared signal the plan overstated MUST be correctable before the diff
confirms it: `ospec record retract --signal <id> --reason <text>` MUST remove a
`multi-unit-or-decision`, `public-contract`, `persistent-data` or
`security-boundary` signal recorded with `source: declaration`, withdraw its
pending obligation with that reason and append the signal to `retracted`. A
signal of those four recorded with `source: diff` MUST be retractable the same
way once the diff against the change's base no longer derives it, so a
reverted change leaves no pending obligation without a way out. It
MUST be refused for any other signal, while
the diff against the change's base derives the signal (naming why), and when
its obligation is already satisfied. Repeating it MUST be a no-op. A signal the
diff or a declaration derives again after its retraction MUST return and
reopen its obligation.

`persistent-data` that only the content of the diff derives (REQ-idd-012: no
changed path matches a `persistent-data` pattern) MUST also be retractable,
whatever its source, with the user's answer: `--answer <text> --source
user|user-unverified`, as a gate is resolved. The retraction MUST record
`confirmed_by` (the reason the diff derives it), `hits` (every content hit of
the diff at that moment, each as `<reason>: <line>`), `answer` and
`answer_source`, and the derivation MUST leave the signal out while every
content hit of the diff is one of those `hits`; a new or changed write, or a
path, MUST bring it back. The answer MUST be
refused (`retract-answer-refused`) for any other signal or when a path or
nothing derives it, and the refusal of a plain retraction of such a signal
MUST say how to give the answer.

#### Scenario: Overstated plan is corrected before the diff confirms it

- GIVEN a change whose plan declared `src/api/search.js`, so `public-contract`
  is active with `source: declaration`, and a diff that does not touch it
- WHEN `record retract --signal public-contract --reason "no API change"` runs
- THEN `public-contract` MUST leave `signals` and be listed in `retracted`
- AND `contract-spec-and-test` MUST be `withdrawn` with that reason

#### Scenario: A signal the diff confirms cannot be retracted

- GIVEN a declared `persistent-data` signal and a diff that adds a migration
- WHEN its retraction is requested
- THEN it MUST be refused with `signal-confirmed-by-diff`
- AND `migration-compat-and-test` MUST stay `pending`

#### Scenario: A diff signal the diff no longer derives is retracted

- GIVEN `public-contract` with `source: diff` because the diff touched
  `src/api/search.js`, and a diff that no longer touches it
- WHEN `record retract --signal public-contract --reason "the API change was
  undone"` runs
- THEN `public-contract` MUST leave `signals` and be listed in `retracted` with
  `source: diff`
- AND `contract-spec-and-test` MUST be `withdrawn` with that reason

#### Scenario: The user's answer retracts persistent data the content alone derives

- GIVEN `persistent-data` with `source: diff` because `src/report.js` already
  calls `fs.writeFileSync` and the diff changes one of its constants
- WHEN `record retract --signal persistent-data --reason <text> --answer
  "No stored data." --source user` runs
- THEN `migration-compat-and-test` MUST be `withdrawn`, the retraction MUST
  record the answer, and a later `ospec check` MUST NOT bring the signal back
- AND a second write added to `src/report.js` or to another product file MUST
  bring it back
- AND once the diff also touches `db/migrations/001_report.sql`, the signal
  MUST return and the answer MUST be refused with `retract-answer-refused`

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

### Requirement: Only Six Gates {#REQ-idd-008}

IDD MUST stop for the user only at six gates: `ambiguous-intent` when the
intent is materially ambiguous, `open-facts` when behavior questions that
neither the request nor the code settles are open (REQ-idd-018),
`adr-amend-or-contradict` when the change amends
or contradicts an ADR, `irreversible-operation` before a destructive or
irreversible operation, `review-limit` when the trust reviews of the
change are used up (REQ-idd-016), and `checks-changed` when the checks or the
ceremony settings (`strict_tdd`, `impact`, `contracts`) of `idd/config.yaml`
differ from the ones of the change's base (REQ-idd-014). No
other question MAY block progress. A gate MUST be
resolved only by an explicit user answer, recorded with its source: `user`, or
`user-unverified` for an answer relayed rather than given in the session. Any
other source MUST be refused with `invalid-source`, both in `record gate` and
when `record intent` resolves `ambiguous-intent`; a stored state MUST keep the
source it already has. The source, the answer and a `--quote` of `--request`
are declared by the agent: the CLI MUST NOT claim to verify that the user gave
them, so a gate the agent resolves itself, `review-limit` included, still
records as resolved. While
`ambiguous-intent` is open, no signal MUST be derived. A declared impact
`amends`, `supersedes` or `contradicts` MUST open `adr-amend-or-contradict`
with a reason naming the ADR or scenario (REQ-idd-020); the agent MAY also
open it with `record gate --open` and a reason naming the ADR before it asks.
Only `ospec check` MAY open `checks-changed`, and `record gate --open` MUST be
refused with `gate-managed-by-check`. Each set of checks and settings MUST get
its own entry, holding the `checks` and the `config` it approves, so an answer
approves only what it was asked about.

#### Scenario: A gate answer names a known source

- GIVEN an open `irreversible-operation` gate
- WHEN it is resolved with `--source banana`
- THEN it MUST be refused with `invalid-source`
- AND `--source user` or `--source user-unverified` MUST resolve it

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
`open`. Close MUST also revalidate the state with the rules the commands keep,
since a hand edit can break them (REQ-idd-003):

- while an active signal derives an obligation that is `withdrawn` or missing,
  close MUST be refused naming the obligation and the signal;
- close MUST derive the signals again from the diff as `ospec check` does, and be
  refused naming each signal, gate or architecture reference that derivation
  adds and the state lacks, `checks-changed` included while no resolved entry
  approves the current checks and settings;
- close MUST refuse what `ospec check` refuses before it runs anything
  (REQ-idd-014): a kind the diff contradicts (`kind-mismatch`) and a cite
  outside the plan and the diff (`cite-outside-plan`), each with the command
  that raises the ceremony as its way out;
- while `boundary-tests` is satisfied and the diff against the change's base
  adds no code to a test (REQ-idd-012), close MUST be refused naming
  `boundary-tests`, since a check against another `--base` may have counted
  older tests as added;
- while `contract-spec-and-test` is satisfied and the diff against the change's
  base touches no contract document or no test of the contract (REQ-idd-015),
  close MUST be refused naming `contract-spec-and-test`, for the same reason
  (E1.53);
- while a satisfied `checks-pass`, `boundary-tests`, `contract-spec-and-test`,
  `migration-compat-and-test`, or `adr-impact-declaration` with fitness runs,
  holds its last evidence on another tree than the one being closed, close MUST
  be refused with `evidence-stale`;
- a change already marked `closed` but still under `idd/<id>/` MUST resume its
  archive only while no obligation is `pending`, no gate is `open` and no
  obligation an active signal derives is `withdrawn` or missing; otherwise close
  MUST be refused naming them and move nothing. Resuming MUST NOT check tree
  freshness or the derivation again, since the close it resumes may have
  written the changelog, so a hand edit to `closed` escapes those two checks;
- close MUST mark closed the same state it validated, and be refused with
  `state-changed`, before the changelog is written, when `state.yaml` changed
  meanwhile.

Each refusal MUST leave the state and the changelog as they were and name
`ospec check` as the way out, unless it names its own command. Closing MUST set `status: closed` and archive the change transactionally
(REQ-idd-017). The result MUST include `assumptions`, the text recorded with
`ospec record assumption`, or an empty list when none was recorded. Assumptions
MUST NOT block close.
Delivery (branch, PR and merge) MUST stay outside close and is the person's
decision.

#### Scenario: Close refused with a pending obligation

- GIVEN an open change with `repro-test` pending
- WHEN close is requested
- THEN it MUST be refused naming `repro-test`

#### Scenario: Close refuses a state edited by hand

- GIVEN an open change whose `state.yaml` was edited by hand to mark
  `checks-pass` `withdrawn` while the signal `always` is active
- WHEN close is requested
- THEN it MUST be refused naming `checks-pass` and `always`, with `ospec check`
  as the way out
- AND `ospec check` MUST reopen `checks-pass` as `pending`

#### Scenario: Close refuses a signal removed by hand

- GIVEN an open change whose `state.yaml` lost the signal `always` together with
  `checks-pass`
- WHEN close is requested
- THEN it MUST be refused naming the signal `always`, which the diff derives

#### Scenario: Close refuses a kind lowered by hand

- GIVEN a refactor whose diff changes product code, ready to close, whose
  `state.yaml` was edited by hand to kind `docs`
- WHEN close is requested
- THEN it MUST be refused with `kind-mismatch`, naming the product file

### Requirement: Reference Change Fixtures {#REQ-idd-010}

`scripts/fixtures/idd/` MUST hold one fixture per reference change type
(`typo`, `bug`, `internal-feature`, `public-api`, `migration`, `auth`) plus the
gate cases `ambiguous-intent`, `destructive-migration` and
`architecture-amendment`. Each fixture MUST
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
output. `record` MUST accept the types `intent`, `signal`, `gate`, `withdraw`,
`retract` (REQ-idd-006) and `impact` (REQ-idd-020), and MUST NOT accept evidence: evidence is recorded only by the CLI
commands that observe the execution it proves (REQ-idd-007). Every `record`
MUST be idempotent: repeating it MUST leave `state.yaml` byte-identical, and
rewriting a recorded fact with different content MUST be refused. The one
exception is a raised kind (E1.44): `record intent` on an open change with a
resolved intent MAY record a new kind, summary, acceptance and open facts when
the kind raises the ceremony, from `docs` to `refactor`, `bug` or `feature`, or
from `refactor` to `bug` or `feature`. A lower kind, or `bug` and `feature` in
place of each other, MUST still be refused with `intent-conflict`, and while
`open-facts` is open the raise MUST be refused with `open-facts-open`. The
raised intent MUST replace `intent` and `facts`, keep the answered gate
entries, and open a new `open-facts` entry for a question not asked before, and
always for a `feature`, which asks its categories as a feature recorded from
scratch does, even a question answered for the lower kind (E1.53). A raise MUST
keep the recorded `request`, the user's words its quotes come from: another
`--request` MUST be refused with `intent-conflict`, and only an intent without
one MAY record it. Every write
MUST run under the state file's lock and replace the file atomically and
durably (REQ-idd-027), so an interrupted `record` leaves the last committed
state readable. A write whose lock another process took over MUST be refused
with `lock-lost` and write nothing. `record intent` MAY take the plan flags of
`ospec signals` (`--path`, `--work-units`, `--decision <text>`, `--operation`, `--adr`
and `--quality`, REQ-idd-012) and MUST then declare the plan and record the
signals it derives in the same write, returning them in `plan` as `signals`
reports them (E4.15): a refused intent or plan MUST write neither, and with
`--ambiguous` a plan flag MUST be a usage error. A change id
MUST be kebab-case before it reaches the filesystem. `next` MUST be a read-only
function of the stored state and, when check evidence is next, the project's
check configuration and command suggestion, and before anything is built, the
project's files. It MUST return the change, its pending
obligations in work order, the pending decision, the next step and the
knowledge references. The next step MUST be `resolve-gate` for the first open
gate in the order `ambiguous-intent`, `open-facts`, `adr-amend-or-contradict`,
`irreversible-operation`, `review-limit`, `checks-changed`, because every gate is a decision the user takes
before the work it decides (REQ-idd-008); else `declare-plan` (with `how`
naming `ospec signals`) while the change has no recorded `plan`, no signal
from the diff and no run; else the first pending obligation in the order
`repro-test`, `tdd-red-green`, `boundary-tests`, `contract-spec-and-test`,
`migration-compat-and-test`, `adr-impact-declaration`, `trust-review`,
`checks-pass`, `living-doc`; else `close`. The CLI MUST exit with 0 on
success, 1 when the IDD contract refuses the request and 2 on a usage error.
`next` MAY add `suggestions` that never block, such as the ADR promotion of
REQ-idd-020. For an open change, `next` MUST also return the `references` and
`warnings` of REQ-idd-021 and the `fitness` of REQ-idd-022; `knowledge_refs`
keeps naming the living document. Every command that writes a change
(`record`, `signals`, `check`, `run` and `review`) MUST return in `next` what
`next --change <id>` returns for the state it wrote (E4.15), without the
`intent` it has just recorded or already holds (E4.16), so `next` is needed
only to resume.

Every next step MUST carry `command`, the literal `ospec` command that does it
(E1.45), so the protocol can be followed without reading the CLI: the agent
runs it as written and fills in only the `<placeholders>` the CLI cannot know,
such as the user's answer or the files of the plan. After a failing run of
`repro-test`, `tdd-red-green` or `migration-compat-and-test`, the command of
that run MUST replace `"<test>"`, with its `--unit`, quoted as one word for
bash, zsh and fish: in double quotes, or in single quotes when it holds a
quote, `$`, a backtick or a backslash. `resolve-gate` names the `record gate`
that resolves it with the user's answer (`record intent` for
`ambiguous-intent`), `declare-plan` names `ospec signals`, an obligation whose
evidence comes from the checks names `ospec check`, with `--close` while every
pending obligation is one `check` settles (`boundary-tests`,
`contract-spec-and-test`, `adr-impact-declaration` with every declared impact
recorded, and `checks-pass`) or `living-doc` (E4.15), `trust-review` names
`ospec review start`, `adr-impact-declaration` names `record impact` for the
first declared reference without its impact, and `living-doc` and `close`
name `ospec close`. `configure-checks` names `ospec next --change <id> --json`,
to run once the approved checks are written; `open-change` names the
`record intent` template and carries `feature`, the `record intent` of a
feature with one `--open-fact <category>:"<question>"` per category its
project covers (REQ-idd-018), the rules of the categories and, when
`url-state` and `accessibility` are left out, `omitted` with the reason
(E4.16); `choose-change` carries `commands`, one `ospec next` per open change;
and `none` carries a null `command`. The text output of `next` MUST print
each one on a `run:` line.

A command that writes a change MUST print in text a status line and then its
next step on one line, `next (<obligation, gate or action>): <command>`,
followed only by what that step needs: the `how` of an obligation that is not
a run, the gate's questions, the warnings and the suggestions; besides, the
output of a failing run, check or fitness check, the dispatch of a review and,
at close, its records, changelog and release. The pending list, the
references, the fitness functions, the team and the delivery stay in `next`
(E4.16). The `--json` output of `status`, `next`, `record`, `signals`, `check`,
`run`, `review` and `close` MUST leave out every field whose value is null, an
empty list or an empty object, at any depth, while `false` and `0` stay.

#### Scenario: A command that writes prints its status and next step

- GIVEN a bug fix of the pages project with its plan
- WHEN `record intent`, `signals`, `record assumption`, the green run and
  `check` print in text and in `--json`
- THEN each text MUST start with a status line and hold its `next (...)` line,
  without the pending list, the references, the team or the delivery, within
  a ceiling of bytes a test fixes
- AND no `--json` output MUST hold a null, an empty list or an empty object,
  nor an `intent` in its `next`

A refusal MUST say how to get past it (E1.45): with `--json` in `error.how`,
and in text on the line after the error. A refusal whose site names no `how`
takes the one its code has in `scripts/lib/idd-refusals.js`, with `<id>`
filled in from `--change`. A code that no agent input reaches is marked
`byDesign` there instead, with why, and a test MUST find every code the CLI
throws in that table, with no baseline. A usage error MUST print only the
usage lines of its subcommand, with their continuation lines, or the list of
commands for an unknown one, and `--json` MUST carry the same lines in
`error.how`; `--help` still prints the whole usage.

Before the pending `checks-pass` or `contract-spec-and-test` step, if no checks
are declared, `next` MUST instead return `next_step.action: configure-checks`,
`obligation: checks-pass`, `file: idd/config.yaml`, `requires_approval: true`,
`candidate_command` (a suggestion or null) and `how` naming the `checks:` edit
and explicit user approval. This prerequisite MUST NOT override an open gate,
earlier obligations, change selection or a closed change.
It MUST NOT write configuration, execute a candidate or satisfy evidence.

A change opens only inside a project, a git work tree (E4.8). Outside one,
`record intent` and `next` MUST be refused with `not-a-git-repo`, or with
`git-not-found` when git is not installed, before writing anything under
`idd/`, and the error MUST carry a `how` that names direct work for a system
fix and `git init -b main` for a project; the text output MUST print it. The
other `record` types act on an existing change and `status` MUST keep listing
the changes on disk. A change opened before the first commit records a null
`base`, and its diff MUST be taken against the empty tree.

A project with no code yet starts with foundation (E4.10). `next` MUST add the
non-blocking suggestion `foundation` while none of the project's files is
product code or a test, as REQ-idd-012 defines them, and none is under
`docs/product/` or `docs/architecture/`. The project's files are those git
sees under the root, tracked or untracked and not ignored, outside `idd/` and
`.ospec/`: a manifest, a lockfile, documentation or any other file does not
end the suggestion. It MUST be offered only before anything is built: with no
open change (`open-change`) and for a change whose next step is `resolve-gate`
or `declare-plan`, and `record intent` and the other commands that write the
change MUST return it in their `next` as `next` does; `status` never does. Its `how` offers the user the
`foundation` skill as an option. It MUST NOT change the next step or the exit
code, open a gate, add an obligation or write a file, and no refusal of it is
recorded: it ends once the project has code. When git cannot list the files,
there MUST be no suggestion and no error.

#### Scenario: Outside a git work tree no change opens

- GIVEN a directory outside any git work tree
- WHEN `record intent` or `next` runs
- THEN it MUST exit with 1 and the code `not-a-git-repo`, with a `how` naming
  direct work and `git init -b main`
- AND nothing MUST be created under `idd/`
- AND without git on `PATH` the code MUST be `git-not-found`

#### Scenario: A repository without commits takes a change to close

- GIVEN a repository just created with `git init -b main` and a declared check
- WHEN a change is opened, checked and closed before any commit
- THEN its `base` MUST be null and `check` MUST open `checks-changed`, since
  the empty base declares no checks
- AND once the user approves them, `check` MUST answer `ready` and `close`
  MUST succeed

#### Scenario: Record intent declares the plan in the same write

- GIVEN a project with no open change
- WHEN `record intent` opens a bug with `--path src/pages.js --work-units 2`
- THEN the state MUST hold the plan, signals, gates and obligations that
  `record intent` followed by `signals` with the same flags records, and its
  `next` MUST be the first pending obligation
- AND a refused intent, an unknown `--adr` or an invalid `--work-units` MUST
  write no state, and `--ambiguous` with `--path` MUST exit with 2

#### Scenario: Every write returns the next of ospec next

- GIVEN an open change
- WHEN `record`, `signals`, `run` or `check` writes it
- THEN its `next` MUST equal what `next --change <id>` returns right after it,
  with the delivery of the `declare-plan` step included

#### Scenario: Next asks for the plan before any obligation

- GIVEN an open change with a resolved intent and no open facts
- WHEN `next` runs before `ospec signals` declares any path
- THEN the next step MUST be `declare-plan`
- AND once `signals --path src/lib/paginate.js` runs, it MUST be the first
  pending obligation

#### Scenario: A project with no code yet is offered foundation

- GIVEN a git work tree holding only `README.md`, `package.json` and an
  ignored `vendor/lib.js`
- WHEN `next` runs with no change, and `record intent` opens a change
- THEN both MUST carry the suggestion `foundation`, in JSON and on a
  `suggestion foundation:` line in text, with the same next step and exit code
  as without it
- AND a file under `docs/product/`, a source file such as `index.html`, or a
  declared plan MUST leave it out
- AND over the bench scenario repositories it MUST appear for `todo-spa` and
  `receta-spa` and for none of the seven with code

#### Scenario: A decision gate comes before the work it decides

- GIVEN an open change with a declared plan, a pending
  `migration-compat-and-test` and an open `irreversible-operation` gate
- WHEN `next` runs
- THEN the next step MUST be `resolve-gate` for `irreversible-operation`
- AND the pending obligations MUST still list `migration-compat-and-test`

#### Scenario: Repeated record is a no-op

- GIVEN a change with the `bug-fix` signal recorded
- WHEN the same `record signal` runs again
- THEN it MUST report `changed: false`
- AND `state.yaml` MUST be byte-identical and hold one `bug-fix` signal

#### Scenario: A raised kind replaces the intent

- GIVEN an open change of kind `docs` whose diff changes `src/paginate.js`
- WHEN `record intent` runs again with kind `refactor`, a new summary and its
  open facts
- THEN the intent MUST hold kind `refactor` and `check` MUST run
- AND recording kind `docs` again, or a `refactor` with another summary, MUST be
  refused with `intent-conflict`
- AND raising the `refactor` to a `feature` MUST open `open-facts` even when its
  question was answered before, and another `--request` MUST be refused with
  `intent-conflict`

#### Scenario: Interrupted record keeps the committed state

- GIVEN a committed `state.yaml`
- WHEN a `record` fails after writing its temporary file and before replacing
  the state
- THEN reading the change MUST return the committed state
- AND the next `record` MUST succeed

#### Scenario: Every next step names its literal command

- GIVEN an open change whose `repro-test` run failed with
  `node --test test/page.test.js`
- WHEN `next` runs
- THEN `next_step.command` MUST be
  `ospec run --change <id> --obligation repro-test --command "node --test test/page.test.js"`
- AND every other action MUST carry its `command`, `choose-change` its
  `commands` and `none` a null `command`

#### Scenario: A usage error names only its subcommand

- GIVEN any project
- WHEN `ospec run --change fix-pagination --obligation repro-test` runs without
  `--command`
- THEN it MUST exit with 2 and print the usage lines of `ospec run`, not the
  whole usage
- AND `ospec frobnicate` MUST print the list of commands

#### Scenario: A refusal says how to get past it

- GIVEN an open change
- WHEN `record gate --gate bogus --open --json` runs
- THEN it MUST exit with 1 and the code `unknown-gate`, with a `how` that
  lists the six gates

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
unless the intent kind is `docs` or `refactor` (a red test describes new
behavior, and a refactor keeps behavior under the tests that already pass);
`bug-fix` from the intent kind `bug`; and
`multi-unit-or-decision` from more than one declared work unit or a declared
non-obvious decision. A call that names paths, work units, a decision or an
operation MUST record them as the change's `plan`, widening any plan already
recorded (paths and operations accumulate, the largest work-unit count and a
declared decision stay); a call that only reads the diff declares no plan.
Each `--decision` MUST carry the text of the decision, and without it, or with
a blank one, the call MUST be a usage error; the texts accumulate in the
order declared, each once, compared without the spaces at their ends (E4.16). `public-contract`, `persistent-data` and
`security-boundary` MUST derive from paths matching their impact patterns: the
planned paths give `source: declaration` and, with `--diff`, the paths of the
git diff against a base commit (default: the change's recorded `base`, else
`HEAD`), staged, unstaged and untracked,
give `source: diff`. The diff MUST be read with fixed `a/` and `b/` prefixes,
as text and without textconv, whatever the repository's diff settings
(`diff.mnemonicPrefix`, `diff.noprefix`, `diff.srcPrefix`, or `-diff`, `binary`
and `diff=` attributes), and a binary file by its content (a NUL byte in its
first 8000 bytes) MUST bring no lines (E1.53). A signal both planned and in the
diff MUST keep `source: declaration`. Paths under `idd/` MUST NOT count. Every signal MUST
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
comment lines MUST NOT count. A changed product file outside `impact.exclude`
MUST also derive `persistent-data` when it uses `localStorage`, `indexedDB` or a
disk write (`writeFile`, `appendFile`, `createWriteStream`, `os.WriteFile`,
`ioutil.WriteFile`, `File.WriteAllText`, `Deno.writeFile`) in a line the diff
adds or anywhere in the file, or when it imports by relative path (JS/TS
`require`, `import`, `export ... from` and `import()`, Python relative
`from ... import`) a product module outside `impact.exclude` that uses one; a
test, documentation, a manifest or any other file MUST NOT derive it by
content, and the import is never followed through a symlink or out of the
repository. Build scripts write the build output, not persistent data: unless
`impact.defaults` is `false`, a file matching `**/{prebuild,postbuild}.*`,
`build.*` at the root, `**/{scripts,tools}/**/build.*`, `**/scripts/build/**`
or `**/{vite,astro,webpack,rollup}.config.*` MUST NOT
derive `persistent-data` by content, as the touched file or as the imported
module, while its path still counts for every path-driven signal. Added lines MUST derive `public-contract` when documentation
states a selector contract (`getElementById`, `querySelector`, `` `#id` ``) or
an HTTP method plus a path. A comment line, including `//`, `#`, `--`, `/* */`
and `<!-- -->`, MUST NOT count. For an intent of kind `feature` or `bug`, a
diff that changes product code and adds no code to a test MUST derive
`untested-product`. Code is a line that is neither blank nor only a comment, in
a test with a source-file extension: a deleted or emptied test, a comment and a
fixture or golden file are not one (E1.44, E1.53). The CLI cannot judge what a
test asserts, so a trivial test is the trust review's to find. Product code is
a source file by its extension, scripts included: besides JS/TS, Python, Go,
JVM, .NET, Ruby, PHP, Rust and web files, C and C++, Objective-C, Swift, Scala,
Groovy, Dart, Lua, Elixir, Erlang, Clojure, Haskell, OCaml, F#, Visual Basic,
Perl, R, Zig, shell, PowerShell and batch files (E1.53). Documentation, manifests
and tests are not. Documentation is Markdown, MDX, reStructuredText and
AsciiDoc anywhere and everything under the top-level `docs/`; under a nested
`docs/`, a source file is product code (E1.53).
No other derivation MAY open a gate. `--adr`
and `--quality` declare the architecture references of REQ-idd-020. The
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

#### Scenario: A disk write outside product code derives nothing

- GIVEN a diff that adds `fs.writeFileSync` only to `test/cli.js`, a `.diff`
  artifact and a JSON record, and `localStorage` only to `spec.md`
- WHEN its signals are derived
- THEN `persistent-data` MUST NOT be active

#### Scenario: A product file that imports a module that writes derives persistent data

- GIVEN a diff that changes `src/cli.js`, which requires `./store.js`, and
  `src/store.js` calls `fs.writeFileSync`
- WHEN `ospec check` runs, although the diff adds no write
- THEN `persistent-data` MUST be recorded with `source: diff` and the reason
  "persistent data: src/cli.js imports src/store.js, which uses writeFile"
- AND with `src/store.js` in `impact.exclude` it MUST NOT be derived

#### Scenario: A build script that already writes derives no persistent data

- GIVEN a diff that changes a constant of `scripts/postbuild.mjs`, which calls
  `writeFile` on the build output
- WHEN its signals are derived
- THEN `persistent-data` MUST NOT be active
- AND with `impact.defaults: false` it MUST be recorded with the reason
  "persistent data: scripts/postbuild.mjs uses writeFile"

#### Scenario: Documentation about a boundary derives nothing

- GIVEN a `docs` change that only touches `docs/security/token-rotation.md` in a
  project with `strict_tdd: true`
- WHEN its signals are derived
- THEN the only signal MUST be `always`

#### Scenario: A refactor under strict TDD owes no red test

- GIVEN a `refactor` change in a project with `strict_tdd: true`
- WHEN its signals are derived
- THEN `strict-tdd` MUST NOT be active and `tdd-red-green` MUST NOT be owed
- AND `checks-pass` MUST still require every check to pass on the final tree

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
`strict_tdd` (`true` or `false`; absent, the team profile decides it and,
without a profile, `false`), `team` (the team profile of REQ-idd-023),
`delivery` (the `branching` of REQ-idd-023 and the `changelog` and `release`
of REQ-idd-025; absent, the profile decides or recommends them), `checks` (the checks
`ospec check` runs, as `name: command` in declared order, REQ-idd-014; absent
means none), `impact` (the impact section of REQ-idd-012) and `contracts`
(where contract documents and their tests live, REQ-idd-015). An unknown or repeated key, a value outside its
domain or an unreadable line MUST be refused with the code `config-invalid`;
invalid contents of `impact` keep the code `impact-config-invalid`.

Optional configuration does not mean optional check evidence: without at
least one declared check no IDD change can close. The IDD skill MUST ask the
user to approve the proposed command, or provide one when no candidate is
known, and wait before creating or updating `checks:`. An approved edit MUST
preserve the existing configuration. Neither `record intent`, `next`,
`check` nor `doctor` MUST create this file automatically.

A command suggestion MUST be read-only and never constitute approval. For a
root `package.json` with a non-empty string `scripts.test` other than npm's
"no test specified" placeholder, the CLI MAY propose the corresponding
test command. It MUST honor a recognized explicit `packageManager`
(`npm`, `pnpm`, `yarn`, `bun`), otherwise use an unambiguous root lockfile or
`npm test` when no lockfile exists. An invalid or unsupported manager,
conflicting lockfiles, missing or malformed manifest, missing test script or
placeholder MUST produce no candidate; the guidance MUST ask for a command.

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
`tdd-red-green`, `migration-test` or `fitness`), `command`, `exit_code`,
`output_sha256`, `tree`, `recorded_at` and, for a check, its `name`, and for a
fitness check of REQ-idd-022, the `ref` (`adr:<id>` or `scenario:<id>`) it
checks. `tree` MUST digest the
working tree the run executed on: `HEAD`, the binary diff of tracked files
against it and the content of untracked files, never the change state under
`idd/`. A check run MUST also bind the effective verifier list from
`idd/config.yaml`: each check's name, command and declared order. Missing
configuration is an empty list. Other IDD configuration and state MUST NOT
change this check identity. `ospec run` evidence MUST continue to exclude all
of `idd/`, so changing a verifier cannot create a different tree for a
reproduction pair. The source-tree identity used to settle migration-test
evidence MUST also remain independent of the verifier list. A command that
cannot start or ends by a signal MUST NOT count as passing.

`check-run` evidence MUST name its tree and the runs of one `check` in which
every declared check passed on that tree, the tree current when the checks
finished, or the run that counts as the only check (E4.15). After each `check`, `checks-pass` MUST be satisfied exactly when that
check recorded such evidence; otherwise it MUST return to `pending`, because
older evidence proved an older tree. A run whose output reports zero tests
(a `tests 0` summary, "could not find" test files, or "no tests ran") MUST NOT
count as passing and MUST NOT satisfy `boundary-tests`. `boundary-tests` MUST
be satisfied only while the diff adds code to a test (REQ-idd-012), by a passing
check on the current tree that reports more than zero tests or no test count;
the suite that passed before the change, a deleted test, an emptied test, a
comment and a fixture MUST NOT satisfy it (E1.44, E1.53). Its `tested-check` evidence MUST name in `tests`
the test paths of the diff, and a state recorded before them MUST stay valid
with `has_test`. `repro-run-pair` and `tdd-red-green`
evidence MUST name a failing run and a later passing run of the same purpose,
command and unit on a different tree, and `ospec run` MUST record it when such
a passing run is recorded.

When the project declares exactly one check and the `--command` of `ospec run`
equals its command, apart from leading and trailing spaces, the run MUST also
count as that check (E4.15): besides its own run it MUST record a `checks` run
of the same execution, with the check's name and command and the check tree,
and settle from it what `check` settles, passing or failing: the signals of
the diff, `checks-changed`, `checks-pass`, `boundary-tests`,
`contract-spec-and-test` and the trust review's freshness, with the same
evidence a `check` on that tree records. The fitness checks of REQ-idd-022 run
only in `check`: with some to run, `adr-impact-declaration` MUST keep only
evidence of the current check tree and otherwise return to `pending`, with a
reason naming `ospec check`. With several declared checks, or another command,
the run counts as no check. What `check` refuses before it runs anything MUST
leave the run a test run, recorded as before, with a warning that names the
refusal. The result MUST name the check it counted as, its run and evidence.

`ospec check --close` MUST close the change in the same call when the check
answers `ready`, returning the check's result with the `close` of
REQ-idd-009 in place of `next`. Any other answer, or a close that refuses,
MUST be refused as `close` refuses, with exit 1 and `close-refused` or the
code of the close: the check's runs and evidence stay recorded, `--json`
carries the check's result in `check` next to `error`, and the text output
prints it before the refusal.

#### Scenario: A bugfix closes with four calls

- GIVEN a project whose only check is `node --test`
- WHEN a bug opens with `record intent` and its plan, `ospec run --obligation
  repro-test --command "node --test"` fails, the fix is applied and the same
  run passes
- THEN the passing run MUST count as the check, the answer MUST be `ready` and
  the next step `close`
- AND `close` MUST succeed: four calls to the CLI
- AND a feature with one question MUST close with five: `record intent`, the
  `record gate` of the answer, the red and green runs and `close`

#### Scenario: A run of the only check leaves the evidence of check

- GIVEN a passing run that counted as the only check
- WHEN `ospec check` runs on the same tree
- THEN its `check-run` evidence MUST name the same tree and a run with the same
  purpose, name, command, exit code and test count, and it MUST add no signal
- AND a failing run of the check on a tree where `checks-pass` was satisfied
  MUST return it to `pending`
- AND with fitness checks to run, the run MUST run none of them

#### Scenario: Check --close closes only a ready change

- GIVEN an open change whose check fails
- WHEN `ospec check --close` runs
- THEN it MUST exit with 1 and `close-refused`, keep the failing run and carry
  the check's result
- AND once the check passes and `checks-changed` is answered, it MUST close and
  archive the change in the same call

#### Scenario: Changed verifier invalidates old check evidence

- GIVEN every declared check passed and `checks-pass` is satisfied
- WHEN a check's name, command or declared order changes in `idd/config.yaml`
- THEN `ospec close` MUST refuse with `evidence-stale`
- AND a new passing `ospec check` MUST allow close
- BUT changing only other IDD configuration or the CLI's change state MUST NOT
  change check identity
- AND changing the verifier MUST NOT count as a different tree for `ospec run`

`ospec check` MUST answer `missing` while an obligation is pending, naming
each with the reason it is not met, else `needs-decision` while a gate is open,
else `ready`. While the intent is ambiguous it MUST answer `needs-decision`
without running anything. A completed check MUST exit with 0 whatever its
answer; outside a git work tree it MUST be refused with `not-a-git-repo`
(`git-not-found` without git).

What the model declares MUST NOT lower the ceremony (E1.44). Before it runs
anything, `check` MUST contrast the declaration with the diff and refuse:

- with `kind-mismatch` a `docs` change whose diff changes product code, and a
  `refactor` whose diff removes a non-blank line of a contract document
  (`contracts.documents`, REQ-idd-015) or a documentation line that states a
  contract as `public-contract` reads it (REQ-idd-012), unless the same text
  comes back in one of them; its `how` MUST name the `record intent` that
  raises the kind (REQ-idd-011);
- with `cite-outside-plan` a feature cite outside the documentation whose file
  is neither in the plan nor in the diff (REQ-idd-018); its `how` MUST name the
  `ospec signals --path` that declares it.

When `idd/config.yaml` differs from the one at the change's base (the empty
configuration at a null base, without the file or when it cannot be parsed)
in its checks (name, command or order) or in its ceremony settings, `check`
MUST open `checks-changed` with a reason naming what differs on each side,
unless a resolved entry already approves the current checks and settings
(E1.44, E1.53). The ceremony settings are `strict_tdd` as the team profile
leaves it (REQ-idd-023), and the `impact` (REQ-idd-012) and `contracts`
(REQ-idd-015) sections, whose lists count as sets. Any difference asks, also
one that only raises the ceremony: whether an `impact` change raises or lowers
it is not decidable, and a setting this diff does not feel would otherwise
reach the next change's base unapproved. An entry recorded before E1.53
approves the base settings. An open entry nobody answered MUST follow the
current checks and settings, and MUST be dropped when they return to the base
or to an approved set. What the configuration declares therefore cannot lower
the derived obligations without the user's answer.

With no declared checks, `check` MUST keep `checks-pass` pending, answer
`missing` with a reason naming `checks:` in `idd/config.yaml` and explicit
approval, include a command suggestion when known, and return the same
configuration prerequisite as `next` when check evidence is the next step.
It MUST still exit with 0, record no check runs and never write configuration.

#### Scenario: Missing checks become an approved configuration step

- GIVEN an open documentation change without `idd/config.yaml` and a manifest
  declaring a real test script
- WHEN `next` and `check` run
- THEN the next step MUST be `configure-checks` with a command suggestion,
  explicit approval and the configuration path, without creating that file
- AND `check` MUST answer `missing`, exit with 0 and record no check run
- AND `close` MUST refuse while the evidence is missing
- WHEN the approved check command is written and `check` observes it passing
- THEN `checks-changed` MUST open, since the base declares no checks
- AND once the user's approval resolves it, `checks-pass` MUST be satisfied and
  `close` MUST succeed

#### Scenario: A feature without a new test leaves boundary-tests pending

- GIVEN a feature whose diff adds product code and no test, and a check that
  reports `tests 3` from the suite of the base
- WHEN `ospec check` runs
- THEN `boundary-tests` MUST stay `pending` with a reason saying the diff adds
  no line to a test
- AND deleting a test MUST NOT satisfy it, and adding one MUST

#### Scenario: Checks changed to a trivial command need the user's answer

- GIVEN a change whose base declares `test: node verify.js`
- WHEN `idd/config.yaml` changes it to `test: node -e 0` and `ospec check` runs
- THEN `checks-changed` MUST open naming both commands and the answer MUST be
  `needs-decision`
- AND once the user resolves it, another change of the checks MUST open a new
  entry

#### Scenario: Ceremony settings changed against the base need the user's answer

- GIVEN a change whose base declares `strict_tdd: true`, or no `impact.exclude`
- WHEN `idd/config.yaml` sets `strict_tdd: false`, or excludes `src/auth/**`,
  and `ospec check` runs
- THEN `checks-changed` MUST open naming the setting on both sides, and `close`
  MUST be refused until the user resolves it
- AND reordering a list of `impact` or `contracts` MUST open nothing

#### Scenario: A kind the diff contradicts is refused

- GIVEN a `docs` change whose diff adds `src/paginate.js`, or a `refactor`
  whose diff removes the path `/pages` from `api/openapi.yaml`
- WHEN `ospec check` runs
- THEN it MUST be refused with `kind-mismatch`, naming the file, and run nothing
- AND after `record intent` raises the kind, `check` MUST run

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
When `next` has the project's configuration, the `how` of a pending
`contract-spec-and-test` MUST list the resolved document and test patterns and
say that a contract kept elsewhere is a `contracts.documents` entry the user
approves before `idd/config.yaml` is edited.

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
The request MUST carry a `request_digest` of its lineage, generation,
candidate tree and paths, and the `result_contract` the result follows. Each
`result_contract`, this one and the validation one below, MUST name the format
limits the CLI enforces: `cites` a non-empty list of cites inside the file,
finding `summary` and `acceptance_criteria` of at most 1000 characters, and for
a validation `regression.evidence` a non-empty list of strings of at most 500
characters and `follow_ups` as `{owner, summary}` with a summary of at most 500
characters. The CLI MUST NOT rewrite a result to fit them, since the result
digest must match its receipt.
`ospec review record` MUST refuse with `review-refused`, recording nothing, a
result without that `request_digest`, or without a `reviewed` array that
holds, for every path of the request and no other, at least one cite
`<path>:<line>` or `<path>:<start>-<end>` of lines of that path in the frozen
candidate tree (in its base tree for a path the candidate deletes); each
`BLOCKER` or `CRITICAL` finding MUST carry a `location` cited the same way,
and any finding `location` MUST resolve. It MUST then record the reviewer's
findings once, keeping each `location`, and freeze them. With
no `BLOCKER` or `CRITICAL` finding the review is approved and `frozen-review`
evidence MUST be recorded, naming the lineage, the candidate, its tree and the
findings digest, with `attestation: relayed`: the CLI checks what the result
cites, not that the reviewer ran. When `.ospec/review-receipts/` holds the
`SubagentStop` receipt of that `request_digest` from `review-trust`
(REQ-hooks-027), a result whose content digest differs MUST be refused with
`review-refused`, recording nothing, and the evidence MUST hold
`attestation: subagent-stop` with the receipt's agent, `recorded_at` and
`result_digest`; without one the CLI MUST warn that the result is relayed and
never block. The receipt is kept, and it is not proof: the main agent can
write the same file. `ospec close` MUST list each `frozen-review`
evidence with its attestation (null for evidence recorded before it existed),
and the archived evidence section MUST show it. Otherwise one bounded correction is allowed:
`ospec review correct` MUST record the changes since the reviewed candidate, refused outside
the frozen paths or over the line budget, and return the validation request
for the read-only `review-correction` validator: the frozen IDs, the corrected
paths, a `request_digest` of the lineage, generation, corrected tree, those
paths and IDs, and its `result_contract`. `ospec review start` MUST return that
request again while the correction waits for validation. `ospec review validate`
MUST refuse with `review-refused` a result without that `request_digest` or
without a `reviewed` entry that cites each corrected path, and no other, in the
corrected tree (in the reviewed one for a path the correction deletes); it MUST
attest the result as `ospec review record` does, with a receipt from
`review-correction`, and apply its verdict to exactly those IDs. A passing
validation approves the review, and its evidence takes the attestation of the
validation result; a failing one MUST end the lineage, because IDD allows one
correction per review. Results are passed as JSON with `--result`.

A fix that does not fit one bounded correction (more changed lines since the
reviewed candidate than the budget left, or a path outside the frozen ones)
MUST NOT leave the change without a way on: `ospec review correct` MUST refuse
it naming `ospec review start`, and `ospec review start` on a review waiting
for its correction MUST end it as `escalated` with that reason and open the
successor, which counts toward the 3 reviews of the change. When the changes
fit, `ospec review start` MUST keep returning the review in progress. The
request of a successor whose predecessor ended with unresolved `BLOCKER` or
`CRITICAL` findings MUST carry them as `predecessor_findings` (id, severity,
summary, acceptance criteria) so the reviewer checks them on top of the full
review.

Approved evidence proves only its candidate: on every `ospec check`, if the
reviewed paths, or any security-boundary path the diff now touches, differ
from the reviewed candidate, `trust-review` MUST return to `pending`. A
successor review MUST need no approval (REQ-idd-008) but MUST be refused while
the reviewed paths are unchanged since the last review, and a change MUST run
at most 3 reviews plus one for each resolved `review-limit` gate. Once they are
used up while `trust-review` is pending after a terminal review, `ospec check`
MUST open `review-limit`, one entry per authorization that only the CLI opens,
and `ospec review start` MUST refuse with `review-limit` until the person
resolves it. When the reviewed paths come back to the candidate of an approved
current review, `ospec check` MUST satisfy `trust-review` again with that
review's evidence. All lineages stay in `reviews`, each successor naming its
predecessor.

#### Scenario: A hand-written empty result is refused

- GIVEN a trust review in progress of `src/auth/policy.js`
- WHEN `ospec review record` gets `{"findings":[]}`, a `reviewed` entry that
  cites `src/auth/policy.js:999` past its last line, or the `request_digest`
  of another generation
- THEN it MUST refuse with `review-refused` and `next` MUST NOT be `close`
- AND a result with the digest and a real cite of `src/auth/policy.js` MUST
  approve it, its `frozen-review` evidence holding `attestation: relayed`

#### Scenario: A SubagentStop receipt attests the reviewer's result

- GIVEN a trust review in progress and the receipt `review-trust` left for its
  `request_digest`
- WHEN `ospec review record` gets that result with other findings
- THEN it MUST refuse with `review-refused`
- AND the same result, in any key order, MUST approve the review with
  `attestation: subagent-stop`, while without a receipt it is `relayed` with a
  warning

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
- THEN it MUST return that finding's ID for `review-correction` with the
  validation `request_digest`
- AND a validation without that digest or a real cite of the corrected path
  MUST be refused
- AND a validation that resolves it MUST approve the review, while one that
  does not MUST end the lineage

#### Scenario: Oversized correction escalates to a successor

- GIVEN a trust review whose frozen findings hold one `BLOCKER`
- WHEN the fix also needs a file the review never froze
- THEN `ospec review correct` MUST refuse naming `ospec review start`
- AND `ospec review start` MUST end the review as `escalated` and open review 2,
  whose request carries the `BLOCKER` as `predecessor_findings`

#### Scenario: The person authorizes one more review

- GIVEN a change whose 3 trust reviews are used and whose reviewed code
  changed after the last one
- WHEN `ospec check` runs
- THEN `review-limit` MUST be open and `ospec review start` MUST refuse with
  `review-limit`
- AND once the user resolves it, `ospec review start` MUST open review 4

#### Scenario: Back on the approved candidate

- GIVEN an approved trust review whose reviewed file changed, so that
  `trust-review` returned to `pending`
- WHEN the file holds the reviewed content again and `ospec check` runs
- THEN `trust-review` MUST be satisfied by that review's evidence without
  another review

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
open gate, write the changelog entry of REQ-idd-025 and record
`status: closed` with `closed_at` atomically; that state is the resume marker. It MUST then rewrite the evidence section of `change.md`,
when it exists, and move `idd/<change-id>/` to
`idd/archive/<YYYY-MM-DD>-<change-id>/`, dated by `closed_at`. The move MUST
keep the inventory digest of the archive transaction (O6A) equal on both
sides; when a rename fails it MUST copy to a staging directory, compare the
inventories and only then replace the destination and remove the origin. Run
again after an interruption, close MUST finish the move: a destination with the
origin's inventory removes the origin, a destination with other content MUST
be refused with `archive-conflict`, and an already archived change MUST report
`already_complete`. A refused close MUST leave the change open where it was and the changelog
untouched.
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
`facts-undeclared`. A `feature` MUST instead cover every category its project
covers (E4.16): `inputs`, `uniqueness`, `persistence`, `copy` and `errors`
always, and `url-state` and `accessibility` unless the project has code (a
product or test file) and no UI file (`.html`, `.htm`, `.css`, `.scss`,
`.sass`, `.less`, `.jsx`, `.tsx`, `.vue`, `.svelte`, `.astro`) among its files
and the paths of the plan; those two MUST be accepted when given, and a
stored state MAY leave them out. Each category is covered
with a concrete `--open-fact` that names a value, limit or format, a `--cite`
of `path:line` that exists in the tree, or a `--quote` of at least 12 characters
taken from `--request`, and at least one category MUST be a question, so a
feature always opens `open-facts`; coverage made only of cites and quotes MUST
be refused with `facts-undeclared`. A state recorded before this rule, with
every category cited, MUST stay valid. A question is concrete when it holds a digit, a quoted
value of at least 3 characters besides spaces, or a word beyond the category's
own name. A cited line MUST hold a letter or a digit, and no two categories MAY
share the same `path:line` or the same fragment. A cite of a manifest or a
lockfile MUST be refused with `cite-unresolved`, since it settles no behavior.
The rules MUST judge the file the cite reaches inside the project, with its
spelling normalized (`./a`, `a/./b`, a trailing slash) and symlinks resolved,
and the coverage MUST store that file. A cite outside the documentation MUST name a file of the plan or the diff,
which `check` and `close` verify (REQ-idd-014). A state recorded before these
rules MUST stay valid. An intent raised to another kind (REQ-idd-011) keeps the
answered `open-facts` entries of the facts it replaced, so only an open entry
MUST have open questions. A basis that cites nothing MUST
be refused, and the refusal MUST include the command. A refused feature
coverage MUST print the template of the categories its project covers, the one
`next` gives before the change opens. The CLI usage MUST list
the seven categories and the rule that at least one is a question. The declaration MUST be stored in `facts`, with repeated
questions recorded once. Open facts MUST open the `open-facts` gate, which only
`record intent` opens, and which MUST be resolved only by the user's answer
with its source. While it is open, `next` MUST return the questions as one
batch, so they are asked together before the change is built.

#### Scenario: An intent without the declaration is refused

- GIVEN a new change with kind, summary and acceptance
- WHEN `record intent` runs without `--open-fact` or `--no-open-facts`
- THEN it MUST be refused with `facts-undeclared` and no change MUST be opened

#### Scenario: One cite cannot cover every category

- GIVEN a feature whose seven categories cite `README.md:1`, or repeat one
  fragment of `--request`
- WHEN `record intent` runs
- THEN it MUST be refused with `facts-undeclared`, naming the category that
  reuses the cite
- AND a cite of a blank line or of a line such as `---` MUST be refused with
  `cite-unresolved`

#### Scenario: A cite lands where the behavior is settled

- GIVEN a feature that cites `package.json:2` for one category
- WHEN `record intent` runs
- THEN it MUST be refused with `cite-unresolved`, naming the manifest
- AND a cite of `src/store.js:1` MUST open the change, and `check` MUST refuse
  it with `cite-outside-plan` until `ospec signals --path src/store.js`
  declares the file or the diff touches it

#### Scenario: A feature asks at least one category

- GIVEN a feature whose seven categories each cite a distinct existing line or
  fragment of `--request`
- WHEN `record intent` runs
- THEN it MUST be refused with `facts-undeclared` and the command
- AND the same coverage with one category as a concrete `--open-fact` MUST open
  the change with `open-facts` open

#### Scenario: A project without a UI covers five categories

- GIVEN a project with `src/tasks.js` and no UI file
- WHEN `next` runs before any change
- THEN its `feature` template MUST ask `inputs`, `uniqueness`, `persistence`,
  `copy` and `errors`, and name `url-state` and `accessibility` as left out
- AND a `record intent` refused for a question without its category MUST
  print that template, the five categories asked MUST open the change, and a
  `--path src/badge.tsx` MUST ask all seven

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

### Requirement: Read-Only Doctor {#REQ-idd-019}

`ospec doctor` MUST diagnose the installed hosts and the project without
writing anything: no file, no lock, no state recovery and no mutating host
command. The one exception is `--repair` (E1.46), which MUST only move an
unreadable IDD state aside, as the `idd-change` check says. It MUST report every check it runs with a `status` of `ok`, `info`,
`warn` or `error`, its `scope` (`runtime`, `checkout`, `project` or a host
target) and, for `warn` and `error`, the `cause` and the `action` that fixes it.
It MUST exit with 1 when any check is `error` and with 0 otherwise; warnings
never change the exit code. `--json` MUST print the result. Without
`--target`, a host with no installation detected MUST be skipped; with
`--target <host>`, only that host is checked and a missing installation MUST be
an `error`. The hosts are the seven targets: `claude`, `codex`, `cursor`,
`antigravity`, `opencode`, `github-copilot` and `vscode`.

The checks MUST cover at least:

- `runtime`: where the running CLI lives and its version.
- `checkout`, only when the project is the ospec-workflow source: `dist-drift`
  when the built plugin's version differs from `package.json`, `install-drift`
  when an installed host's version differs, and `git-hooks` when the
  repository's commit hooks are not installed.
- `project`: `idd-config` (`error` when `idd/config.yaml` is invalid), `mode`,
  `idd-checks` (`warn` when configuration is valid or absent and at least one
  valid open IDD change has no declared checks; action MUST name `checks:` in
  `idd/config.yaml`, require explicit approval and include a candidate when
  known; no warning for only archived or closed changes),
  `sdd-package` (`error` when `mode: sdd` and an installed host lacks the SDD
  package, `warn` when `openspec/changes/` holds a change it cannot continue),
  `idd-change` for every change under `idd/` (`warn` with
  `ospec close --change <id>` for a closed change still outside the archive,
  `warn` with `ospec status` for an interrupted write that left only
  `state.yaml.bak`, `error` for an unreadable state, with
  `ospec doctor --repair` and the version-control restore as the action,
  `info` with `ospec next --change <id>` for an open change), `sdd-change` for every change
  in `openspec/changes/` (`info` with `/sdd-continue <name>`),
  `strict-tdd-hook` (`warn` when the installed pre-commit hook's active mode
  and the other Strict TDD source disagree: IDD follows `strict_tdd`, and
  `mode: sdd` or a missing `idd/config.yaml` follows `testing.tdd_mode`),
  `session-dir` (`warn` when `.ospec/` exists and git tracks files under it,
  with `git rm -r --cached .ospec`, or does not ignore `.ospec/session/latest.md`;
  the hooks make the folder ignore itself, REQ-hooks-028) and
  `hook-guards` (`warn` naming every `DISABLE_*` guard set to `true`).
- `claude`: `plugin` (`error` when an installation's directory or manifest is
  missing, `warn` when several installations exist), `hooks` (`error` when
  `hooks/hooks.json` or its launcher is missing, `info` when no native binary
  ships for the platform), `hook-responds` (only when `hooks` found the
  launcher: it runs the installed launcher's `pre-tool-use` on a harmless
  `Read` from the system temporary directory, with a 5 s timeout, and is
  `error` when it times out, exits non-zero or reports `[ospec error]`, since
  a failed child still exits 0 with a fail-closed `ask`), `output-redaction`
  (only when the `PreToolUse` command passes `--output-redaction`: `warn` when
  `claude --version` is older than 2.1.121, the first version that applies
  `updatedToolOutput` to every tool, or cannot be read), `router` (`warn`
  when the block is missing from `~/.claude/CLAUDE.md` or differs from the
  installed plugin's router),
  `router-duplicate` (`warn` when text outside the block loads ospec skills),
  `budget` (`warn` when the router block exceeds the 4 KB always-on budget of
  E0.4) and `engram` (read-only Engram detection; `info` when the binary is
  absent, because Engram is optional).
- `codex`, `cursor`, `antigravity`, `opencode` and `github-copilot`, each found
  by the `.ospec-workflow-install.json` its global installer writes (Codex
  under `CODEX_HOME` when set): `install` (`error` when the manifest is not
  readable or records no version or `0.0.0`, which only a stub install
  writes), `runtime` (`error` when the installed `scripts/ospec.js` is missing,
  or the shim beside it that the protocol runs, `bin/ospec.cmd` on Windows and
  elsewhere `bin/ospec`, which is also `error` without its execute bit, E1.45),
  `markers` (`error` naming the file when an installed skill or agent still
  carries `__OSPEC_RUNTIME_DIR__`, `__OSPEC_SHARED_DIR__` or `{{ospec-cli}}`),
  `router` (`warn` when the router file or the Codex `AGENTS.md` block is
  missing, when that `AGENTS.md` still holds the pre-E0.4 orchestrator, or when
  `opencode.json` does not list `instructions/*.md`), `budget` (as for
  `claude`), `hooks` (`error` when the host's hook file is missing) and
  `engram` (as for `claude`, with that host's `engram setup` action).
- `vscode`, found by the `ospec-workflow` plugins named in
  `chat.pluginLocations` of the user settings of VS Code and VS Code Insiders,
  read as an array or as a `{ path: enabled }` map: `plugin-locations`
  (`error` for an entry that loads the ospec-workflow source checkout or names
  a missing path, `warn` when several ospec-workflow builds are registered),
  `agent-files` (`warn` when `chat.agentFilesLocations` names a directory inside
  the plugin) and, for the first registered build, `runtime`, `markers`,
  `router`, `budget`, `hooks` and `engram` as above.
- With the checkout, `install-drift` covers every installed host, and the
  VS Code build's version counts as its installation.
- `project` also reports `codex-repo` when the project has a repository Codex
  install (`install:codex -- <repo>`): `warn` when neither the repository nor a
  global Codex install provides the IDD protocol, `info` when the global one
  does. It reports `opencode-plugin` when the project has
  `.opencode/plugins/ospec.js`: `warn` when a global
  `~/.config/opencode/plugins/ospec.js` shadows it (OpenCode loads one plugin
  per id), even when the files are identical, and `ok` otherwise.
  `sdd-package` names every installed host without the SDD package.

#### Scenario: Doctor writes nothing

- GIVEN a project with an interrupted `record` that left only `state.yaml.bak`
- WHEN `ospec doctor` runs
- THEN it MUST report `idd-change` as `warn` with `ospec status` as the action
- AND the project tree MUST be byte-identical afterwards

#### Scenario: Repair moves an unreadable state aside

- GIVEN `idd/broken/state.yaml` that is not JSON, beside its `change.md`
- WHEN `ospec doctor` runs
- THEN `idd-change` MUST be `error` with `ospec doctor --repair` in its action,
  and the file MUST stay where it is
- WHEN `ospec doctor --repair` runs
- THEN the file MUST become `idd/broken/state.yaml.corrupt-<UTC time>`, with a
  `-<n>` suffix rather than over an earlier copy, `change.md` MUST stay, and
  `idd-change` MUST be `warn` naming the copy, with `ospec status` as the
  action when `state.yaml.bak` exists (reading the change restores it) and
  otherwise `ospec record intent --change broken` or
  `git checkout -- idd/broken/state.yaml`
- AND the exit code MUST be 0
- AND only `idd/<id>/state.yaml` of a change outside `idd/archive/`, a regular
  file in a real directory, that `idd-change` reports as `error` (not JSON,
  invalid against the schema, or declaring another change) MUST move: a
  symlink stays `error`, and nothing else in the project changes

#### Scenario: An outdated installation is a warning

- GIVEN the ospec-workflow checkout at one version and a Claude installation at
  an older one
- WHEN `ospec doctor` runs from the checkout
- THEN `install-drift` MUST be `warn` with `npm run setup:claude` as the action
- AND the exit code MUST be 0

#### Scenario: A host installed before the IDD runtime fails

- GIVEN a Cursor installation whose manifest exists but has no `scripts/ospec.js`
- WHEN `ospec doctor` runs
- THEN `cursor/runtime` MUST be `error` with `npm run setup:cursor` as the action
- AND the exit code MUST be 1

#### Scenario: VS Code loads the source checkout

- GIVEN `chat.pluginLocations` naming the ospec-workflow source checkout and its
  `dist/vscode` build
- WHEN `ospec doctor` runs
- THEN `vscode/plugin-locations` MUST be `error` for the checkout, with
  `npm run setup:vscode` in the action
- AND the build MUST still be checked

#### Scenario: SDD mode without the SDD package fails

- GIVEN `mode: sdd` in `idd/config.yaml` and a Claude installation without the
  SDD package
- WHEN `ospec doctor` runs
- THEN `sdd-package` MUST be `error` naming `--with-sdd`
- AND the exit code MUST be 1

#### Scenario: A broken Claude hook fails even though it exits 0

- GIVEN a Claude installation whose `pre-tool-use` child exits with code 3
- WHEN `ospec doctor` runs
- THEN `claude/hook-responds` MUST be `error` naming `exit 3`, with a cause and
  an action
- AND the project and home trees MUST be byte-identical afterwards

#### Scenario: Output redaction on an old Claude Code is a warning

- GIVEN a Claude installation whose `PreToolUse` passes `--output-redaction`
  and `claude --version` reporting 2.1.13
- WHEN `ospec doctor` runs
- THEN `claude/output-redaction` MUST be `warn` naming 2.1.121
- AND without `--output-redaction` the check MUST NOT be reported

### Requirement: Architecture Impact Declaration {#REQ-idd-020}

A change MUST declare the architecture it touches: `ospec signals --adr <id>`
names an ADR under `docs/architecture/decisions/` by its four-digit id, and
`--quality <id>` a quality scenario of `docs/architecture/knowledge-map.yaml`.
Either MUST activate `adr-or-quality-attribute` with a reason naming them and
record each reference in `impacts` without an impact; a reference that does
not exist on disk MUST be refused, and a new reference MUST reopen a satisfied
`adr-impact-declaration`. The components a change touches also activate the
signal (REQ-idd-021).

`ospec record impact --adr <id>|--quality <id> --impact <value> --reason <text>`
MUST declare the impact on one declared reference: `none`, `conforms`,
`amends`, `supersedes` or `contradicts`. An impact MUST be declared once; a
different value or reason for it MUST be refused. `amends`, `supersedes` and
`contradicts` MUST open `adr-amend-or-contradict`, or add their reason to it
while it is open; once the gate is resolved, a new one MUST be refused. An ADR
amended or superseded MUST name, with `--record <path>`, the new ADR under
`docs/architecture/decisions/` that does it, in the same call or a later one;
an accepted ADR is never rewritten.

`ospec check` MUST satisfy `adr-impact-declaration` when every declared
reference has its impact, the user answered `adr-amend-or-contradict` for
every gated impact, and each new ADR exists, passes the decision-record lint
with its evidence resolved in the project, is not the ADR it changes and cites
that ADR's id. Otherwise the obligation MUST return to `pending` with the
reason. A development decision MUST stay in the change's living document and
MUST NOT become an ADR.

`next` MUST add the non-blocking suggestion `adr-promotion` while the change has
`public-contract`, `persistent-data` or `security-boundary` active and declares
no ADR or quality scenario. It MUST NOT open a gate, add an obligation or
write a file.

#### Scenario: An internal library change proposes no ADR

- GIVEN the `internal-feature` fixture, which touches no boundary and declares
  no ADR
- WHEN its signals are derived and `next` runs
- THEN `adr-or-quality-attribute` MUST NOT be active and `next` MUST carry no
  suggestion

#### Scenario: Asynchronous messaging between modules amends the integration ADR

- GIVEN a change that introduces asynchronous messaging between two modules
  and declares `--adr 0002`, the ADR that fixes their synchronous integration
- WHEN it records `--impact amends` with its reason
- THEN `adr-amend-or-contradict` MUST be open with a reason naming ADR 0002
- AND `adr-impact-declaration` MUST stay `pending` until the user answers and
  a new ADR citing 0002 passes the lint

#### Scenario: A conforming change settles at check

- GIVEN a change that declares `--adr 0004` and records `--impact conforms`
- WHEN `ospec check` runs
- THEN `adr-impact-declaration` MUST be satisfied with no gate opened

#### Scenario: A boundary without a declared ADR suggests one

- GIVEN a change whose planned paths touch a public contract and that declares
  no ADR
- WHEN `next` runs
- THEN it MUST carry the suggestion `adr-promotion` naming the contract
- AND the next step MUST be the same as without the suggestion

### Requirement: Knowledge By Reference {#REQ-idd-021}

A component of `ospec-component-map/v2` (REQ-component-map-004) MAY name the
paths it owns as globs and the ids of its knowledge: ADRs, quality scenarios,
glossary terms and knowledge-map slots as constraints. A change touches a
component when a path of its declared plan or of its diff matches one of the
component's globs. A change MUST receive only the references of the components
it touches, by id and never as document content, each with its components and
its currency:

| Kind | `current` | `stale` | `absent` |
| --- | --- | --- | --- |
| ADR | under `docs/architecture/decisions/` | `superseded`, or an `Evidence` reference that no longer resolves | no ADR with that id |
| Quality scenario | in the knowledge map | — | not in the knowledge map |
| Term | a heading or the first cell of a table row in `docs/product/glossary.md` | — | not there, or no glossary |
| Constraint | slot `confirmed` or `n/a` | slot `assumed` | slot `unknown`, `deferred` or missing |

`next` MUST resolve the references of an open change from disk each time it
runs, from its declared plan and its current diff, and return them as
`references` (`kind`, `id`, `status`, `components`, and `path` and `reason`
when known) with one entry in `warnings` for each stale or absent one. A diff
that cannot be read MUST narrow the paths to the plan with a warning.

`ospec signals` (from the plan) and `ospec check` (from the diff) MUST activate
`adr-or-quality-attribute` from the current ADRs and quality scenarios of the
touched components, with a reason naming the components, and record them in
`impacts` as declared references of REQ-idd-020. A stale or absent reference
MUST NOT activate the signal or enter `impacts`: it is a warning, never the
truth the change is held to.

A project without a component map, or with a v1 map, MUST get no references
and no warnings. A component map or knowledge map that does not parse or does
not validate MUST be a warning in `next`, `signals` and `check` and give no
references; it MUST NOT stop them.

#### Scenario: A change receives only the references of the component it touches

- GIVEN a v2 map whose `orders` component owns `src/orders/**` and names ADR
  0002, ADR 0004 (superseded), a quality scenario and a term with no glossary
- WHEN a change declares `src/orders/place.js` and `next` runs
- THEN `references` MUST list ADR 0002 and the scenario as `current`, ADR 0004
  as `stale` and the term as `absent`, all from `orders`
- AND `warnings` MUST name ADR 0004 and the term
- AND `impacts` MUST hold ADR 0002 and the scenario only

#### Scenario: The diff adds the references of another component

- GIVEN that change, with a new file under the `billing` component
- WHEN `ospec check` runs
- THEN `impacts` MUST add billing's current ADR
- AND an untouched component MUST give no reference

#### Scenario: A broken map warns without blocking

- GIVEN a component map that is not JSON text
- WHEN `signals`, `check` and `next` run
- THEN each MUST succeed with a warning naming the map and no references

### Requirement: Fitness Functions In Check {#REQ-idd-022}

The fitness function of an ADR or a quality scenario MAY declare executable
checks: each `` - Check: `<command>` `` line of an ADR's `Fitness function`
section (REQ-decision-records-008) and each entry of `fitness.checks` of a
quality scenario in `ospec-knowledge-map/v2` (REQ-knowledge-map-005). A
fitness function without one is a manual item: the ADR's `Fitness function`
prose or the scenario's `fitness.description`.

A change MUST hold only the fitness functions of the references in its
`impacts` (REQ-idd-020, REQ-idd-021), read from the change's base commit and
never from the working tree, so the change cannot weaken or remove the check
that guards it. A reference the base does not hold, a superseded ADR, a
scenario without `fitness`, and a reference the change `amends`, `supersedes`
or `contradicts` once the user resolved `adr-amend-or-contradict` MUST bring
none.

While `adr-impact-declaration` is active, `ospec check` MUST run every
executable check after the declared checks, in `impacts` order, through the
shell in the project root, and record each as a run with purpose `fitness` and
the `ref` it checks. `adr-impact-declaration` MUST then be satisfied only when,
besides REQ-idd-020, every fitness run of that check passed on the current
tree, and its evidence MUST name those runs and the tree. A failing run MUST
return it to `pending` with a reason that names the ADR or scenario, the
command and the exit code, so `ospec close` is refused with it. A base that
cannot be read MUST be a warning and run no fitness check.

A manual item MUST NOT block the close (ADR-0005: only observed evidence
satisfies an obligation). `next` and `check` MUST list it in `fitness.manual`
with its reference, its text and its recorded evidence, if any, and list the
executable checks in `fitness.checks`. `ospec record fitness --change <id>
--adr <id>|--quality <id> --evidence <text>` MUST record the manual evidence
of a manual item of the change in `attestations`, once; a different evidence
for it, or a reference that is not a manual item of the change, MUST be
refused.

#### Scenario: A boundary violation declared in an ADR blocks the close

- GIVEN ADR 0006 whose `Fitness function` declares
  `` - Check: `node --test boundary.test.js` `` at the change's base
- AND a change that touches its component and records `--impact conforms`
- WHEN the change imports across that boundary and `ospec check` runs
- THEN the fitness run MUST fail and `adr-impact-declaration` MUST stay
  `pending` with a reason naming ADR 0006
- AND `ospec close` MUST be refused naming that obligation

#### Scenario: The change cannot weaken its own check

- GIVEN that ADR at the base
- WHEN the change deletes the `Check:` line in its working tree
- THEN `ospec check` MUST still run the check of the base

#### Scenario: A prose fitness function is a checklist item

- GIVEN an ADR whose `Fitness function` has no `Check:` line
- WHEN `ospec check` runs
- THEN `fitness.manual` MUST list it and `adr-impact-declaration` MUST NOT wait
  for it
- AND `ospec record fitness` MUST keep its evidence in `attestations`

### Requirement: Team Profile Defaults {#REQ-idd-023}

A project MAY declare its team profile, which replaces the SDD scale preset
(`solo | team | enterprise`). Each mode keeps it in its own configuration
(ADR 0011): IDD in the `team` section of `idd/config.yaml`, SDD in the
top-level `team:` of `openspec/config.yaml`. The profile MUST hold `size`
(`solo`, `small` or `multi-team`) and MAY hold `experience` (`junior`,
`mixed` or `senior`); another key or value MUST be refused, with
`config-invalid` in `idd/config.yaml` and `team-invalid` in
`openspec/config.yaml`. The defaults MUST follow from the profile alone:

| `size` | Delivery strategy | Branching | Changelog | Release | Quality review (SDD 4R) | Traceability | Strict TDD | SDD `tdd_mode` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `solo` | `single-pr` | `serial` | `CHANGELOG.md` | `per-change` | off | `advisory` | `false` | `standard` |
| `small` | `ask-on-risk` | `parallel` | `CHANGELOG.md` | `batched` | on | `advisory` | `true` | `focused` |
| `multi-team` | `auto-chain` | `parallel` | `CHANGELOG.md` | `batched` | on | `required` | `true` | `strict` |

Every delivery strategy keeps the 400-line review budget. `experience`
decides mentorship (`junior` → `mentor`, `mixed` → `balanced`, `senior` →
`expert`; absent → `balanced`), and `junior` MUST turn Strict TDD on
(`tdd_mode: strict`) whatever the size. The IDD trust review MUST stay bound
to `security-boundary` (REQ-idd-016) for every profile. An explicit key MUST
win over the profile: `strict_tdd` in `idd/config.yaml`, and in SDD the blocks
`sdd-init` materialized and the user later edited. Without a profile every
default MUST stay as it was before this requirement.

The branching says how a change reaches the default branch: `serial` keeps one
pull request in flight, and `parallel` lets several branches integrate the
default branch before each merge. `delivery.branching` in `idd/config.yaml`
(`serial` or `parallel`; another key under `delivery` or another value MUST be
refused with `config-invalid`) MUST win over the profile, and without either
the branching MUST be `serial` with source `recommended`. SDD MUST NOT read
`delivery`. The resolved branching MUST carry its `source` (`idd/config.yaml`,
`team profile` or `recommended`), its `reasons` (why it fits, the source first)
and `how` (the rules the agent follows: none rewrites pushed history, and
every value deletes the branch after its merge). It MUST be guidance only: no
git or pull request state is read. The `changelog` and `release` of
REQ-idd-025 resolve the same way, with the same `source`, `reasons` and `how`:
`delivery.changelog` and `delivery.release` win over the profile, and without
either `CHANGELOG.md` and `per-change` are recommended. Only a declared value
makes `ospec close` act; the profile and the recommendation only advise.

`ospec team [--mode <idd|sdd>] [--json]` MUST be read-only and MUST return
the mode, the profile, its `source`, its `defaults`, the `branching`, the
`changelog` and the `release`. Without `--mode` the
mode is the active one: IDD when `idd/config.yaml` exists and its `mode` is
not `sdd`, else SDD; `--mode` reads that mode's declaration whatever mode is
active, and another value is a usage error. IDD MUST read only
`idd/config.yaml`. SDD MUST read only `openspec/config.yaml`: its `team:`
first, else a legacy `scale:` (`solo` → `solo`, `team` → `small`,
`enterprise` → `multi-team`, with no experience), else no profile. `ospec
next` MUST return `team` (the profile, its source, the delivery strategy and
the mentorship) for an IDD change when `idd/config.yaml` declares a profile,
and MUST NOT let an unreadable configuration change its next step. For an IDD
change whose next step is `declare-plan` or `close`, where the branching
decides something, `ospec next` MUST return `delivery` (the `branching`, its
`source`, `reasons` and `how`, plus the resolved `changelog` and `release`),
and with source `recommended` also the suggestion `branching-undeclared`, which
is never a step: the agent proposes the value to the user and writes
`delivery.branching` only after approval. While `delivery.changelog` or
`delivery.release` is not declared, with a profile or without one, it MUST add
the suggestion `changelog-undeclared` or `release-undeclared` in the same way.

#### Scenario: The branching is suggested, never imposed

- GIVEN an `idd/config.yaml` with checks and without `team` or `delivery`
- WHEN `ospec next` reaches `declare-plan` for a change
- THEN `delivery` MUST be `serial` with source `recommended`, its reasons and
  its rules
- AND the suggestion `branching-undeclared` MUST be present while the next
  step stays `declare-plan`
- AND while the change is built `ospec next` MUST NOT return `delivery`

#### Scenario: An explicit branching wins over the profile

- GIVEN `team: { size: solo }` and `delivery: { branching: parallel }`
- WHEN `ospec team` runs
- THEN the branching MUST be `parallel` with source `idd/config.yaml`
- AND `delivery: { branching: rebase }` MUST be refused with `config-invalid`

#### Scenario: Two teams get different defaults without a question

- GIVEN one project whose `idd/config.yaml` declares `team: { size: solo,
  experience: senior }` and another with `team: { size: multi-team,
  experience: junior }`
- WHEN `ospec team` and `ospec next` run in each
- THEN the first MUST get `single-pr`, no Strict TDD and `expert`, and the
  second `auto-chain`, `tdd-red-green` for a feature and `mentor`
- AND neither MUST open a gate or ask for the scale

#### Scenario: Each mode reads only its own profile

- GIVEN `openspec/config.yaml` with `team: { size: small }` and an
  `idd/config.yaml` without `team` and without `mode: sdd`
- WHEN `ospec team` runs
- THEN the profile MUST be absent and the defaults MUST be unchanged

#### Scenario: A legacy scale still decides the SDD defaults

- GIVEN `mode: sdd` and `openspec/config.yaml` with `scale: enterprise`
- WHEN `ospec team` runs
- THEN the profile MUST be `size: multi-team` with source
  `openspec/config.yaml scale`

### Requirement: Knowledge Records At Close {#REQ-idd-024}

`ospec close` MUST return `records`: the knowledge of the closed change that
an agent MAY keep in a cross-session memory, derived from the archive alone.
There MUST be one record per top-level bullet of the `Decisions` section of
`change.md` (`kind: dc`, topic `knowledge/dc/<change>/<n>` numbered from 1),
one per declared impact that departs from its reference, `amends`,
`supersedes` or `contradicts` (`kind: impact`, topic
`knowledge/impact/<change>/<kind>-<id>`) and one per new ADR an impact attaches
with `--record` (`kind: adr`, topic `knowledge/adr/<NNNN>`). An impact `none`
or `conforms` MUST NOT be a record: the archived `state.yaml` keeps it. Each
record MUST
carry its `title` (the bold label of the bullet, else its first sentence, at
most 80 characters), its `summary`, its provenance (`source`, the repository
path it comes from, `change` and the close `date`) and its stable `topic`, so
saving it again updates the same memory entry. Closing an archived change
again MUST return the same records. The text output of `close` MUST list each
record as `- <topic> | <title>` under a line that gives their number and the
literal `ospec close --change <id> --json` that returns their summary and
provenance.

Recording a resolved intent, including a repeated one, a raised kind and the
resolution of `ambiguous-intent`, MUST also return `memory_query`, a hint for
the agent's memory recall that MUST NOT be stored and MUST NOT block anything:
the ids of the ADRs (`ADR-<NNNN>`) and components that the paths the change
already names touch (its plan, its diff and the path cites of a feature), then
the distinct words of `--request`, or of `--summary` without one, lower-cased,
of four or more characters and without English or Spanish function words, at
most 12 terms. The text output MUST show it as `memory query: <terms>`. An
ambiguous intent, and a query without terms, MUST NOT return it. The CLI MUST
NOT read, write or require a memory, and a change MUST close the same whether
or not an agent keeps its records (ADR 0006).

#### Scenario: A decision of the change becomes a record

- GIVEN a change whose `change.md` decides `- **Hourly rotation:** tokens
  rotate every hour.`
- WHEN `ospec close --json` archives it
- THEN `records` MUST hold one `dc` record with the topic
  `knowledge/dc/<change>/1`, the title `Hourly rotation` and the source
  `idd/archive/<YYYY-MM-DD>-<change>/change.md`
- AND `ospec close` without `--json` MUST print
  `- knowledge/dc/<change>/1 | Hourly rotation` and
  `ospec close --change <change> --json`

#### Scenario: Only impacts that say something are records

- GIVEN a change that declares `none` on one ADR, `conforms` on a quality
  scenario and `amends` on another ADR with a new ADR attached
- WHEN it closes
- THEN `records` MUST hold the `amends` impact and the new ADR, and nothing
  for the `none` or `conforms` impacts

#### Scenario: Recording an intent returns the memory query

- GIVEN a component map that gives the component `orders` the paths
  `src/orders/**` and the ADR `0002`, and a feature whose cite names
  `src/orders/place.js:1`
- WHEN `record intent` opens it with the request `The request fixes every
  behavior.`
- THEN `memory_query` MUST be `ADR-0002 orders request fixes behavior`, the
  text output MUST print it as `memory query: ADR-0002 orders request fixes
  behavior`, and `state.yaml` MUST NOT hold it
- AND an ambiguous intent MUST NOT return it

### Requirement: Changelog Entry And Release At Close {#REQ-idd-025}

`delivery.changelog` in `idd/config.yaml` MUST be `none` or a relative path
with `/` separators and no empty, `.` or `..` segment, and `delivery.release`
MUST be `per-change`, `batched` or `none`; another value MUST be refused with
`config-invalid`. When `delivery.changelog` declares a path, `ospec close`
MUST, after every refusal of REQ-idd-017 and before it records
`status: closed`, add the change's entry to that file in the Keep a Changelog
format:
under `## [Unreleased]`, in the section its kind gives (`feature` → `Added`,
`bug` → `Fixed`, `refactor` and `docs` → `Changed`), as the line `- <summary>
(<change-id>)` with the summary on one line. A missing section MUST be added
in the order `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`,
`Security`; a missing `## [Unreleased]` MUST go before the latest version, and
a missing file MUST be created with the Keep a Changelog header. The file's
line endings MUST be kept, and a line the file already holds MUST NOT be added
again. An unreadable `idd/config.yaml` MUST refuse that close before anything
is written. The result MUST return `changelog`: its `path`, `section`,
`entry` and whether this close `written` it; closing an archived change again
MUST return it with `written: false` and write nothing.

When `delivery.release` declares `per-change`, the result MUST also return
`release`, the proposal the changelog gives: `version`, the latest version
under `## [Unreleased]` raised by a minor when `[Unreleased]` holds an `Added`
section and by a patch otherwise; `bump`; `tag` (`v<version>`); and `notes`,
the contents of `[Unreleased]`. A major MUST never be proposed, and without a
plain `MAJOR.MINOR.PATCH` previous version, `version` and `tag` MUST be null.
Without a declared changelog every field MUST be null, and with an empty
`[Unreleased]` there is no `release`. With `batched` or `none`, close MUST NOT
propose one. The CLI MUST NOT change versions, tags or releases: the agent
proposes the release to the user and cuts it only with an explicit OK. Without
`delivery.changelog` or `delivery.release` declared, close MUST behave as
before this requirement. SDD MUST NOT read them (ADR 0011).

#### Scenario: A closed change leaves its entry and proposes the release

- GIVEN `delivery: { changelog: CHANGELOG.md, release: per-change }` and a
  `CHANGELOG.md` whose latest version is `1.4.2` under an empty
  `## [Unreleased]`
- WHEN a `docs` change with the summary `Fix a typo.` closes
- THEN `CHANGELOG.md` MUST hold `- Fix a typo. (<change-id>)` under
  `## [Unreleased]` and `### Changed`
- AND `release` MUST propose `1.4.3`, the tag `v1.4.3` and that section as
  notes
- AND closing again MUST NOT add the line twice

#### Scenario: Nothing is written until the changelog is declared

- GIVEN an `idd/config.yaml` with a team profile and no `delivery.changelog`
- WHEN a change closes
- THEN no changelog MUST be written and the result MUST hold neither
  `changelog` nor `release`
- AND `ospec next` MUST have suggested `changelog-undeclared` at
  `declare-plan` and at `close`

### Requirement: On-Demand Progress Snapshot {#REQ-idd-026}

`ospec snapshot` MUST export the progress of the project as a progress
snapshot v1, `{ "schemaVersion": 1, "phases": [...] }`, each phase holding
only `id`, `title` and `status` (`pending`, `in-progress` or `done`), with
`schemas/progress-snapshot/v1.schema.json` as its schema, unless
`--schema-version 2`, `3` or `4` asks for the v2, the v3 or the v4 below;
`--schema-version` takes `1`, the default, `2`, `3` or `4`. It MUST run only
when invoked: no IDD or SDD step, hook, check, gate or doctor check runs it,
and it writes nothing but the snapshot. It needs no git work tree.

The phases MUST come from the roadmap, `docs/roadmap.md` unless
`--roadmap <path>` names another, in the order the file lists them. Each body
row of a Markdown table outside code fences whose first cell, once clean,
reads `<ID>. <title>` is a phase: its id is `<ID>` in lower case and its title
the rest of the cell. A clean cell loses its inline Markdown (emphasis,
strikethrough and code spans keep their content, links and images their text,
backslash escapes their character), collapses its whitespace, is trimmed and
is NFC. A table without such a row is not a phase table. A phase table row
that does not read so, a phase id over 64 characters, a title over 200
characters or with a control character, and two phases with the same link
key MUST be refused with `roadmap-invalid`, naming the file and the line. A
roadmap without phases MUST be refused with `roadmap-unrecognized`, and a
missing one with `roadmap-missing`. A title is never cut.

A phase's link key is its id without dots. A change belongs to the phase
whose link key equals the change id or prefixes it followed by `-`; when
several do, the longest key wins. Changes MUST be read by directory name
only, never by their state: active ones under `idd/` and `openspec/changes/`,
archived ones named `<YYYY-MM-DD>-<id>` under `idd/archive/` and
`openspec/changes/archive/`. A phase with an active change is `in-progress`,
else one with an archived change is `done`, else it is `pending`.

The snapshot MUST meet its schema and the rules the schema does not express:
phase ids are unique, and titles are trimmed, NFC and free of control
characters (`snapshot-invalid`); it holds at most 100 phases and 64 KiB of
UTF-8 (`snapshot-limit`). Without `--out`, stdout MUST hold the snapshot
alone, with `--json` too. With `--out <file>` the snapshot MUST be written
whole to that file, and stdout reports the roadmap, the phases and the bytes
written, as JSON with `--json`. A refusal MUST exit 1 and write nothing;
`--json` only changes how it is reported. A change that a valid snapshot of
today would not meet is a new `schemaVersion`. The snapshot declares only its
version: its format is closed and its name is the `$id` of its schema
(ADR 0009). Publishing it is up to the project.

The progress snapshot v2 (E5.11), with
`schemas/progress-snapshot/v2.schema.json` as its schema, MUST hold every
phase of the v1, with the same `id`, `status` and order, plus the groups of
the roadmap and the client texts of a progress file. A group is a `##`
heading of the roadmap with a phase table below it, before the next `#` or
`##` heading, in reading order, and each of its phases names it in `group`. A
group heading that reads `<ID>. <title>` once clean gives the id `<ID>` in
lower case and that title; any other gives its clean text as the title and
an id derived from it: in lower case, without diacritics, each run of
characters outside `a-z` and `0-9` replaced by `-`, and without a leading or
trailing `-`. A roadmap without groups gives a v2 without `groups`. Phases
both inside and outside groups, a derived id that is empty or over 64
characters, a group title over 200 characters or with a control character,
and two groups with the same id MUST be refused with `roadmap-invalid`,
naming the file and the line. The v1 ignores the headings.

The progress file is `docs/progress.md` unless `--progress <path>` names
another, and `--progress` without `--schema-version 2`, `3` or `4` is a usage
error.
Without the file the v2 holds only groups and phases; a `--progress` path
that does not exist MUST be refused with `progress-missing`. The file is
Markdown written for the client in the language of the project, with fixed
English keywords. What comes before its first `##` or `###` heading is free
and ignored. After it:

- `## <ID>. <title>` names a group of the roadmap: its title, when given,
  replaces the roadmap's, and its paragraph is the group's `summary`.
- `### <ID>. <title>`, under the `##` of its group or, in a roadmap without
  groups, under none, names a phase of the roadmap. Its title, when given,
  replaces the roadmap's; the items `- short: <text>`, `- start: <date>`,
  `- end: <date>` and `- preview: <url>` give its `shortTitle`, `start`, `end`
  and `previewUrl`; its paragraph is its `summary`; `#### Tasks` holds its
  `tasks`, one `- [ ] <id>: <title>` or `- [x] <id>: <title>` item each; and
  `#### Outcomes` holds its `outcomes`, one `- <text>` item each.
- `## Requests` holds the `requests`, one `### <id>. <title>` each, with the
  items `- phase: <phase id>` and `- due: <date>` and a paragraph for its
  `body`.

Ids name the roadmap's exactly and compare in lower case; a task or request
id is written by hand and taken in lower case. A text is cleaned as a phase
title is, and the lines of a paragraph join into one. A date is `YYYY-MM-DD`
and exists in the calendar, and `start` is not after `end`. A preview is a
bare `https://` URL with a host and no user or password, without whitespace
or control characters, at most 2048 characters, emitted as written. A group
or phase the roadmap lacks, a phase under the heading of another group, a
request whose phase the roadmap lacks, a done phase with a task left
unchecked, an id, text, list, date or URL out of its format, an unknown or
repeated key, section or id, a second paragraph and any other line out of
this syntax MUST be refused with `progress-invalid`, naming the file and the
line of the first one. Nothing is ever cut.

The v2 MUST meet its schema and the rules the schema does not express: ids
are unique among the groups, the phases, the requests and the tasks of a
phase; every phase names a group when there are groups, the phases of a
group are consecutive and no group is empty; the phase of a request exists;
a done phase has every task done; dates exist and `start` is not after
`end`; texts are trimmed, NFC and free of control characters; and
`previewUrl` holds no user or password (`snapshot-invalid`). It holds at most
20 groups, 100 phases and 64 KiB of UTF-8 (`snapshot-limit`). Output,
`--out` and refusals work as for the v1; the `--out` report of a v2 also
names its schema version and the progress file it read, if any.

The progress snapshot v3 (E5.12), with
`schemas/progress-snapshot/v3.schema.json` as its schema, MUST hold the v2 of
the same project, with the same groups, phases, texts and requests, plus the
delivery stage of each `done` phase that has one, `release`:
`{ "stage": "testing" }`, or
`{ "stage": "production", "version": "<x.y.z>", "date": "<YYYY-MM-DD>" }`. A
phase that is not `done` never holds it. The stage comes from the changelog
that `delivery.changelog` declares in `idd/config.yaml` (REQ-idd-023): without
that declaration, with `none` or without the file, no phase holds a
`release` and nothing is refused. A configuration that does not parse MUST be
refused with `config-invalid`. The v1 and the v2 read neither file.

An entry of the changelog is a `-`, `*` or `+` list item at the first column,
outside code fences, with the indented lines that follow it joined, whose
text ends in `(<change-id>)` followed only by spaces, as `ospec close` writes
it (REQ-idd-025). Only the entries of the archived changes of `done` phases
count, each under the `##` heading above it. `## [Unreleased]`, in any case,
and a version with a pre-release suffix give `testing`; a version `x.y.z`
gives `production` with that version and the date of its heading. A version
heading reads as the release proposal of `ospec close` reads it, with the
brackets and a leading `v` optional, followed by nothing or by
` - YYYY-MM-DD`. The same entry repeated under one heading counts once. A
change without an entry does not count, and a `done` phase whose changes have
none holds no `release`. With several, the least advanced decides: one in
`testing` gives `testing`; else the phase is in `production` with the highest
version, by Semantic Versioning precedence, and its date.

Only what decides a stage is checked, so the rest of the changelog may
follow any format. An entry that counts under two headings, before the first
`##` heading or after a `#` one, or under a `##` heading that is neither
`[Unreleased]` nor a version, and a heading holding one whose version has a
leading zero, build metadata, more than 64 characters or the version of
another such heading, whose plain version has no date, whose date does not
exist in the calendar or that holds anything after its date, MUST be refused
with `changelog-invalid`, naming the file and the line of the first one.

The v3 MUST meet its schema and the rules of the v2, plus a `release` only
in a `done` phase, `testing` alone or `production` with a version `x.y.z`
without leading zeros, pre-release or build, of at most 64 characters, and a
date that exists (`snapshot-invalid`). Output, `--out` and refusals work as
for the v2; the `--out` report of a v3 also names the changelog it read, or
null. The snapshot sees a version only once its heading is in the files it
reads: the commit that moves the entries under the version must reach the
branch the snapshot is exported from.

The progress snapshot v4 (E5.13), with
`schemas/progress-snapshot/v4.schema.json` as its schema, MUST hold the v3 of
the same project, with the same groups, phases, texts, requests and
releases, plus the documentation of the project written for the client, each
field only when it has content: `problem`, `objectives` (`title` and
`measure`), `includes`, `excludes` (`title` and `reason`), `deliverables`
(`title` and `phase`, with an optional `summary` and `url`) and `decisions`.
No document is published as it is: every client text comes from the progress
file. The v1, the v2 and the v3 read neither the ADRs nor the `ADRs` column
of the roadmap, and they refuse the new sections of the progress file as
before.

The progress file of the v4 adds these sections, each at most once and in
any order:

- `## Problem` holds one paragraph, the `problem`.
- `## Objectives` and `## Excludes` hold one `### <title>` per objective or
  exclusion, with one paragraph: its `measure` or its `reason`.
- `## Includes` holds one `- <text>` item per include.
- `## Deliverables` holds one `### <title>` per deliverable, with the item
  `- phase: <phase id>`, an optional item `- url: <url>` and an optional
  paragraph, its `summary`.
- `## Decisions` holds one `### NNNN. <title>` or `### NNNN` per ADR, by the
  four digits of its number, with a paragraph, its `reason` for the client,
  or the item `- internal`, which keeps the ADR out of the snapshot.

Texts are cleaned as in the v2, a `url` follows the rules of a preview, and
the lists keep the order of the file. An empty section, a second paragraph,
an element without its measure, reason or phase, a deliverable whose phase
the roadmap lacks, more than 10 objectives, 30 includes, 30 exclusions or 50
deliverables, a text out of its limit, a repeated section, key or decision,
an internal decision with a title or a reason, a decision that names no ADR
or an ADR that is not published, a decision with neither a reason nor
`- internal`, and any other line out of this syntax MUST be refused with
`progress-invalid`, naming the file and the line of the first one.

The decisions come from `docs/architecture/decisions/`. Each
`NNNN-<title>.md` file there is an ADR, whose heading `# NNNN. <title>`
carries the number of its file name, and whose header, before the next
heading, holds `- Status:` and `- Date:`. The status, in any case, is
`inferred`, `proposed`, `accepted`, `superseded by NNNN`, `rejected` or
`deprecated`. Other files are not read, other header lines such as
`- Amends:` change nothing, and without the directory there are no decisions
and nothing is refused. Every `accepted` or `superseded by` ADR that the
progress file does not mark internal is published, in number order, with its
`number`, the client `title` of the progress file or else its own clean
title, its `date`, its `status` (`accepted`, or `superseded`), `supersededBy`
when its substitute is published, its `reason`, and its `phases`: those whose
`ADRs` column names it, in roadmap order and without repeats. The `ADRs`
column is the one of a phase table whose header, once clean, reads `ADRs` in
any case; its cell holds `—`, `-` or nothing, or ADR numbers separated by
commas.

An ADR without its heading, whose heading number differs from its file name
or repeats another's, without a status or with another one, with a repeated
`Status` or `Date`, or whose `superseded by` names no ADR or one whose number
is not greater, and a published ADR without a date, with a date that does
not exist, numbered `0000`, without a decision in the progress file, or
whose own title, without a client title, is out of the limit of a title MUST
be refused with `decisions-invalid`, naming the ADR and the line. An `ADRs`
cell out of its format or naming an ADR that does not exist MUST be refused
with `roadmap-invalid`, naming the line of its row.

The v4 MUST meet its schema and the rules of the v3, plus: the phase of a
deliverable and the phases of a decision exist, the phases of a decision do
not repeat, decision numbers go from 1 to 9999 without repeats, and
`supersededBy` goes only in a superseded decision and names a decision of the
snapshot with a greater number (`snapshot-invalid`). It holds at most 100
decisions (`snapshot-limit`). Output, `--out` and refusals work as for the
v3; the `--out` report of a v4 also names the ADR directory it read, or null.

#### Scenario: Phases take their status from the changes on disk

- GIVEN a `docs/roadmap.md` table whose rows read `P1a. Platform`,
  `P1b. Operator` and `P1b.1. Access revocation`, and another table whose
  row reads `M1. Docs`
- AND the archived changes `idd/archive/2026-01-02-p1a-platform/` and
  `idd/archive/2026-01-03-p1b-operator/`, and the active change
  `idd/p1b1-revocation/`
- WHEN `ospec snapshot` runs
- THEN stdout MUST hold only the snapshot, with `p1a` and `p1b` `done`,
  `p1b.1` `in-progress` and `m1` `pending`, in that order

#### Scenario: An unusable roadmap writes nothing

- GIVEN a roadmap whose phase table repeats the id `A1`
- WHEN `ospec snapshot --out snapshot.json` runs
- THEN it MUST exit 1 with `roadmap-invalid` naming the line of the repeated
  row
- AND `snapshot.json` MUST NOT exist

#### Scenario: The v2 adds groups and client texts

- GIVEN a `docs/roadmap.md` whose `## S1. Base` heading holds a table with
  the rows `S1a. Platform` and `S1b. Access`, and whose `## Milestones`
  heading holds a table with the row `M1. Docs`
- AND the archived change `idd/archive/2026-01-02-s1a-platform/`
- AND a `docs/progress.md` whose `## S1. The base` holds a paragraph, and
  whose `### S1a. The platform` below it holds `- short: Platform` and a
  `#### Tasks` with `- [x] domain: Own domain`
- WHEN `ospec snapshot --schema-version 2` runs
- THEN stdout MUST hold only a v2 whose groups are `s1`, titled `The base`
  with that paragraph as its summary, and `milestones`, titled `Milestones`
- AND whose phases are `s1a` `done` in `s1`, titled `The platform`, with its
  short title and its done task, `s1b` `pending` in `s1` and `m1` `pending`
  in `milestones`, in that order

#### Scenario: A done phase with an unchecked task writes nothing

- GIVEN the roadmap and the archived change of the scenario above
- AND a `docs/progress.md` whose `### S1a. The platform` lists
  `- [ ] domain: Own domain` under `#### Tasks`
- WHEN `ospec snapshot --schema-version 2 --out snapshot.json` runs
- THEN it MUST exit 1 with `progress-invalid` naming the line of that task
- AND `snapshot.json` MUST NOT exist

#### Scenario: The v3 adds the delivery stage of each done phase

- GIVEN the roadmap of the v2 scenario above, with the archived changes
  `idd/archive/2026-01-02-s1a-platform/` and `idd/archive/2026-01-09-s1b-access/`
- AND an `idd/config.yaml` that declares `delivery.changelog: CHANGELOG.md`
- AND a `CHANGELOG.md` whose `## [1.0.0] - 2026-01-05` holds
  `- The platform (s1a-platform)` and whose `## [Unreleased]` holds
  `- Sign-in (s1b-access)`
- WHEN `ospec snapshot --schema-version 3` runs
- THEN stdout MUST hold only a v3 in which `s1a` holds the release
  `{ "stage": "production", "version": "1.0.0", "date": "2026-01-05" }`,
  `s1b` holds `{ "stage": "testing" }` and `m1` holds none

#### Scenario: A version heading without its date writes nothing

- GIVEN the project of the scenario above, with `## [1.0.0]` as the heading
  of the entry of `s1a-platform`
- WHEN `ospec snapshot --schema-version 3 --out snapshot.json` runs
- THEN it MUST exit 1 with `changelog-invalid` naming the line of that
  heading
- AND `snapshot.json` MUST NOT exist

#### Scenario: Without a changelog no phase holds a stage

- GIVEN the project of the first v3 scenario without `CHANGELOG.md`
- WHEN `ospec snapshot --schema-version 3` runs
- THEN it MUST exit 0 with a v3 in which no phase holds a `release`

#### Scenario: The v4 adds the documentation and the decisions

- GIVEN the roadmap of the v2 scenario above, whose `## S1. Base` table has
  an `ADRs` column holding `0001` in the row of `S1a. Platform`
- AND a `docs/architecture/decisions/0001-web-app.md` with
  `# 0001. Web application`, `- Status: accepted` and `- Date: 2026-01-02`,
  and a `0002-native-app.md` with `- Status: rejected`
- AND a `docs/progress.md` whose `## Problem` holds a paragraph and whose
  `## Decisions` holds `### 0001. A web app` with the paragraph
  `Nothing to install.`
- WHEN `ospec snapshot --schema-version 4` runs
- THEN stdout MUST hold only a v4 with that paragraph as its `problem` and
  one decision, `{ "number": 1, "title": "A web app", "date": "2026-01-02",
  "status": "accepted", "reason": "Nothing to install.", "phases": ["s1a"] }`

#### Scenario: A published ADR without a reason writes nothing

- GIVEN the project of the scenario above without its `## Decisions` section
- WHEN `ospec snapshot --schema-version 4 --out snapshot.json` runs
- THEN it MUST exit 1 with `decisions-invalid` naming the `Status` line of
  `0001-web-app.md`
- AND `snapshot.json` MUST NOT exist

#### Scenario: Without the option the v1 is unchanged

- GIVEN a roadmap with groups and a `docs/progress.md`
- WHEN `ospec snapshot` runs
- THEN stdout MUST hold the same v1 as without either of them

#### Scenario: Nothing else runs it

- GIVEN a project with IDD or SDD changes
- WHEN a change is opened, checked or closed
- THEN no snapshot MUST be built or written

### Requirement: Durable State On Disk {#REQ-idd-027}

A change's state MUST survive a power cut and two processes writing it at
once (E1.46, ADR 0002). Every atomic write, in the CLI and the hooks, Node
(`writeFileAtomic`, `scripts/lib/atomic-write.js`) and the native binary
(`store.WriteFileAtomic`) alike, MUST write the whole content to a temporary
file of its own, `<target>.<writer>.tmp`, sync it to disk, rename it over the
target and then sync the directory. A failed sync of the file MUST fail the
write and leave the target as it was. When Windows refuses the rename for a
moment because another process is replacing the target or holds it open
(`EPERM` or `EEXIST`; `os.ErrPermission` or `os.ErrExist` in Go), the writer
MUST retry the same rename, up to 8 attempts with a wait that starts at 10 ms
and doubles, and MUST NOT move the target aside, so the target is never absent
(E1.55). When the attempts run out, the write MUST fail, remove its temporary
file and leave the target as it was. The directory sync MUST be skipped on
Windows, which cannot open a directory, and where the filesystem does not
support it. Before writing, a writer MUST remove the temporary files of its
target, `<target>.<writer>.tmp` and the `<target>.tmp` of earlier versions,
that are older than 5 s, the lock's stale window; a younger one belongs to a
live writer and stays. Removing them is best effort and never fails the write.

The lock is the file `<target>.lock`, created exclusively. Its owner MUST write
its token, its pid and a random nonce, into it, MUST refresh its mtime every
second while it holds it (`LOCK_HEARTBEAT_MS` and `lockHeartbeat`, equal in
both runtimes), and MUST remove it only while it still holds its token. A
waiter MAY reclaim a lock older than 5 s, which only a dead or stalled owner
leaves. A writer that does work between taking the lock and writing (the IDD
and SDD state, the phase costs) MUST check its token right before the write
and, when another process holds the lock, write nothing and fail with
`lock-lost` (`ErrLockLost` in Go).

#### Scenario: Two processes lose no write

- GIVEN two processes that each record 15 assumptions on one change at once
- WHEN both finish
- THEN the state MUST hold all 30

#### Scenario: A former owner leaves the new owner's lock

- GIVEN a writer whose lock another process took over while it ran
- WHEN it is about to write and when it finishes
- THEN it MUST fail with `lock-lost` without writing
- AND the new owner's lock MUST stay

#### Scenario: A live owner's lock never goes stale

- GIVEN an owner that holds the lock longer than the stale window
- WHEN another writer waits for it
- THEN the waiter MUST run only after the owner finishes

#### Scenario: A dead writer's temporary file goes away

- GIVEN `state.yaml.tmp` and `state.yaml.999-dead.tmp` older than 5 s, a
  younger `state.yaml.1000-live.tmp` and another file's old temporary file
- WHEN `state.yaml` is written
- THEN the two old temporary files of `state.yaml` MUST be gone and the other
  two MUST stay

#### Scenario: Two writers refused while the other replaces the target

- GIVEN two writers of `state.yaml` without a lock, whose first rename the OS
  refuses while the other replaces the target
- WHEN both retry
- THEN both writes MUST finish, `state.yaml` MUST hold one of them whole and no
  temporary file or `.bak` MUST be left
- AND `state.yaml` MUST never be moved aside

#### Scenario: A rename refused every time keeps the target

- GIVEN a rename of the temporary file over `state.yaml` that the OS refuses on
  every attempt
- WHEN the 8 attempts run out
- THEN the write MUST fail with the refusal, `state.yaml` MUST keep its content
  and the temporary file MUST be gone
