# sdd-document Specification

## Purpose

The `sdd-document` domain defines the behavior, interactive launch scope gate, and output directory structures of the wiki-generator agent, which compiles repository architecture, specifications, and execution status into local Markdown wiki files.

## Requirements

### Requirement: sdd-document Agent Registration and Command Routing {#REQ-sdd-document-001}

The system MUST define the `sdd-document` agent as a non-user-invocable agent in `agents/sdd-document.agent.md` and map it to the `/sdd-document` slash command via `commands/sdd-document.prompt.md`. The orchestrator MUST route the `/sdd-document` command to the `sdd-document` agent, and the agent MUST be registered in `models.yaml` under the `default` model tier.

#### Scenario: Command routes to sdd-document agent

- GIVEN the user invokes `/sdd-document` command
- WHEN the orchestrator processes the command
- THEN the orchestrator MUST delegate execution to the `sdd-document` agent

#### Scenario: Model tier verification

- GIVEN the `sdd-document` agent is loaded
- WHEN the generator parses agent configuration
- THEN the agent model mapping MUST resolve to the default tier defined in `models.yaml`

---

### Requirement: Interactive Launch Gate and Scope Selection {#REQ-sdd-document-002}

The `sdd-document` agent MUST block launch at startup by returning `status: blocked` with a `question_gate` payload to present the user with a choice of documentation scope options:
- Option A: Full Technical Wiki (OpenWiki style)
- Option B: SDD Status & Specs under `docs/wiki/`
- Option C: Custom freeform

If Option C is selected, the agent MUST validate the user-provided custom output directory and block with a clarification request if the path is fuzzy, invalid, or missing.

#### Scenario: Agent blocks on startup for option choice

- GIVEN the `sdd-document` agent starts execution
- WHEN no scope choice has been approved/recorded
- THEN it MUST return `status: blocked` with a `question_gate` containing Options A, B, and C
- AND the orchestrator MUST present the question gate to the user

#### Scenario: Selection of Option C with valid path

- GIVEN the user selects Option C and provides a valid path `/docs/my-wiki/`
- WHEN the agent resumes execution
- THEN the agent validates the path and proceeds with generating documentation in `/docs/my-wiki/`

#### Scenario: Selection of Option C with fuzzy path

- GIVEN the user selects Option C and provides a fuzzy or invalid path
- WHEN the agent validates the input path
- THEN it MUST return `status: blocked` with a `question_gate` prompting the user to clarify the path

---

### Requirement: Option A OpenWiki Structure Generation {#REQ-sdd-document-003}

When the user selects Option A, the `sdd-document` agent MUST generate documentation files matching the OpenWiki structural layout and quality standards under the `openwiki/` root directory, including compiling a `quickstart.md` index file.

#### Scenario: Option A output generated

- GIVEN the user selects Option A
- WHEN the generation completes successfully
- THEN the generated files MUST be written under the `openwiki/` directory
- AND the output MUST contain `openwiki/quickstart.md` linking to compiled repository details

---

### Requirement: Option B SDD Status and Specs Generation {#REQ-sdd-document-004}

When the user selects Option B, the `sdd-document` agent MUST generate technical documentation consisting of SDD change status and domain specifications, writing all compiled files under the `docs/wiki/` directory.

#### Scenario: Option B output generated

- GIVEN the user selects Option B
- WHEN the generation completes successfully
- THEN the generated files MUST be written under the `docs/wiki/` directory
- AND the files MUST include active change summaries and compiled specifications

---

### Requirement: Option C Custom Path Generation {#REQ-sdd-document-005}

When the user selects Option C and specifies a validated custom directory, the `sdd-document` agent MUST write all generated wiki files into that custom directory hierarchy.

#### Scenario: Option C output generated in custom directory

- GIVEN the user selects Option C and specifies `/tmp/custom-wiki` as the path
- WHEN the generation completes successfully
- THEN the generated files MUST be written under `/tmp/custom-wiki`
