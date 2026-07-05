# sdd-document Specification

## Purpose

The `sdd-document` domain defines the behavior, interactive launch gates, and output directory structures of the wiki-generator agent, which compiles repository architecture, specifications, and execution status into local Markdown wiki files following Cognitive Documentation Design principles.

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
- Option B: Lightweight wiki under `docs/wiki/`
- Option C: Custom freeform path

If Option C is selected, the agent MUST validate the user-provided custom output directory and block with a clarification request if the path is fuzzy, invalid, or missing.

The agent MUST enforce a write sandbox: all file writes are strictly restricted to the approved output directory. Any write operation targeting a file outside the approved path MUST halt execution and return `status: blocked` with `blocker_type: design-mismatch`.

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

#### Scenario: Write sandbox violation

- GIVEN the agent has approved output directory
- WHEN a write operation targets a file outside the approved directory
- THEN the agent MUST halt execution and return `status: blocked` with `blocker_type: design-mismatch`

---

### Requirement: Option A OpenWiki Structure Generation {#REQ-sdd-document-003}

When the user selects Option A, the `sdd-document` agent MUST generate documentation files matching the OpenWiki structural layout and quality standards under the `openwiki/` root directory, including compiling a `quickstart.md` index file with dynamically discovered domain pages.

#### Scenario: Option A output generated

- GIVEN the user selects Option A
- WHEN the generation completes successfully
- THEN the generated files MUST be written under the `openwiki/` directory
- AND the output MUST contain `openwiki/quickstart.md` linking to compiled repository details
- AND the output MUST contain a `.last-update.json` metadata file

---

### Requirement: Option B Lightweight Wiki Generation {#REQ-sdd-document-004}

When the user selects Option B, the `sdd-document` agent MUST generate technical documentation using the same dynamic domain discovery as Option A, writing all compiled files under the `docs/wiki/` directory.

#### Scenario: Option B output generated

- GIVEN the user selects Option B
- WHEN the generation completes successfully
- THEN the generated files MUST be written under the `docs/wiki/` directory
- AND the files MUST include a `quickstart.md` index and domain-specific pages

---

### Requirement: Option C Custom Path Generation {#REQ-sdd-document-005}

When the user selects Option C and specifies a validated custom directory, the `sdd-document` agent MUST write all generated wiki files into that custom directory hierarchy.

#### Scenario: Option C output generated in custom directory

- GIVEN the user selects Option C and specifies `/tmp/custom-wiki` as the path
- WHEN the generation completes successfully
- THEN the generated files MUST be written under `/tmp/custom-wiki`

---

### Requirement: Language Selection Gate {#REQ-sdd-document-006}

The `sdd-document` agent MUST present a language selection gate as the FIRST gate before any other question. The gate determines the language for all generated wiki content and all subsequent interaction prompts.

If `doc_language` is absent or not provided, the agent MUST return `status: blocked` with a `question_gate` conforming to the recommendation contract, offering at minimum English (recommended) and Spanish, with freeform input allowed.

Once resolved, all subsequent gates and generated content MUST use the resolved language.

#### Scenario: Language gate blocks on missing language

- GIVEN the `sdd-document` agent starts execution
- WHEN `doc_language` is not provided
- THEN it MUST return `status: blocked` with a `question_gate` for language selection
- AND the English option MUST be marked as recommended

#### Scenario: Language propagates to all output

- GIVEN the user selects Spanish as the documentation language
- WHEN the generation completes
- THEN all wiki content MUST be written in Spanish
- AND all subsequent gate prompts MUST be presented in Spanish

---

### Requirement: Planning Step {#REQ-sdd-document-007}

Before writing any wiki files, the agent MUST create a temporary plan file at `{output_dir}/_plan.md` listing every intended wiki page with its source evidence and estimated substance level. The plan MUST be reviewed for anti-patterns (thin pages, single-file directories, exceeding max-pages guard) before proceeding with generation.

The plan file MUST be deleted after all wiki files are written. It MUST NOT appear in the final output.

#### Scenario: Plan file lifecycle

- GIVEN the agent has resolved scope and language
- WHEN it begins document generation
- THEN it MUST create `{output_dir}/_plan.md` before writing any wiki pages
- AND it MUST delete `{output_dir}/_plan.md` after all wiki pages are written

