# Delta for codex-target

## MODIFIED Requirements

### Requirement: Agents Excluded From Plugin Bundle, Emitted As TOML {#REQ-codex-target-002}

The `codex` profile MUST declare `agentFile.format: "toml"` (generator
Requirement: Agent Files May Emit TOML For Codex-Style Profiles) so every
`agents/*.agent.md` file is emitted at `.codex/agents/<name>.toml` and MUST NOT appear in
`.codex-plugin/plugin.json`. These emitted TOML files MUST remain a separate installation
artifact that the installer copies into the target Codex agents location; the plugin bundle
MUST stay valid without embedding agent files.

(Previously: the requirement only specified TOML emission and plugin-bundle exclusion, without defining the installer handoff contract for those emitted agent files.)

#### Scenario: Agent TOML output path

- GIVEN `agents/sdd-apply.agent.md`
- WHEN the `codex` profile transforms it
- THEN the output MUST be `.codex/agents/sdd-apply.toml` with `developer_instructions`
  containing the agent body, and this path MUST NOT be referenced from
  `.codex-plugin/plugin.json`

#### Scenario: Installer consumes emitted agent TOML separately from the plugin bundle

- GIVEN a generated `codex` output tree containing both `.codex-plugin/plugin.json` and
  `.codex/agents/*.toml`
- WHEN the distribution contract is applied
- THEN the plugin bundle MUST remain agent-free and the emitted TOML files MUST be treated
  as separate install inputs for the target Codex agents directory
