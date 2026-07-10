# Delta for codex-target

## MODIFIED Requirements

### Requirement: Agents Excluded From Plugin Bundle, Emitted As TOML {#REQ-codex-target-002}

The `codex` profile MUST declare `agentFile.format: "toml"` (generator
Requirement: Agent Files May Emit TOML For Codex-Style Profiles) so every
`agents/*.agent.md` file is emitted at `.codex/agents/<name>.toml` and MUST NOT appear in
`.codex-plugin/plugin.json`. Every emitted Codex agent TOML MUST contain an
`[agents]` table with `max_depth = 1`, so the generated configuration permits
the coordinator-to-worker delegation layer but prevents a worker from creating
another layer of agents.

(Previously: agent TOML output location and plugin-bundle exclusion were required, with no delegation-depth setting.)

#### Scenario: Agent TOML output path

- GIVEN `agents/sdd-apply.agent.md`
- WHEN the `codex` profile transforms it
- THEN the output MUST be `.codex/agents/sdd-apply.toml` with `developer_instructions`
  containing the agent body, and this path MUST NOT be referenced from
  `.codex-plugin/plugin.json`

#### Scenario: Generated agent constrains recursive delegation

- GIVEN any canonical agent emitted by the `codex` profile
- WHEN its generated TOML is inspected
- THEN it MUST contain an `[agents]` table with the integer `max_depth = 1`
- AND the TOML MUST remain parseable when `developer_instructions` precedes that table