#### Scenario: Thin page detected in plan

- GIVEN the plan lists a page with estimated substance level "low"
- WHEN the agent reviews the plan
- THEN it MUST merge that page into a broader page or quickstart
- AND it MUST NOT create a standalone page for the thin domain

---

### Requirement: Init and Update Mode Detection {#REQ-sdd-document-008}

The agent MUST detect whether the approved output directory already contains wiki content (`quickstart.md` and/or `.last-update.json`) and operate in the appropriate mode:

- **init mode**: Output directory is empty or does not exist. Generate all pages from scratch. Maximum 8 wiki pages (quickstart + up to 7 domain pages).
- **update mode**: Output directory already contains wiki files. Use the `gitHead` from `.last-update.json` to scope the diff window. Apply surgical edits only — preserve accurate existing content, replace stale sentences rather than rewriting entire sections. Do not make formatting-only edits.

#### Scenario: Init mode on empty directory

- GIVEN the approved output directory does not contain `quickstart.md`
- WHEN the agent detects mode
- THEN it MUST operate in init mode
- AND it MUST NOT generate more than 8 wiki pages

#### Scenario: Update mode with no changes

- GIVEN the approved output directory contains wiki files and `.last-update.json`
- AND no source files have changed since the recorded `gitHead`
- WHEN the agent runs in update mode
- THEN it MUST report a no-op and NOT edit any wiki files

#### Scenario: Update mode with limited changes

- GIVEN fewer than 5 source files changed since the last run
- WHEN the agent runs in update mode
- THEN it MUST update at most 1-2 wiki pages

---

### Requirement: Git Discipline {#REQ-sdd-document-009}

The agent MUST use git actively during discovery and analysis to understand WHY code exists, not just to list files. Required git operations:
- `git log` for recent project activity and file-specific history
- `git blame` selectively on high-signal files
- `git diff --name-only` during update mode to scope changes

The agent MUST NOT over-index on ancient history. Focus on recent commits and high-signal files.

#### Scenario: Git evidence in source maps

- GIVEN the agent generates a domain page
- WHEN writing the source map section
- THEN it MUST include commit hashes as evidence when available via `git log`

---

### Requirement: Security Boundaries {#REQ-sdd-document-010}

The agent MUST NOT read or document secret values, credentials, private keys, tokens, or `.env` files. `.env.example` and sample config files may be read only if they contain placeholders, not live secrets.

#### Scenario: Secret file encountered

- GIVEN the agent discovers a `.env` file during discovery
- WHEN analyzing project configuration
- THEN it MUST NOT read the file contents
- AND it MAY document that such configuration exists without revealing values

---

### Requirement: `.last-update.json` Metadata {#REQ-sdd-document-011}

After all wiki files are written, the agent MUST generate (or update) a `.last-update.json` metadata file in the output directory root containing: `updatedAt` (ISO-8601 UTC), `command` (init/update), `gitHead` (current HEAD short commit hash), `generator` (sdd-document), `version`, `sections` (list of generated page paths), and `stats` (filesGenerated, filesUpdated, filesSkipped).

#### Scenario: Metadata file generated on init

- GIVEN the agent completes an init run
- WHEN writing the `.last-update.json`
- THEN `command` MUST be `init`
- AND `gitHead` MUST match the current `git rev-parse --short HEAD`

---

### Requirement: Cognitive Documentation Design Quality {#REQ-sdd-document-012}

The agent MUST load `skills/cognitive-doc-design/SKILL.md` as a quality reference and apply its patterns to all generated content:
- Progressive disclosure (summary → concepts → reference)
- Task-oriented structure (imperative verb headings)
- Scannable formatting (paragraphs ≤ 4 sentences, tables for structured data, callouts for warnings)
- Each concept gets ONE canonical page — other mentions link to it
- No thin/stub pages (< ~30 lines of substantive content)
- No single-file directories unless the page is substantial (>50 lines)

#### Scenario: Quickstart follows progressive disclosure

- GIVEN the agent generates `quickstart.md`
- WHEN the user reads the file
- THEN the first section MUST be a one-paragraph summary answering "what is this project?"
- AND it MUST include sections for "Start here", "Key source files", "Documentation map", and "Notes for future agents"
