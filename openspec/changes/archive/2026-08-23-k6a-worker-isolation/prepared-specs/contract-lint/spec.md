# Contract Lint Specification

## Purpose

A single structural lint aggregates every declared harness contract —
tools-vs-skill (I1), commands-vs-routers (J1), and declared-budget-vs-runtime
(I3) — under one registry, so "contract declared without enforcement" cannot
be reintroduced. It runs standalone and from the existing pre-commit/CI
surface (`scripts/check.js`); it introduces no new invocation pathway.

## Requirements

### Requirement: Unified Contract Registry {#REQ-contract-lint-001}

The system MUST expose a single aggregator that runs every registered
contract checker and fails the whole run if any checker reports an offender.
Each registered checker MUST accept repository paths/artifacts as input and
return a list of offenders (empty list = pass); the aggregator MUST NOT
short-circuit on the first failing checker — it MUST run all registered
checkers and collect every offender before reporting.

#### Scenario: All checkers pass

- GIVEN every registered checker returns an empty offender list
- WHEN the aggregator runs
- THEN the overall lint run MUST pass (zero exit / passing test)

#### Scenario: One checker fails — others still run

- GIVEN one registered checker returns a non-empty offender list
- WHEN the aggregator runs
- THEN it MUST still execute every other registered checker
- AND the overall run MUST fail, reporting offenders from all checkers that found any

---

### Requirement: I1 Manifest Cross-Check Checker {#REQ-contract-lint-002}

The registry MUST include a checker that enforces the skill runtime-capability
manifest contract (`skills` domain spec, Skill Runtime Capability Manifest).
It MUST read each skill's `runtime_capabilities:` frontmatter and, for SDD
phase skills, the bound phase agent's `tools:` grant, then report an offender
for every direction-(a) or direction-(b) mismatch defined by that requirement.

In the current state of the repository, the mandatory `runtime_capabilities:`
declaration — and therefore the mandatory direction-(b) check — applies only
to the 14 SDD phase skills (1:1 bound to their phase agent). Utility, `_shared`,
and stack-tier skills are optional declarers in this change (`skills` domain
spec, Skill Runtime Capability Manifest): when one of them omits the field,
the checker MUST treat it as declaring all three capabilities `false` and MUST
NOT report an offender for that omission alone; direction (a) still applies
if such a skill DOES declare a `true` capability. This scoping is a statement
of the checker's current enforcement surface, not a hypothetical or future
one — it MUST NOT be read as anticipating a later mandatory expansion.

#### Scenario: Orphan execute capability caught (mutation-verified)

- GIVEN a phase skill declares `runtime_capabilities: { execute: true }`
- AND its bound agent's `tools:` grant lacks `execute`
- WHEN this checker runs as part of the aggregator
- THEN it MUST report exactly one offender naming the skill and the missing tool
- AND removing the manifest mismatch MUST make the checker pass again (mutation-verified round-trip)

#### Scenario: Utility skill mismatch across consumers does not double-count as an agent-side defect

- GIVEN a utility skill is consumed by two agents with different `tools:` grants
- WHEN this checker runs
- THEN it evaluates direction (a) independently per consuming agent
- AND it MUST NOT report a direction-(b) offender for either agent (utility tier is exempt from direction b)

#### Scenario: Utility/stack skill with no manifest passes without an offender

- GIVEN a utility, `_shared`, or stack-tier skill has no `runtime_capabilities:` block
- WHEN this checker runs
- THEN it treats the skill as declaring `execute: false`, `mcp: false`, `write: false`
- AND it MUST NOT report an offender for that tier solely because the field is absent,
  since this change scopes the mandatory declaration to the 14 SDD phase skills only

---

### Requirement: J1 Commands↔Agents Integration {#REQ-contract-lint-003}

The registry MUST include, as one registered checker, the same assertions
already enforced by the existing commands↔agents contract test
(`agents` domain spec, REQ-agents-007): every command's routed sub-agent
exists in its router's `agents:` allowlist. The rel-1 guard (a command with no
matching Command Roster row is a hard failure, not a silent skip) and the
rel-2 guard (at least one roster row must contain a routing arrow) MUST be
preserved unmodified in behavior; this integration MAY relocate or adapt the
assertions into the registry's checker interface but MUST NOT weaken, remove,
or silence either guard.

