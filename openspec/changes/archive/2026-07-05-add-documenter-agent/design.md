# Design: Add Documenter Agent

## Technical Approach

Introduce a new documentation agent `sdd-document` and register the companion slash command `/sdd-document`. This agent operates as a standard SDD executor to compile repository metadata, baseline specifications, and active change state files into Markdown files.

To prevent premature execution and allow flexibility, the agent implements an interactive launch gate (`question_gate`) at startup. The gate presents the user with three documentation scope options: Option A (Full Technical Wiki, OpenWiki style under `openwiki/`), Option B (SDD Status & Specs under `docs/wiki/`), or Option C (Custom freeform path with verification).

No modifications to the generator's core CLI transformation scripts (`scripts/configure/cli.js` or `scripts/lib/target-transform.js`) are required, as the configure build pipeline already traverses `agents/`, `commands/`, and `skills/` recursively. Adding the new files to these source directories is sufficient to automatically distribute them across target layout folders (e.g. `dist/`).

## Architecture Decisions

### Decision: sdd-document as a Dedicated Executor Agent

| Option | Tradeoff | Decision |
|---|---|---|
| Inline in `sdd-orchestrator` | Violates executor boundary; increases orchestrator context size. | **Rejected** |
| Standalone CLI tool script | Bypasses LLM-driven synthesis of repository state, drift, and specs. | **Rejected** |
| Dedicated executor agent `sdd-document` | Enforces coordinator-executor split; standard routing; scoped tools. | **Selected** |

**Choice**: Define `agents/sdd-document.agent.md` as a non-user-invocable (`user-invocable: false`) agent, route the `/sdd-document` command through the orchestrator, and map the agent to the `default` tier in `models.yaml`.
**Alternatives considered**: Inline execution in the orchestrator or a standalone CLI script.
**Rationale**: Adheres to the coordinator-executor split, ensuring tool boundaries (restricted write paths) are strictly enforced and model routing is parameterized via `models.yaml`.

### Decision: Interactive Launch Gate for Scope Selection

| Option | Tradeoff | Decision |
|---|---|---|
| Run with a hardcoded output directory | Simple, but lacks flexibility and risks overwriting existing wikis without consent. | **Rejected** |
| Interactive command-line prompts | Violates the declarative agent model and complicates orchestrator task handling. | **Rejected** |
| Return `status: blocked` with `question_gate` | Fits SDD common protocol; lets the orchestrator handle UI; supports structured options and custom path validation. | **Selected** |

**Choice**: Implement a launch-blocking `question_gate` in the `sdd-document` startup flow, presenting Option A (Full Wiki), Option B (Status/Specs), and Option C (Custom path with verification).
**Alternatives considered**: Hardcoded output directory or CLI arguments.
**Rationale**: Aligns with the SDD common protocol. Offloads UI interaction to the orchestrator, allowing the user to select the appropriate scope or provide custom inputs before execution begins.

### Decision: Wiki Output Structures and Path Options

| Option | Tradeoff | Decision |
|---|---|---|
| Single monolithic wiki file | Hard to navigate; does not scale for large repository structures. | **Rejected** |
| Multi-file docs/wiki/ layout (Option B) | Good for simple SDD tracking, but lacks deep architectural/operations guides. | **Selected (Option B)** |
| OpenWiki Quality Structure (Option A) | Highest quality; provides Quickstart, Architecture, Workflows, Testing, and Operations folders. | **Selected (Option A)** |
| Custom Freeform Path (Option C) | Most flexible; requires path validation to avoid directory traversal risks. | **Selected (Option C)** |

