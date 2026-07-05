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

#### Scenario: Agent tool configuration verification

- GIVEN the `sdd-document` agent is loaded
- WHEN the generator parses agent configuration
- THEN the tools list MUST include 'read', 'search', 'edit', and 'execute'

---

### Requirement: Interactive Launch Gate and Scope Selection {#REQ-sdd-document-002}

The `sdd-document` agent MUST block launch at startup by returning `status: blocked` with a `question_gate` payload to present the user with a choice of documentation scope options:
- Option A: Full Technical Wiki (OpenWiki style)
- Option B: Lightweight wiki under `docs/wiki/`
- Option C: Custom freeform path

The scope-choice question MUST be batched together with the language-selection question (see the batched gate requirement below) into ONE `question_gate` payload containing two independent questions, presented via a single `vscode/askQuestions` call — never as two separate blocking round-trips.

If Option C is selected, the agent MUST validate the user-provided custom output directory and block with a clarification request if the path is fuzzy, invalid, or missing.

The agent MUST enforce a write sandbox: all file writes are strictly restricted to the approved output directory, with the sole exception of the repository's top-level `/AGENTS.md` and `/CLAUDE.md` files (and only to append or update the OpenWiki reference section). If the agent's own write plan would target a file outside the approved path (and not matching the `/AGENTS.md` or `/CLAUDE.md` exception), it MUST halt execution and return `status: blocked` with `blocker_type: design-mismatch` before performing that write.

The agent's own pre-write self-check is NOT sufficient evidence of overall sandbox compliance and MUST NOT be presented as such: the authoritative, independent verification that no write landed outside the approved sandbox is an orchestrator-owned post-run step (see `openspec/specs/agents/spec.md`, Orchestrator-Owned Post-Run Sandbox Inventory Verification). The agent MUST NOT self-certify sandbox compliance in its return envelope as a substitute for that orchestrator check.

(Previously: scope-choice gate was presented independently, without a batching requirement, and the write-sandbox paragraph did not address the executor/orchestrator verification split.)

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
- WHEN a write operation targets a file outside the approved directory (other than `/AGENTS.md` or `/CLAUDE.md` for the OpenWiki reference section)
- THEN the agent MUST halt execution and return `status: blocked` with `blocker_type: design-mismatch`

#### Scenario: Agent does not self-certify sandbox compliance

- GIVEN the `sdd-document` agent completes a run with no self-detected sandbox violation
- WHEN it composes its return envelope
- THEN it MUST NOT claim final, authoritative sandbox compliance in place of the orchestrator's independent post-run inventory check
- AND the orchestrator still performs that check before closing the route

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

### Requirement: Batched Language and Scope Selection Gate {#REQ-sdd-document-006}

The `sdd-document` agent MUST present language selection and scope selection as ONE batched `question_gate` — two independent questions delivered in a single `vscode/askQuestions` call — rather than as two separate blocking round-trips. The gate determines the language for all generated wiki content and all subsequent interaction prompts, and the documentation scope (Options A/B/C, per the launch-gate requirement above).

In **init mode** (no persisted `.last-update.json`, or the persisted metadata lacks `doc_language`/`scope_choice`), the agent MUST ask both questions together at startup. The language question MUST offer at minimum English (recommended) and Spanish, with freeform input allowed.

In **update mode**, when the persisted `.last-update.json` already carries values for both `doc_language` and `scope_choice`, the agent MUST skip both gates and reuse the persisted values without asking. An explicit parameter override — `doc_language` or `scope_choice` passed explicitly in the launch parameters — MUST force re-asking only the overridden question, even in update mode.

To give the user an actual, user-facing path to this override, the agent MUST present a short yes/no pre-question at the start of every update-mode run — before checking for an explicit parameter override — asking whether to keep the persisted `doc_language`/`scope_choice` or change them ("Keep previous documentation language and scope, or change them?"). If the user answers to keep them, the agent proceeds using the persisted values without further asking. If the user answers to change them, the agent MUST treat that as the explicit parameter override for only the field(s) the user selects to change, and re-ask only the corresponding question(s) (language, scope, or both), reusing the persisted value for any field not selected for change.

Once resolved (by answer or by reuse from persisted metadata), all subsequent gates and generated content MUST use the resolved language and scope.

(Previously: language selection was a standalone gate required to run FIRST before any other question, asked independently of the scope-choice gate, with no persisted skip-in-update behavior.)

#### Scenario: Init mode — batched gate asks both questions together

- GIVEN the `sdd-document` agent starts execution with no persisted `.last-update.json`
- WHEN it composes its launch gate
- THEN it MUST return `status: blocked` with ONE `question_gate` containing both the language question (English recommended) and the scope-choice question (Options A, B, C)
- AND both questions are delivered via a single `vscode/askQuestions` call

#### Scenario: Update mode — gate skipped when metadata already resolved

- GIVEN `.last-update.json` already contains `doc_language: "en"` and `scope_choice: "A"`
- AND no explicit parameter override is passed
- AND the user answered the keep/change pre-question with "keep"
- WHEN the agent starts execution in update mode
- THEN it MUST skip the batched gate entirely and reuse the persisted `doc_language` and `scope_choice` values

#### Scenario: Explicit parameter override re-asks only that question