#### Scenario: Existing guard behavior preserved after integration

- GIVEN a command file has no matching row in the Command Roster table
- WHEN the integrated J1 checker runs inside the unified registry
- THEN it MUST still report this as a hard failure (rel-1), identical to the
  pre-integration standalone test's behavior

#### Scenario: No duplicated re-implementation

- GIVEN the unified registry runs the J1 checker
- WHEN the checker executes
- THEN it MUST reuse (adapt via a thin interface), not reimplement from
  scratch, the roster-parsing and allowlist-matching logic already proven by
  the pre-existing test

---

### Requirement: I3 Declared-Budget↔Runtime-Constant Checker {#REQ-contract-lint-004}

The registry MUST include, as one registered checker, the existing coherence
check between a config-declared budget/timeout and its runtime constant
counterpart — the reference instance being `hooks/hooks.json`'s `SessionStart`
timeout versus the lock module's `LOCK_STALE_MS`/`LOCK_RETRY_ATTEMPTS`/
`LOCK_RETRY_DELAY_MS` constants. This checker MUST also validate the `SessionStart`
timeout budget declared in Codex target `hooks/hooks.json` against `LOCK_STALE_MS`
constants. This checker generalizes the pattern "every declared budget in a
manifest/config file has a corresponding runtime constant, and the declared
relationship between them MUST hold" so future budget/constant pairs can be
registered under the same checker shape without inventing a new one.

#### Scenario: Existing lock/hook guard preserved after integration

- GIVEN `hooks/hooks.json`'s `SessionStart` timeout and the lock module's
  stale-window constant
- WHEN the integrated I3 checker runs inside the unified registry
- THEN it MUST still fail if `LOCK_STALE_MS` exceeds the timeout budget or
  falls below the retry-window floor, identical to the pre-integration
  standalone test's behavior

#### Scenario: Codex lock/hook guard verified

- GIVEN the Codex target's `hooks/hooks.json` `SessionStart` timeout budget and the lock module's stale-window constant
- WHEN the integrated I3 checker runs inside the unified registry
- THEN it MUST fail if Codex `SessionStart` timeout budget is violated by `LOCK_STALE_MS`

#### Scenario: New budget pair reusing the same checker shape

- GIVEN a future config declares a new timeout/budget alongside a runtime
  constant meant to stay within it
- WHEN a maintainer registers this pair under the I3 checker pattern
- THEN no new checker type MUST be invented — the existing generalized shape
  (declared value in, runtime constant in, relationship assertion) MUST be
  reused

---

### Requirement: Standalone and Existing Pre-commit/CI Invocation {#REQ-contract-lint-005}

The unified lint MUST be runnable as a standalone command AND as part of the
existing automated test suite already wired into pre-commit and CI via
`scripts/check.js`. This change MUST NOT introduce a new invocation pathway,
hook, or CI job beyond wiring the aggregator into the existing surface.

#### Scenario: Standalone invocation

- GIVEN a contributor wants to run only the contract lint
- WHEN they invoke it directly (without running the full `check.js` suite)
- THEN it MUST run to completion and report pass/fail on its own

#### Scenario: Pre-commit/CI invocation unchanged in surface

- GIVEN the existing pre-commit hook and CI workflow already invoke
  `scripts/check.js`
- WHEN the unified lint is wired in
- THEN it MUST run as part of that same existing invocation — no new
  pre-commit hook entry or CI workflow file is required for this change

---

### Requirement: Actionable Diagnostics {#REQ-contract-lint-006}

On any offender found by any registered checker, the lint MUST fail (non-zero
exit / failing automated test) and the failure output MUST name: the checker
that found it, the offending file or artifact path, and the expected-vs-actual
mismatch, so a contributor can act without reading the checker's source code.

#### Scenario: Failure output is self-sufficient

- GIVEN the I1 checker finds an orphan `execute` declaration
- WHEN the lint fails
- THEN the reported message MUST include the checker name, the skill file
  path, and the missing tool name — without requiring the contributor to open
  the checker's implementation to understand the failure

---

### Requirement: Findings Classified as static-lint Evidence {#REQ-contract-lint-007}