**Choice**: Support three distinct generation paths:
1. **Option A (OpenWiki Style)**: Outputs to `openwiki/` with a root `quickstart.md` index and subdirectories for `architecture/`, `workflows/`, `testing/`, and `operations/`.
2. **Option B (SDD Focus)**: Outputs `architecture.md`, `specs.md`, and `status.md` directly under `docs/wiki/`.
3. **Option C (Custom)**: Outputs to a validated user-defined folder.
**Alternatives considered**: Single directory layout.
**Rationale**: Option A matches the OpenWiki specification for repository documentation. Option B provides a lightweight SDD status tracker. Option C ensures portability to different folder configurations.

### Decision: Tool Boundaries and Write Restrictions

| Option | Tradeoff | Decision |
|---|---|---|
| Grant unrestricted write access | Risk of writing files in arbitrary directories or overwriting source code. | **Rejected** |
| Restrict write access to `docs/wiki/` only | Prevents Option A (`openwiki/`) and Option C from working. | **Rejected** |
| Dynamic sandbox restriction based on scope choice | Safest; restricts `edit` / write actions to the approved path only. | **Selected** |

**Choice**: Enforce strict tool boundaries by dynamically restricting all `edit`/write operations to the output directory selected and approved via the launch gate.
**Alternatives considered**: Unrestricted write access or static restriction to `docs/wiki/`.
**Rationale**: Secures the execution environment. The agent can only read/search repository context but cannot modify any files outside the designated target folder (e.g. `openwiki/`, `docs/wiki/`, or the validated custom path).

## Data Flow

The `sdd-document` agent reads configuration, baseline specifications, and active change state files to synthesize them into markdown files under the approved target path.

```
                                 ┌────────────────────────┐
                                 │  openspec/config.yaml  │
                                 └───────────┬────────────┘
                                             │ (read)
             ┌───────────────────────┐       ▼       ┌────────────────────────┐
             │   openspec/specs/     ├───────────────┤   openspec/changes/    │
             │  (baseline specs)     │               │ (active change states) │
             └───────────┬───────────┘               └───────────┬────────────┘
                         │ (read)                                │ (read)
                         ▼                                       ▼
                 ┌───────────────────────────────────────────────────┐
                 │              sdd-document Agent (LLM)             │
                 └───────────────────────────┬───────────────────────┘
                                             │ (write tool)
                                             ▼
                     ┌───────────────────────┴───────────────────────┐
                     │          Strict Write Sandbox Boundaries      │
                     └───────────────────────┬───────────────────────┘
                                             │
             ┌───────────────────────────────┼──────────────────────────────┐
             ▼ (Option A Selected)           ▼ (Option B Selected)          ▼ (Option C Selected)
      ┌──────────────┐                ┌──────────────┐               ┌──────────────┐
      │  openwiki/   │                │  docs/wiki/  │               │ Custom Path  │
      │  (OpenWiki)  │                │    (SDD)     │               │  (Validated) │
      └──────────────┘                └──────────────┘               └──────────────┘
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `agents/sdd-document.agent.md` | Create | New agent definition file with frontmatter and references to skill/common files. |
| `commands/sdd-document.prompt.md` | Create | New command roster file for routing `/sdd-document` to the orchestrator. |
| `skills/sdd-document/SKILL.md` | Create | New skill file detailing compilation instructions, launch gate, and directory structures. |
| `models.yaml` | Modify | Add model tier routing for `sdd-document` under `default` tier. |
| `openspec/specs/agents/spec.md` | Modify | Update the catalog list and scenarios to include `sdd-document`. |
| `openspec/specs/sdd-document/spec.md` | Create | Target baseline specification file for the `sdd-document` domain. |

## Interfaces / Contracts

### 1. Agent Metadata Structure (`agents/sdd-document.agent.md`)
```yaml
---
name: sdd-document
description: 'Generate repository wiki pages mapping architecture, specs, and status.'
tools: ['read', 'search', 'edit', 'execute']
# model intentionally omitted. Routing is controlled by models.yaml.
user-invocable: false
target: vscode
---
```

### 2. Command Prompt Structure (`commands/sdd-document.prompt.md`)
```yaml
---
name: sdd-document
description: "Generate wiki pages detailing repository architecture, specifications, and status."
agent: sdd-orchestrator
argument-hint: ""
tools: ['agent', 'read', 'search', 'edit', 'execute']
---
Run the documentation generation phase through the orchestrator.
```

### 3. Model Tier Routing Mapping (`models.yaml`)
```yaml
agents:
  sdd-design: premium
  ...
  sdd-document: default
