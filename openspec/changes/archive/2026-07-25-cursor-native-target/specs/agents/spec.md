# Delta for agents

## ADDED Requirements

### Requirement: Cursor Generated Agents Use Chat Question Gate Prose {#REQ-agents-017}

Generated Cursor agents and the Cursor orchestrator MUST instruct blocking user
decisions via a structured chat `question_gate` protocol (numbered options, STOP and
wait for reply, persist approvals in `state.yaml`) rather than invoking
`vscode/askQuestions` or `AskUserQuestion`. This aligns with generator
REQ-generator-003 / REQ-generator-009 degrade markers and MUST NOT weaken envelope
`question_gate` field shape required by Section 6.1.

#### Scenario: Cursor orchestrator prose omits vscode ask tool

- GIVEN `scripts/configure` generates the `cursor` target
- WHEN the emitted orchestrator / phase agent bodies are inspected
- THEN they MUST NOT reference `vscode/askQuestions` or `AskUserQuestion` as callable tools
- AND blocking-gate prose MUST describe the structured chat STOP-and-wait protocol

#### Scenario: Envelope question_gate shape unchanged

- GIVEN a Cursor-session phase returns `status: blocked` with `question_gate`
- WHEN the envelope is validated against Section 6.1
- THEN field names and nesting MUST remain unchanged

## MODIFIED Requirements

### Requirement: Orchestrator Branch-Before-Code Recommendation

The `sdd-orchestrator` agent body MUST include a branch-before-code recommendation that is surfaced to the user when the orchestrator is about to dispatch `sdd-apply` as part of any route that includes that phase.

The recommendation MUST:
- State that a feature branch SHOULD be created (or confirmed active) before code modifications begin.
- Reference the `branch-pr` skill for naming conventions and PR workflow.
- Be advisory only (SHOULD, not MUST); the orchestrator MUST NOT block or gate the `sdd-apply` dispatch on branch confirmation.

Because the orchestrator body is divided into CORE and on-demand handlers (§15, agents spec), this recommendation MUST reside in the CORE zone — it applies to all routes that include `sdd-apply` and MUST NOT be placed in a circumstantial handler.

##### Scenario: Route reaches sdd-apply — recommendation surfaced

- GIVEN the orchestrator is executing any route that includes `sdd-apply`
- WHEN the orchestrator prepares to dispatch the `sdd-apply` phase
- THEN it MUST surface a branch recommendation to the user before or alongside the dispatch instruction
- AND the recommendation MUST reference `branch-pr` skill conventions

##### Scenario: Recommendation is advisory — route does not block

- GIVEN the orchestrator has surfaced the branch recommendation
- AND the user has not explicitly confirmed branch creation
- WHEN the orchestrator decides whether to proceed
- THEN it MUST dispatch `sdd-apply` without requiring branch confirmation
- AND the recommendation MUST NOT be treated as a gate or approval-ledger entry

##### Scenario: Recommendation propagates across all supported targets

- GIVEN the orchestrator source file is regenerated via `scripts/configure`
- WHEN the build produces `dist/` outputs for claude, vscode, github-copilot, opencode, codex, and cursor targets
- THEN the branch-before-code recommendation text MUST appear in the generated orchestrator for all six targets

(Previously: scenario covered four targets only — claude, vscode, github-copilot, opencode.)

### Requirement: Review Agent Target Parity {#REQ-agents-014}

The source generalist agent, its allowlist/model registration, selective dispatch instructions, validation contract, and audit semantics MUST be generated equivalently for every supported target, including claude, vscode, github-copilot, opencode, codex, and cursor. Target-native syntax MAY differ, but identical evidence MUST yield the same selected dimensions, reasons, cap, failure behavior, and severity/remediation outcome.

#### Scenario: Generated targets select identically

- GIVEN identical normal-change evidence and a valid generalist escalation in every supported target
- WHEN each target executes the gate
- THEN every target MUST select the same zero-to-two dimensions with equivalent reasons
- AND contract/parity validation MUST detect a missing generalist or dispatch contract

(Previously: supported-target list omitted `cursor`.)

### Requirement: Cross-Target Parity in Generated Dist

The orchestrator generated into `dist/` by `scripts/configure` MUST resolve
`skills/_shared/` handler references and produce observable behavior identical to
the agent source form. All `skills/_shared/` handler files registered in the CORE
pointer table MUST be included in the generated output tree for every supported target
(claude, github-copilot, opencode, vscode, codex, cursor). On the claude target the orchestrator MUST
be emitted as `skills/sdd-orchestrator/SKILL.md` per Section 8.3; the `_shared/`
handler files MUST be co-located in the same generated tree so the generated skill
can read them at runtime.

#### Scenario: Generated target resolves handler file at runtime

- GIVEN `scripts/configure` has regenerated `dist/` after the refactor
- WHEN a circumstantial gate fires in a session using the generated target
- THEN the generated orchestrator reads the handler file from the generated output tree
- AND the behavioral outcome (route, phase sequence, approvals, `state.yaml` fields)
  is identical to the agent source form

#### Scenario: All handler files present in dist after regeneration

- GIVEN the refactor has been applied to source files
- WHEN `scripts/configure` runs to regenerate `dist/`
- THEN every `skills/_shared/` handler file declared in the CORE pointer table appears
  in the dist output tree
- AND no parity test comparing source behavior to generated behavior fails

(Previously: supported-target enumeration omitted `codex` and `cursor`.)

## Clarifications

### Session 2026-07-25

- Q: ¿`validate-cursor` / el contrato de `dist/cursor` DEBE fallar ante cualquier `${input:…}` (incluidos commands), o solo ante residuo `vscode/`/`AskUserQuestion` en agents, dejando el strip de `${input:…}`/`agent:` en commands diferido? → A: Fail on leftover `vscode/`, `AskUserQuestion`, or unmapped abstract tool names in agent bodies/frontmatter only; command `${input:…}`/`agent:` MAY remain this change and MUST NOT alone fail the validator (strip deferred).