Per the `skills` domain spec's `static-lint` Evidence Level requirement, every
finding produced by this lint MUST be classified as `static-lint`, never as
`runtime-test`, when consumed as verification evidence. Passing this lint
alone MUST NOT be treated as sufficient evidence for a MUST scenario that
specifies real runtime behavior.

#### Scenario: Passing lint does not close a behavior-describing MUST scenario

- GIVEN the unified contract lint passes for a change
- AND one of the change's MUST scenarios describes real runtime behavior of a
  function
- WHEN `sdd-verify` builds the compliance matrix
- THEN the lint's passing result alone MUST NOT be cited as satisfying that
  scenario — a `runtime-test` or accepted `static-proof` is still required

---

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

---

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

---

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

---

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

---

### Requirement: Microscopic Graph Node Rejection Checker {#REQ-contract-lint-012}

The unified contract-lint registry MUST include a checker that inspects Execution Graph definitions and fails if any node specifies a microscopic worker operation (such as `read`, `edit`, `test`, `file_edit`, `bash_run`, `grep`, or single tool invocations). The checker MUST report an offender naming the graph file, the offending `node_id`, and the invalid microscopic operation. Execution Graph nodes MUST represent coarse semantic units declaring objective, ownership, invariants, dependencies, and required evidence.

#### Scenario: Microscopic node in graph is rejected as an offender

- GIVEN an Execution Graph containing a node with operation `file_edit` or `test`
- WHEN the contract-lint aggregator runs the microscopic node checker
- THEN the checker MUST report an offender identifying the file, node ID, and operation
- AND the overall lint run MUST fail

#### Scenario: Semantic coarse graph nodes pass without offenders

- GIVEN an Execution Graph containing only semantic coarse nodes with valid objectives and ownership
- WHEN the microscopic node checker runs
- THEN the checker MUST return an empty offender list

---

### Requirement: Obligation Manifest Completeness Checker {#REQ-contract-lint-013}

The unified contract-lint registry MUST include a checker that verifies that every `MUST` obligation declared in change contracts is represented in the Execution Graph's embedded Obligation Manifest. The checker MUST report an offender if any `MUST` obligation lacks at least one implementing semantic node in `implemented_by` or lacks required verification evidence in `required_evidence`, unless an explicit structured `deferred` entry is present with rationale and approval.

#### Scenario: Unmapped MUST obligation is reported as an offender

- GIVEN a change contract declaring obligation `req-auth-001` with criticality `must`
- AND the compiled Execution Graph Obligation Manifest omits `req-auth-001` or leaves `implemented_by` empty
- WHEN the obligation manifest completeness checker runs
- THEN it MUST report an offender for `req-auth-001`
- AND the overall lint run MUST fail

#### Scenario: Complete Obligation Manifest passes lint

- GIVEN an Execution Graph where every `MUST` obligation has non-empty `implemented_by` and `required_evidence`
- WHEN the obligation manifest completeness checker runs
- THEN it MUST return an empty offender list

---

### Requirement: Causal Failure Taxonomy And Transition Matrix Checker {#REQ-contract-lint-014}

The unified contract-lint registry MUST include a checker that validates declared failure descriptors and recovery transitions against the causal failure taxonomy and allowlisted transition matrix. The checker MUST report an offender if any declared recovery transition references an unallowlisted operation for its failure category or code, or if a failure descriptor omits required taxonomy fields (`category`, `code`, `priority`, `blocking_fingerprint`).

#### Scenario: Unallowlisted transition for failure category is reported as an offender

- GIVEN a recovery transition declaration mapping category `ambiguous_effect` to target operation `repair`
- WHEN the contract-lint aggregator runs the transition matrix checker
- THEN the checker MUST report an offender naming the invalid transition and operation
- AND the overall lint run MUST fail

#### Scenario: Valid causal failure and transition declarations pass lint

- GIVEN execution contracts with valid causal failure descriptors and allowlisted transition mappings
- WHEN the transition matrix checker runs
- THEN the checker MUST return an empty offender list

---

### Requirement: Execution Budget And Monotonicity Structure Checker {#REQ-contract-lint-015}

The unified contract-lint registry MUST include a checker that validates budget declarations across execution graphs, work orders, and recovery nodes. The checker MUST report an offender if any node execution budget or authority budget contains negative quotas, malformed field types, or if a child repair node declares budget allocations that exceed the parent work order's remaining budget envelope.

