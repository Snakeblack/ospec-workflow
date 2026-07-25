# Delta for sdd-document

## MODIFIED Requirements

### Requirement: sdd-document Agent Registration and Command Routing {#REQ-sdd-document-001}

The system MUST define the `sdd-document` agent as a non-user-invocable agent in `agents/sdd-document.agent.md` and map it to the `/sdd-document` slash command via `commands/sdd-document.prompt.md`. The orchestrator MUST route the `/sdd-document` command to the `sdd-document` agent, and the agent MUST be registered in `models.yaml` under the `cheap` model tier.

(Previously: `sdd-document` was required to use the `default` model tier.)

#### Scenario: Command routes to sdd-document agent

- GIVEN the user invokes `/sdd-document` command
- WHEN the orchestrator processes the command
- THEN the orchestrator MUST delegate execution to the `sdd-document` agent

#### Scenario: Model tier verification

- GIVEN the `sdd-document` agent is loaded
- WHEN the generator parses agent configuration
- THEN the agent model mapping MUST resolve to the cheap tier defined in `models.yaml`

#### Scenario: Agent tool configuration verification

- GIVEN the `sdd-document` agent is loaded
- WHEN the generator parses agent configuration
- THEN the tools list MUST include 'read', 'search', 'edit', and 'execute'
