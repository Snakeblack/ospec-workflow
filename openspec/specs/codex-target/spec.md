# codex-target Specification

## Purpose

`codex` is the fifth target profile consumed by the generator (`scripts/lib/target-transform.js`).
It packages the canonical plugin tree as an OpenAI Codex CLI plugin: a `.codex-plugin/plugin.json`
bundle with `skills/` and `.mcp.json`, agents emitted separately as TOML, commands emitted as
invocable skills, and the `question_gate` ask flow degraded to a chat protocol (Codex has no
structured ask-tool). This spec covers only the generator-side profile and its transforms
(Bloque 5.1); the hooks bridge, installer, and `models.yaml` column are out of scope (5.2–5.4).

## Requirements

### Requirement: Plugin Bundle Reshaping {#REQ-codex-target-001}

The `codex` profile MUST reshape the canonical manifest into `.codex-plugin/plugin.json`
containing only `skills`, `mcpServers`, `apps`, and `hooks` fields, plus an `interface`
metadata block (`displayName`, icons). The bundle MUST include `skills/` and `.mcp.json`.

#### Scenario: Manifest reshaped to Codex plugin schema

- GIVEN the canonical `.claude-plugin/plugin.json` manifest
- WHEN the `codex` profile reshapes it
- THEN the output `.codex-plugin/plugin.json` MUST contain only `skills`, `mcpServers`,
  `apps`, `hooks`, and `interface` keys — no other top-level keys from the source manifest

#### Scenario: Skills and MCP config included in bundle

- GIVEN a generated `codex` output tree
- WHEN the bundle is inspected
- THEN `skills/` and `.mcp.json` MUST be present in the output alongside
  `.codex-plugin/plugin.json`

### Requirement: Agents Excluded From Plugin Bundle, Emitted As TOML {#REQ-codex-target-002}

The `codex` profile MUST declare `agentFile.format: "toml"` (generator
Requirement: Agent Files May Emit TOML For Codex-Style Profiles) so every
`agents/*.agent.md` file is emitted at `.codex/agents/<name>.toml` and MUST NOT appear in
`.codex-plugin/plugin.json`.

#### Scenario: Agent TOML output path

- GIVEN `agents/sdd-apply.agent.md`
- WHEN the `codex` profile transforms it
- THEN the output MUST be `.codex/agents/sdd-apply.toml` with `developer_instructions`
  containing the agent body, and this path MUST NOT be referenced from
  `.codex-plugin/plugin.json`

### Requirement: Sandbox Mode Assigned By Agent Capability {#REQ-codex-target-003}

The `codex` profile MUST assign `sandbox_mode = "read-only"` to agents whose role is
review-only (the 4R reviewer agents) and `sandbox_mode = "workspace-write"` to agents
capable of applying or verifying changes (e.g. `sdd-apply`, `sdd-verify`). This
assignment MUST be derivable from each agent's existing capability declaration, without
introducing a new frontmatter field solely for this purpose.

#### Scenario: Reviewer agent gets read-only sandbox

- GIVEN a 4R reviewer agent file with no write-capable tool grants
- WHEN the `codex` profile emits its TOML
- THEN `sandbox_mode` MUST be `"read-only"`

#### Scenario: Apply agent gets workspace-write sandbox

- GIVEN the `sdd-apply` agent file, which is capability-declared as write-capable
- WHEN the `codex` profile emits its TOML
- THEN `sandbox_mode` MUST be `"workspace-write"`

### Requirement: Commands Emitted As Invocable Skills, Never Deprecated Prompts {#REQ-codex-target-004}

The `codex` profile MUST declare `commandFile.format: "skill"` (generator Requirement:
Command Files May Emit Invocable Skills For Codex-Style Profiles) so each
`commands/*.prompt.md` becomes `skills/commands/<name>/SKILL.md`, invocable as `$sdd-*`
via its frontmatter `name:` field (the invocation name is unaffected by the output
directory). The `skills/commands/` prefix MUST be used — never the bare
`skills/<name>/SKILL.md` path — because that bare path is already the established
output path for existing context-doc skills (`skills/<name>/SKILL.md` loaded by phase
agents, e.g. `skills/sdd-apply/SKILL.md`) referenced by literal path from agent prose; 15
of the 18 real SDD commands share their base name with an existing `skills/<name>/`
folder, so emitting into the bare path would silently overwrite the context doc (or vice
versa, depending on write order) with no error. The profile MUST NOT emit any file under
a `prompts/` path — Codex custom prompts are deprecated in favor of skills.

