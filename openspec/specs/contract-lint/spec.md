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
`LOCK_RETRY_DELAY_MS` constants. This checker generalizes the pattern "every
declared budget in a manifest/config file has a corresponding runtime constant,
and the declared relationship between them MUST hold" so future
budget/constant pairs can be registered under the same checker shape without
inventing a new one.

#### Scenario: Existing lock/hook guard preserved after integration

- GIVEN `hooks/hooks.json`'s `SessionStart` timeout and the lock module's
  stale-window constant
- WHEN the integrated I3 checker runs inside the unified registry
- THEN it MUST still fail if `LOCK_STALE_MS` exceeds the timeout budget or
  falls below the retry-window floor, identical to the pre-integration
  standalone test's behavior

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