#### Scenario: Negative or malformed budget allocation is reported as an offender

- GIVEN an execution graph node declaring `turns: -2` or `effect_attempts: "many"`
- WHEN the contract-lint aggregator runs the budget structure checker
- THEN the checker MUST report an offender identifying the file, node ID, and malformed budget field
- AND the overall lint run MUST fail

#### Scenario: Inflated repair node budget is reported as an offender

- GIVEN a child repair work order declaring `effect_attempts: 5` when the parent node had an initial budget of 3
- WHEN the budget structure checker runs
- THEN the checker MUST report an offender for budget inflation / non-monotonicity violation
- AND the overall lint run MUST fail

#### Scenario: Well-formed monotonic budget structures pass lint

- GIVEN execution graphs and work orders with valid non-negative budgets satisfying monotonicity constraints
- WHEN the budget structure checker runs
- THEN the checker MUST return an empty offender list

---

### Requirement: Worker Isolation CandidateId Non-Emission Checker {#REQ-contract-lint-016}

The unified contract-lint registry MUST include a checker that validates all worker isolation execution primitives, schema definitions, and fixtures to ensure strict compliance with the K3 identity boundary. The checker MUST report an offender if any K6a execution primitive, schema, or test fixture emits, accepts, returns, or contains `candidate_id` or references Candidate schema definitions.

#### Scenario: K6a artifact emitting CandidateId is reported as an offender

- GIVEN a worker execution fixture or schema definition declaring `candidate_id`
- WHEN the contract-lint aggregator runs the candidate non-emission checker
- THEN the checker MUST report an offender identifying the file and the forbidden candidate property
- AND the overall contract-lint run MUST fail

#### Scenario: Conforming K6a artifacts pass lint without offenders

- GIVEN worker isolation primitives and fixtures emitting only `WorkResult` bound to `WorkOrderId` / `SourceSnapshotId`
- WHEN the candidate non-emission checker runs
- THEN the checker MUST return an empty offender list

---

### Requirement: Capsule Path Containment And Allowed Paths Checker {#REQ-contract-lint-017}

The unified contract-lint registry MUST include a checker that validates that all worker execution fixtures, capsule definitions, and work orders declare non-empty `allowed_paths`. The checker MUST report an offender if any capsule or work order fixture omits `allowed_paths`, provides an empty list, or includes path traversal sequences (`../`, `..\\`) in declared allowed paths.

#### Scenario: Capsule fixture missing or empty allowed_paths is reported as an offender

- GIVEN a capsule definition or execution fixture with missing or empty `allowed_paths`
- WHEN the contract-lint aggregator runs the capsule path containment checker
- THEN the checker MUST report an offender naming the offending artifact
- AND the overall lint run MUST fail

#### Scenario: Capsule fixture containing path traversal in allowed_paths is rejected

- GIVEN an execution fixture declaring `allowed_paths: ["../escape/path"]`
- WHEN the capsule path containment checker runs
- THEN the checker MUST report an offender identifying the path traversal attempt
- AND the overall lint run MUST fail

#### Scenario: Conforming capsule configurations pass lint

- GIVEN capsule definitions and execution fixtures declaring valid sandboxed `allowed_paths`
- WHEN the capsule path containment checker runs
- THEN the checker MUST return an empty offender list

## Cross-References

- `skills` domain spec — Skill Runtime Capability Manifest (I1 declaration
  contract) and `static-lint` Evidence Level (J2 taxonomy).
- `agents` domain spec, REQ-agents-007 — Commands↔Agents Static Contract Test
  (J1 source behavior being integrated, not replaced).
- `scripts/lib/ospec-state.test.js` (lines ~928-957) — I3 reference
  implementation for the declared-budget↔runtime-constant pattern.

## Clarifications

### Session 2026-07-07

- Q: ¿Qué subconjunto de SKILL.md existentes debe retrofittear runtime_capabilities: en este change? → A: Solo los 14 SDD-phase skills (recomendado). El checker I1 refleja este alcance: la exigencia de dirección (b) (declaración precisa obligatoria) corre solo contra esos 14 skills en el estado actual del repo; utility/`_shared`/stack quedan exentos de mandatoriedad y pasan sin offender cuando omiten el campo (dirección (a) sigue aplicando solo si sí declaran algún `true`).