#### Scenario: Command becomes invocable skill

- GIVEN `commands/sdd-tasks.prompt.md`
- WHEN the `codex` profile transforms it
- THEN the output MUST be `skills/commands/sdd-tasks/SKILL.md`, invocable as `$sdd-tasks`

#### Scenario: Command-derived skill does not collide with existing context-doc skill

- GIVEN a real output tree where `commands/sdd-apply.prompt.md` and
  `skills/sdd-apply/SKILL.md` (an existing context doc) both exist in the source tree
- WHEN the `codex` profile transforms the full tree
- THEN the output MUST contain BOTH `skills/commands/sdd-apply/SKILL.md` (the
  command-derived invocable skill, with spawn instruction and positional args) AND
  `skills/sdd-apply/SKILL.md` (the untouched context doc, passed through unchanged) as
  two distinct files at two distinct paths

#### Scenario: No prompts directory in codex output

- GIVEN a full `codex` generation run
- WHEN the output tree is inspected
- THEN no path under `prompts/` MUST exist

### Requirement: Question Gate Degraded To Chat Protocol {#REQ-codex-target-005}

The `codex` profile MUST declare a degradation marker for the abstract `AskUserQuestion`
tool name (generator Requirement: Tool Map May Declare Degraded Prose Substitution For
Ask-Tool-Less Targets), because Codex has no structured ask-tool. Emitted agents and
skills MUST instruct a numbered plain-chat question protocol instead of invoking a
named tool.

#### Scenario: Blocking question rendered as chat protocol

- GIVEN an agent file whose prose invokes `AskUserQuestion` for a blocking gate
- WHEN the `codex` profile emits it
- THEN the output MUST describe a numbered plain-chat question protocol in place of
  `AskUserQuestion`, and MUST NOT reference any Codex tool name for asking questions

### Requirement: Rules Strategy Selection Is Deferred To Design ADR {#REQ-codex-target-006}

This spec MUST NOT fix whether `rules/*.instructions.md` content is folded into the
emitted `AGENTS.md` or injected into each agent's `developer_instructions` — that choice
is recorded as an ADR during `sdd-design`. The `codex` profile MUST implement whichever
strategy the ADR selects using the generator's existing `rules.strategy` dispatch
(`inline-into-orchestrator`, `to-instructions`, `to-instructions-config`, or a
documented new value), without a codex-specific rules code path outside that dispatch.

#### Scenario: Profile routes through existing rules dispatch

- GIVEN the design ADR selects a `rules.strategy` value for the `codex` profile
- WHEN `rules/*.md` files are processed
- THEN they MUST be routed through the generator's existing `rules.strategy` dispatch
  (Scenario 3) using the selected value — no additional codex-only branch is introduced

### Requirement: Skill Description Front-Loading For Progressive Disclosure {#REQ-codex-target-007}

Because Codex truncates skill descriptions under progressive disclosure (~2% of context)
when many skills are installed, every `description` frontmatter field emitted by the
codex commands→skills transform MUST place the skill's primary identifying trigger
phrase (its invocable name or main action verb) within the first 80 characters.

#### Scenario: Description reordered to front-load trigger phrase

- GIVEN a command file whose frontmatter description begins with a preamble before its
  trigger phrase
- WHEN the `codex` profile emits it as a skill
- THEN the emitted `description` MUST begin with the trigger phrase within the first 80
  characters

#### Scenario: Already front-loaded description passes through unchanged

- GIVEN a command file whose description already front-loads its trigger phrase within
  80 characters
- WHEN transformed
- THEN the emitted `description` MUST be preserved unchanged

### Requirement: Output Validation And Golden Fixture Coverage {#REQ-codex-target-008}

`scripts/configure/validate-codex.js` MUST validate a generated `codex` output tree
against the schema requirements above (bundle field allowlist, agent TOML shape, no
`prompts/` path), and golden fixtures MUST exist under
`scripts/configure/__fixtures__/` exercising this target in `e2e.test.js` and
`real-repo.test.js`.

#### Scenario: Validator fails on out-of-schema bundle key

- GIVEN a generated `.codex-plugin/plugin.json` containing an `agents` key
- WHEN `validate-codex.js` runs
- THEN it MUST emit at least one error and exit with non-zero status

#### Scenario: Valid codex output passes validation

- GIVEN a `codex` output tree matching the golden fixtures
- WHEN `validate-codex.js` runs
- THEN it MUST exit with status 0 and report no errors
