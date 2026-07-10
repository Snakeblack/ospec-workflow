# Delta for agents

## ADDED Requirements

### Requirement: Codex TOML Agents Are Valid and Autodetectable For New-Task Invocation {#REQ-agents-010}

Every generated `.codex/agents/*.toml` file (emitted per generator Requirement
REQ-generator-001, agentFile.format: "toml") MUST be syntactically valid TOML and MUST
carry the `name`, `description`, `developer_instructions`, and (when resolvable)
`model`/`sandbox_mode` keys populated such that the Codex host autodetects and can
invoke the file as an agent from a brand-new task, without any manual configuration
step beyond the install performed under install Requirement REQ-install-001. The
orchestrator TOML agent specifically MUST be invocable this way so that a new Codex
task can reach `sdd-propose` → `sdd-orchestrator` and receive a `SessionStart` response
(hooks Requirement REQ-hooks-007) with no manifest, MCP, or hooks warnings.

#### Scenario: New Codex task autodetects and invokes the orchestrator agent

- GIVEN the codex payload has been installed via REQ-install-001
- WHEN a brand-new Codex task starts and looks up available agents
- THEN the orchestrator's TOML agent file is autodetected without manual configuration
- AND invoking it successfully dispatches through to `SessionStart` with no warnings

#### Scenario: Generated TOML fails to parse — autodetection requirement violated

- GIVEN a generated `.codex/agents/*.toml` file contains malformed TOML syntax
- WHEN the Codex host attempts to autodetect agents
- THEN that file MUST be rejected as invalid, which this requirement treats as a defect
  to be caught before install (not an acceptable installed state)

#### Scenario: Missing required keys blocks invocation

- GIVEN a generated TOML agent file lacks a `name` or `description` key
- WHEN the Codex host attempts to list or invoke it
- THEN the agent MUST NOT be considered autodetectable, and this requirement is
  violated for that file