```

### 4. Interactive Launch Gate Block Payload (`json:result-envelope`)
```json
{
  "status": "blocked",
  "blocker_type": "needs_user_decision",
  "executive_summary": "Documentation scope has not been selected for sdd-document.",
  "question_gate": {
    "reason": "Selecting the documentation scope is required to set the target directory and validate tool write boundaries, preventing unauthorized file writes.",
    "questions": [
      {
        "header": "Documentation Scope",
        "question": "Select the target output structure and scope for the repository technical wiki:",
        "options": [
          {
            "label": "Option A",
            "description": "Recommended. Full Technical Wiki under openwiki/ (quickstart.md index + architecture, workflows, testing, and operations guides). Easily reversible.",
            "recommended": true
          },
          {
            "label": "Option B",
            "description": "SDD Status & Specs under docs/wiki/ (architecture.md, specs.md, status.md). Easily reversible.",
            "recommended": false
          },
          {
            "label": "Option C",
            "description": "Custom path. Prompts for a custom directory path and validates it. Easily reversible.",
            "recommended": false
          }
        ],
        "multiSelect": false,
        "allowFreeformInput": true
      }
    ]
  },
  "artifacts": [],
  "next_recommended": "Ask user, then rerun this phase.",
  "risks": ["Guessing the scope might overwrite existing documentation or write files to undesired locations."],
  "skill_resolution": "injected"
}
```

### 5. Option A Directory Layout & File Contracts
If Option A is selected, the documentation structure generated inside the `openwiki/` directory is as follows:
- `openwiki/quickstart.md`: The root index file of the wiki. It provides a repository overview, links to the guides, list of key source files, and a source map.
- `openwiki/architecture/overview.md`: Contains architecture overview, design patterns, technology stack description, target outputs, and system diagrams.
- `openwiki/workflows/agent-flows.md`: Describes agent execution flows, hooks, lifecycle events, and coordination/execution routes (e.g., standard, lite, bugfix, hotfix routes).
- `openwiki/testing/guidelines.md`: Detailing the testing framework (Node.js native test runner), test commands, test execution rules, and layers (unit/integration).
- `openwiki/operations/governance.md`: Detailing version conventions, model tiers, conventional commits, and generator release flows.

## Testing Strategy

Testing will follow the codebase native Node.js test runner conventions (`scripts/**/*.test.js`).

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit / Integration | Transform output validation | Run `scripts/configure/cli.js --target vscode` and verify that `dist/vscode/agents/sdd-document.agent.md` and `dist/vscode/commands/sdd-document.prompt.md` are correctly generated. |
| Unit / Integration | Schema validation | Verify `models.yaml` and target profiles parse correctly via existing configure validate pipeline tests. |
| Integration | Launch gate block | Assert that invoking `sdd-document` without a pre-approved scope choice returns the blocked `question_gate` payload. |
| Integration | Option C verification | Test path validation logic (valid path goes through, empty/fuzzy path triggers clarification block). |
| Integration | Tool boundaries | Verify that the agent throws a warning/error and blocks any file edit/write operations targeting paths outside the selected approved directory. |
| E2E | Compilation and generation | Mock a repository with sample specs and run the agent to verify directories are successfully created and files are populated for Option A and Option B respectively. |

## Migration / Rollout

No data migration required. Rollout proceeds through the standard build/generator update:
1. Implement source files.
2. Run generator `node scripts/configure/cli.js --target <target>` to output targets.
3. Validate and commit to main.

## Open Questions

None.
