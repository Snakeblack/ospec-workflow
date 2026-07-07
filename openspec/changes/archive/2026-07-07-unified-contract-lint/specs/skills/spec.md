# Delta for Skills

## ADDED Requirements

### Requirement: Skill Runtime Capability Manifest {#REQ-skills-001}

Every SDD phase skill (§1.1 — the 14 skills 1:1 bound to a phase agent via
`agents/{same-name}.agent.md`) MUST declare a `runtime_capabilities:`
frontmatter block naming which of `execute`, `mcp`, and `write` the skill body
instructs the executing agent to exercise. This is a distinct field from the
existing `capabilities:` field (§2.5), which names technology domains for
stack skills and MUST NOT be reused for this contract.

For the other three tiers (utility/communication, `_shared`, and stack
skills), declaring `runtime_capabilities:` is OPTIONAL in this change — such a
skill MAY declare it, but this change does not require it, and no expiration
or follow-up date is fixed for closing that gap. Absence is a permanently
valid state for these tiers under this change's scope, not a transitional
one; extending the MUST to these tiers is out of scope here and would require
a future change to revisit.

A capability MUST be declared `true` only when the skill's body instructs the
agent to run shell/test commands (`execute`), invoke an MCP tool (`mcp`), or
create/modify a file (`write`). A skill with no `runtime_capabilities:` block is
treated as declaring all three `false`.

For every SDD phase skill (§1.1), which is one-to-one bound to its phase agent
(`agents/{same-name}.agent.md`), the contract MUST hold in BOTH directions:
(a) every capability the skill declares `true` MUST be backed by the
corresponding abstract tool in the bound agent's `tools:` grant (`execute`→
`execute`, `write`→`edit`); (b) every such abstract tool present in that agent's
`tools:` grant MUST be justified by a `true` declaration in its bound phase
skill. For utility and stack skills — loadable by more than one agent — only
direction (a) applies; a mismatch in direction (b) MUST NOT be raised for these
tiers, since one agent may legitimately combine several skills with differing
capability needs.

#### Scenario: Skill declares execute without agent backing

- GIVEN a phase skill's `runtime_capabilities: { execute: true }`
- AND its bound phase agent's `tools:` grant omits `execute`
- WHEN the manifest is cross-checked against the agent
- THEN the check MUST fail, naming the skill and the missing tool

#### Scenario: Phase agent holds a tool its bound skill never justifies

- GIVEN a phase agent's `tools:` grant includes `edit`
- AND its bound phase skill declares `runtime_capabilities: { write: false }`
- WHEN the manifest is cross-checked (direction b, phase skills only)
- THEN the check MUST fail, naming the agent and the unjustified tool

#### Scenario: Utility skill loaded by multiple agents — direction (b) skipped

- GIVEN a utility skill declares `runtime_capabilities: { execute: true }`
- AND it is loaded by two different agents with differing `tools:` grants
- WHEN the manifest is cross-checked
- THEN direction (a) MUST be verified for each consuming agent independently
- AND direction (b) MUST NOT be evaluated for this skill tier

#### Scenario: Missing manifest treated as all-false

- GIVEN a skill has no `runtime_capabilities:` frontmatter block
- WHEN the manifest is cross-checked
- THEN the skill is treated as declaring `execute: false`, `mcp: false`,
  `write: false`
- AND a bound phase agent holding `execute` or `edit` tools then fails
  direction (b), naming the missing manifest declaration

---

### Requirement: `static-lint` Evidence Level {#REQ-skills-002}

The Evidence Levels taxonomy used by `sdd-verify` (`skills/sdd-verify/SKILL.md`
and `skills/sdd-verify/references/report-format.md`) MUST include a
`static-lint` level, ranked between `static-proof` and `inspection-proof`.
`static-lint` denotes a check that inspects declared artifacts (skill
manifests, frontmatter, config files, commit trailers) via grep/parse/string
comparison — including a check that runs inside the automated test runner but
exercises no real runtime code path — as distinct from `runtime-test`, which
drives actual code execution and observes real output.

`sdd-verify` MUST classify unified-contract-lint findings, and any other
grep/parse-based structural contract test (e.g. the existing
commands↔agents and hooks-budget↔lock-constant tests), as `static-lint`, never
as `runtime-test`. A MUST scenario whose text specifies real runtime behavior
(e.g. "the function returns X when called with Y") MUST NOT be satisfied by
`static-lint` evidence alone. `static-lint` MAY satisfy a MUST scenario whose
own text describes a structural/declarative contract (e.g. "file X MUST
contain Y", "field A MUST equal field B").

#### Scenario: static-lint rejected for a behavior-describing MUST scenario

- GIVEN a MUST scenario describes real runtime behavior of a function
- AND the only evidence found is a `static-lint` grep-based check
- WHEN `sdd-verify` builds the compliance matrix
- THEN the scenario is marked CRITICAL — `static-lint` is insufficient for a
  behavior-describing MUST scenario

#### Scenario: static-lint accepted for a structural MUST scenario

- GIVEN a MUST scenario describes a structural/declarative contract (e.g. two
  config values must match)
- AND a grep/parse-based test proves it
- WHEN `sdd-verify` builds the compliance matrix
- THEN the scenario is marked PASS with evidence level `static-lint`

#### Scenario: Existing structural contract tests reclassified

- GIVEN the pre-existing commands↔agents test (REQ-agents-007) and the
  hooks-budget↔lock-constant test are grep/parse-based, no-LLM, no-runtime-
  execution checks
- WHEN `sdd-verify` classifies their evidence level going forward
- THEN both MUST be labeled `static-lint`, not `runtime-test`

## Clarifications

### Session 2026-07-07

- Q: ¿Qué subconjunto de SKILL.md existentes debe retrofittear runtime_capabilities: en este change? → A: Solo los 14 SDD-phase skills (recomendado). Rationale: es el alcance estructuralmente necesario para que el checker I1 pase — dirección (b) (declaración precisa obligatoria) solo aplica al tier SDD-phase, 1:1 bound a su agente; utility/stack/_shared solo necesitan dirección (a), que es vacuously satisfied sin declarar nada. Utility/stack/_shared quedan exentos en este change: usan el fallback ausente=false indefinidamente, sin fecha de vencimiento fijada para cerrar ese gap; extender el MUST a esos tiers queda fuera de alcance y se revisitaría en un change futuro.