- GIVEN `.last-update.json` already contains `doc_language` and `scope_choice`
- AND the user answered the keep/change pre-question with "change" for language only (equivalent to an explicit `doc_language` override in the launch parameters)
- WHEN the agent starts execution in update mode
- THEN it MUST re-ask only the language question, reusing the persisted `scope_choice` without re-asking it

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

After all wiki files are written, the agent MUST generate (or update) a `.last-update.json` metadata file in the output directory root containing: `updatedAt` (ISO-8601 UTC), `command` (init/update), `gitHead` (current HEAD short commit hash), `generator` (sdd-document), `version`, `sections` (list of generated page paths), `stats` (filesGenerated, filesUpdated, filesSkipped), `doc_language` (the resolved language code from the batched gate), and `scope_choice` (the resolved scope option, `A`/`B`/`C`).

The `doc_language` and `scope_choice` fields exist so that a subsequent update-mode run can skip the batched gate (per the Batched Language and Scope Selection Gate requirement above) by reading these persisted values instead of re-asking.

(Previously: the metadata schema did not carry `doc_language` or `scope_choice`, because the batched-gate skip-in-update behavior did not exist.)

#### Scenario: Metadata file generated on init

- GIVEN the agent completes an init run
- WHEN writing the `.last-update.json`
- THEN `command` MUST be `init`
- AND `gitHead` MUST match the current `git rev-parse --short HEAD`

#### Scenario: Metadata carries doc_language and scope_choice

- GIVEN the agent completes any run (init or update)
- WHEN writing the `.last-update.json`
- THEN it MUST include `doc_language` and `scope_choice` reflecting the values resolved for that run

#### Scenario: Update-mode run reads persisted fields to skip the gate

- GIVEN `.last-update.json` from a prior run contains `doc_language` and `scope_choice`
- WHEN a later update-mode run starts with no explicit parameter override
- THEN it reads those persisted fields and skips the batched gate, per the Batched Language and Scope Selection Gate requirement

## Clarifications

### Session 2026-07-05

- Q: REQ-sdd-document-006 lets the orchestrator force a re-ask via an "explicit parameter override" in update mode, but no command surface (argument-hint, flag) currently exists for the user to request this. Should route-document.md add a lightweight pre-question in update mode ("keep previous language/scope or change them?"), or leave the override purely as an internal/non-interactive parameter with no user-facing trigger in this change? → A: Add a short yes/no pre-question at the start of update-mode runs ("Keep previous documentation language and scope, or change them?"); answering "change" triggers the override for the selected field(s) only.

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

---

### Requirement: Root Agent Instruction Files Mapping {#REQ-sdd-document-013}

Unless the user explicitly asks not to, the `sdd-document` agent MUST verify whether the repository's top-level agent instruction files (`/AGENTS.md` and/or `/CLAUDE.md`) exist, and add or update the OpenWiki reference section there. If both exist, the same section MUST be added to both. If neither exists, it MUST create a top-level `/AGENTS.md` containing only the OpenWiki reference section.

The OpenWiki reference section MUST use the exact markdown structure:
```markdown
## OpenWiki

This repository has documentation located in the /openwiki directory.

Start here:
- [OpenWiki quickstart](openwiki/quickstart.md)

OpenWiki includes repository overview, architecture notes, workflows, domain concepts, operations, integrations, testing guidance, and source maps.

When working in this repository, read the OpenWiki quickstart first, then follow its links to the relevant architecture, workflow, domain, operation, and testing notes.
```

During update runs, the agent MUST inspect the reference section and refresh it only if the section is missing or semantically stale. The agent MUST NOT edit `/AGENTS.md` or `/CLAUDE.md` only to normalize formatting, blank lines, wrapping, or punctuation if the existing OpenWiki section is already semantically correct.

#### Scenario: Inject reference section into AGENTS.md

- GIVEN `/AGENTS.md` exists and does not contain the OpenWiki reference section
- WHEN the agent completes document generation
- THEN it MUST append the OpenWiki reference section to `/AGENTS.md`
- AND it MUST preserve all surrounding instructions in `/AGENTS.md`

#### Scenario: Both AGENTS.md and CLAUDE.md exist

- GIVEN both `/AGENTS.md` and `/CLAUDE.md` exist and do not contain the OpenWiki reference section
- WHEN the agent completes document generation
- THEN it MUST append the OpenWiki reference section to both `/AGENTS.md` and `/CLAUDE.md`
- AND it MUST ensure the exact same reference section is duplicated in both files

#### Scenario: Neither AGENTS.md nor CLAUDE.md exists

- GIVEN neither `/AGENTS.md` nor `/CLAUDE.md` exists in the repository
- WHEN the agent completes document generation
- THEN it MUST create a top-level `/AGENTS.md` containing only the OpenWiki reference section

#### Scenario: Reference section is semantically correct on update run

- GIVEN `/AGENTS.md` exists and contains a semantically correct OpenWiki reference section
- WHEN the agent runs in update mode
- THEN it MUST NOT edit `/AGENTS.md` for formatting-only changes

#### Scenario: Reference section is semantically stale on update run

- GIVEN `/AGENTS.md` exists and contains a semantically stale OpenWiki reference section
- WHEN the agent runs in update mode
- THEN it MUST update `/AGENTS.md` with the exact correct OpenWiki reference section
