# Delta for agents

## ADDED Requirements

### Requirement: sdd-document Catalog Registration {#REQ-agents-002}

The `sdd-document` agent MUST be registered in the SDD agent catalog. It is a utility executor agent configured with `user-invocable: false` and abstract tools `read`, `search`, `edit`, and `execute`.

#### Scenario: sdd-document present in catalog

- GIVEN the orchestrator loads the agent catalog from the `agents` spec
- WHEN the generator processes the catalog
- THEN it MUST find the `sdd-document` agent listed with the corresponding configuration

---

### Requirement: sdd-document Command Roster Registration {#REQ-agents-003}

The `/sdd-document` slash command MUST be registered in the orchestrator command roster and mapped to the `sdd-orchestrator` agent, routing execution dynamically to the `sdd-document` agent.

#### Scenario: sdd-document command in roster

- GIVEN the orchestrator command parser loads command mappings
- WHEN it evaluates `/sdd-document`
- THEN it routes the command to the orchestrator which delegates to the `sdd-document` agent

---

### Requirement: sdd-document Launch Gate Mapping {#REQ-agents-004}

The orchestrator MUST support launch-blocking logic when invoking the `sdd-document` agent, halting execution and prompting the user with a `question_gate` containing the documentation scope selection (Options A, B, and C).

#### Scenario: Launch gate blocks orchestrator dispatch

- GIVEN the orchestrator is dispatching the `sdd-document` agent
- WHEN the agent returns `status: blocked` with a `question_gate`
- THEN the orchestrator MUST present the questions to the user and await approved choices
