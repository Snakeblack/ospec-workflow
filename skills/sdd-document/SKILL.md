---
name: sdd-document
description: "Generate repository wiki pages mapping architecture, specs, and status. Trigger: orchestrator launches sdd-document."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "2.0"
  delegate_only: true
---

> **ORCHESTRATOR GATE**: If you loaded this skill via the `skill()` tool, you are
> the ORCHESTRATOR — STOP. Do NOT execute these instructions inline. Delegate to
> the dedicated `sdd-document` sub-agent using your platform's delegation primitive
> (e.g., `task(...)`, sub-agent invocation, etc.). This skill is for EXECUTORS
> only.

## Purpose

You are a sub-agent responsible for DOCUMENTATION. You compile repository metadata, baseline specifications, and active change state files into Markdown files, representing the technical wiki of the codebase.

## What You Receive

From the orchestrator:
- Documentation language via parameter `doc_language`
- Change name (or `none` if running in baseline mode)
- Selected scope choice (Option A, Option B, or Option C) via parameter `scope_choice`
- Custom path (when Option C is selected) via parameter `custom_path`
- Artifact store mode (`openspec | none`)

## Execution and Persistence Contract

> Follow **Section B** (retrieval) and **Section C** (persistence) from `skills/_shared/sdd-phase-common.md`.

- Treat `openspec/changes/{change-name}/state.yaml` plus phase artifacts as the canonical workflow state for continuation and recovery; never rely on conversation history.

## What to Do

### Step 1: Load Skills
Follow **Section A** from `skills/_shared/sdd-phase-common.md`.

Additionally, load `skills/cognitive-doc-design/SKILL.md` as a quality reference for all generated content. Its patterns (progressive disclosure, task-oriented structure, scannable formatting, review empathy) apply to every wiki page you produce.

### Step 2: Read Context
Before performing any checks or writes:
1. Read the change state file `openspec/changes/{change-name}/state.yaml` to extract active change info, if present.
2. Read baseline specifications from `openspec/specs/` and config from `openspec/config.yaml`.
3. Check the repository layout to gather metadata (source files, folder structure).
4. Detect whether the approved output directory already contains wiki content (presence of `quickstart.md` and/or `.last-update.json`). Store the result as `mode`:
   - **init** — output directory is empty or does not exist.
   - **update** — output directory already contains wiki files.

#### Git Discipline

Use git actively during discovery and analysis — not just to list files, but to understand WHY code exists:
- `git log --oneline -20` for recent project activity.
- `git log --oneline -- <path>` for history of specific files/directories.
- `git blame <file>` selectively on high-signal files (entry points, configs, key modules) to understand authorship and evolution.
- `git diff --name-only <hash>..HEAD` during update mode to scope changes since last documentation run.
- Do not over-index on ancient history. Focus on recent commits and high-signal files.

#### Security Boundaries

- Do NOT read or document secret values, credentials, private keys, tokens, or `.env` files.
- `.env.example` and sample config files may be read only if they contain placeholders, not live secrets.
- If a secret-bearing file appears relevant, document only that such configuration exists and where non-sensitive setup instructions should live.

### Step 3: Language Selection Gate (REQ-sdd-document-006)

This MUST be the first gate presented to the user, before any other question.

#### 1. If `doc_language` is absent/not provided:
You MUST immediately halt execution and return a launch-blocking `question_gate` payload:
- **status**: `blocked`
- **blocker_type**: `needs_user_decision`
- **executive_summary**: "Documentation language has not been selected for sdd-document."
- **question_gate**: (conforming to the recommendation contract)
  - **reason**: "The documentation language determines the language of all generated wiki content and all subsequent interaction prompts. Guessing incorrectly would require regenerating all documentation files and repeating the scope selection gate."
  - **questions**:
    - **header**: "Documentation Language"
    - **question**: "Select the language for the generated documentation and subsequent prompts:"
    - **options**:
      - **label**: "English"
      - **description**: "Recommended. International standard for technical documentation. Maximizes reach and tooling compatibility. Easily reversible — documentation can be regenerated in another language."
      - **recommended**: true
      - **reversibility**: "High. Documentation can be regenerated in another language."
      - **tradeoff**: "Maximum compatibility with tooling and international teams, but may not suit teams that work primarily in another language."
      - **rationale**: "English is the default language for technical wikis and ensures consistency with code identifiers."
      - **cost_of_guess**: "Regenerating all wiki pages in the correct language and repeating the scope selection."
    - **options**:
      - **label**: "Español"
      - **description**: "Documentation in Spanish. Useful for Spanish-speaking teams. Easily reversible."
      - **recommended**: false
    - **allowFreeformInput**: true

#### 2. Once `doc_language` is resolved:
- Store the resolved language for this execution session.
- All subsequent `question_gate` prompts — including the Scope Selection in Step 4 — MUST be written in the resolved `doc_language`.
- All generated wiki content (Step 6) MUST be written in the resolved `doc_language`.
- Proceed to Step 4.

### Step 4: Launch Gate and Scope Selection (REQ-sdd-document-002)

> All `question_gate` text in this step MUST be presented in the resolved `doc_language`.

Verify if the documentation scope has been selected.

#### 1. If `scope_choice` is absent/not provided:
You MUST immediately halt execution and return a launch-blocking `question_gate` payload:
- **status**: `blocked`
- **blocker_type**: `needs_user_decision`
- **executive_summary**: "Documentation scope has not been selected for sdd-document."
- **question_gate**: (conforming to the recommendation contract: reason must state the cost of an incorrect/guessed decision)
  - **reason**: "Selecting the documentation scope is required to set the target directory and validate tool write boundaries, preventing unauthorized file writes or unintended overwrites of existing documentation."
  - **questions**:
    - **header**: "Documentation Scope"
    - **question**: "Select the target output structure and scope for the repository technical wiki:"
    - **options**:
      - **label**: "Option A"
      - **description**: "Recommended. Full Technical Wiki under openwiki/. Follows the OpenWiki standard layout with a quickstart index and domain-specific guides discovered from the repository structure. Easily reversible."
      - **recommended**: true
      - **reversibility**: "High. Files are generated strictly inside the new openwiki/ directory and can be removed."
      - **tradeoff**: "Generates a complete multi-file wiki, which is comprehensive but requires maintaining several documentation files."
      - **rationale**: "Standardizes documentation matching the OpenWiki format."
      - **cost_of_guess**: "Overwriting existing wiki folders or placing files in incorrect layout structures."
    - **options**:
      - **label**: "Option B"
      - **description**: "Lightweight wiki under docs/wiki/. Same discovery-based content as Option A but placed under an existing docs/ structure. Easily reversible."
      - **recommended**: false
    - **options**:
      - **label**: "Option C"
      - **description**: "Custom path. Prompts for a custom directory path and validates it. Easily reversible."
      - **recommended**: false

#### 2. If `scope_choice` is "Option C":
- Read `custom_path`.
- If `custom_path` is missing, empty, fuzzy, or points to a non-existent/invalid path structure:
  - Return `status: blocked` with `blocker_type: needs_user_decision` and a `question_gate` (in `doc_language`) prompting the user to clarify or provide a valid absolute/relative path.
- If `custom_path` is valid:
  - Proceed using that path as the target output folder.

### Step 5: Enforce Write Sandbox Boundaries (REQ-sdd-document-002)

1. Determine the approved output directory:
   - Option A -> `openwiki/`
   - Option B -> `docs/wiki/`
   - Option C -> `<validated custom path>`
2. **Hard Gate**: You are strictly restricted from editing or writing to any files outside the approved output directory.
3. If any task or write operation targets a file outside this path (e.g. attempting to write to `internal/`, `src/`, or root configuration files), you MUST halt execution, throw a warning/error in the logs, and return `status: blocked` with `blocker_type: design-mismatch` (or throw an execution boundary violation error).

### Step 5b: Planning (REQ-sdd-document-007)

Before writing any wiki files, create a temporary plan file at `{output_dir}/_plan.md`:

1. List every wiki page you intend to create, with:
   - File path relative to output directory.
   - Primary source evidence (files/directories that justify this page).
   - Estimated substance level (high / medium / low).
2. Review the plan for anti-patterns:
   - Any page estimated as "low" → merge into a broader page or quickstart.
   - Any single-file directory → justify or flatten.
   - Total page count exceeds the max-pages guard (see Step 6) → consolidate.
3. The plan file is internal scaffolding. **Delete `{output_dir}/_plan.md` after all wiki files are written** (Step 6 completion). Never include it in the final output.

### Step 6: Document Generation

All generated wiki content MUST be written in the resolved `doc_language`.

The agent MUST discover the project's domains dynamically by analyzing the repository. Never use hardcoded file lists or topic names — the output structure is derived entirely from what the repository contains.

Generate all files strictly inside the approved output directory (resolved in Step 5).

#### Max-Pages Guard

- **init mode**: generate at most **8 wiki pages** (quickstart + up to 7 domain pages). If the repository has more domains, consolidate related domains into broader pages.
- **update mode**: touch only pages whose source evidence changed since the last run. Use the `gitHead` from `.last-update.json` to scope the diff window.

#### Update Mode Behavior

When `mode` is **update**:
1. Read the existing `.last-update.json` to get the previous `gitHead`.
2. Run `git diff --name-only <previous-gitHead>..HEAD` to identify changed source files.
3. Map changed files to affected wiki pages using the domain discovery from Step 6.1.
4. **Surgical edits only**: preserve accurate existing content. Replace stale sentences rather than rewriting entire sections. Do not make formatting-only edits.
5. If no source files changed that affect documentation, report a no-op: do not edit any wiki files.
6. Use a soft diff budget: if fewer than ~5 source files changed, update at most 1-2 wiki pages. If you believe more than 3 wiki pages need edits, justify each before proceeding.

#### 6.1: Domain Discovery

Analyze the repository to identify its logical domains. A domain is a cohesive area of the codebase that warrants its own documentation page. Discovery sources:

1. **Directory structure** — top-level and nested directories often map to domains (e.g., `src/auth/`, `api/`, `agents/`, `lib/`, `cmd/`)
2. **Package/module boundaries** — entry points, exported modules, configuration files
3. **README and existing docs** — existing documentation hints at what the project considers important
4. **Configuration files** — `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, `pom.xml`, etc. reveal tech stack and project shape
5. **Source code analysis** — imports, exports, and cross-references between modules reveal domain boundaries

Typical domain categories (use ONLY what applies to the target project — do not force categories that don't exist):
- Architecture / system overview
- CLI / API / interface usage
- Core workflows / business logic
- Operations / deployment / CI
- Testing strategy
- Agent / plugin system
- Configuration / environment
- Data model / persistence
- Security / authentication

**Anti-pattern**: Do NOT create thin/stub pages with little content. If a domain has insufficient substance, merge it into a broader page or into `quickstart.md` as a section. A page is "thin" if it would contain fewer than ~30 lines of substantive content (excluding headings, blank lines, and source maps). Prefer headings inside broader pages before creating many small directories.

#### 6.2: Generate `quickstart.md`

The root index file. Follow this structure:

1. **Title** — `# {Project name} quickstart`
2. **One-paragraph summary** — what the repository does, derived from README or source
3. **"What this repository does"** — bullet list of key capabilities
4. **"Start here"** — links to all generated domain pages with one-line descriptions
5. **"Key source files"** — annotated list of the most important source files with brief descriptions
6. **"Documentation map"** — compact link list to all domain pages
7. **"Notes for future agents"** — practical advice for AI agents working on this codebase (coupling points, invariants, common pitfalls)
8. **"Source map"** — flat list of all key source file paths, plus git evidence (commit hashes) when available

#### 6.3: Generate Domain Pages

For each discovered domain, generate one file: `{output_dir}/{domain-slug}/{page-name}.md`

Each domain page MUST follow this structure:

1. **Title** — `# {Domain name}`
2. **Opening paragraph** — what this domain does and its role in the system
3. **Main flow / how it works** — step-by-step or narrative explanation of the primary workflow or behavior
4. **Technical details** — implementation specifics, data structures, configuration, provider/adapter patterns as applicable
5. **"Why the architecture is shaped this way"** — rationale for design decisions (omit if the domain is straightforward)
6. **"Major extension points"** — how to extend or modify this domain
7. **"Things to watch when editing"** — gotchas, coupling points, invariants to maintain
8. **"Source map"** — files relevant to this domain, with git evidence (commit hashes) when available

#### Quality Rules

- Content MUST be derived from actual repository files — never invent content
- Use Mermaid diagrams where they clarify architecture or flows
- Cross-reference between wiki pages using relative links
- Keep each page focused and scannable — paragraphs ≤ 4 sentences, tables for structured data, callouts for warnings
- Document the repository for both humans and future agents
- Avoid redundancy — if two domains share context, link instead of duplicating
- Include git evidence (commit hashes) in source maps when available via `git log`
- Use `git blame` and `git log` to explain WHY code exists, not just WHAT files contain
- Do NOT document secrets, credentials, or `.env` file contents
- Each concept gets ONE canonical page — other mentions link to it
- Do NOT create single-file directories unless the page is substantial (>50 lines) and the domain boundary is clear
- Existing accurate documentation should be linked and summarized, not duplicated wholesale
- Heading format: use imperative verbs ("Install the CLI" not "Installation")

### Step 6.4: Generate `.last-update.json`

After all wiki files are written, generate (or update) a `.last-update.json` metadata file in the output directory root:

```json
{
  "updatedAt": "ISO-8601 UTC timestamp",
  "command": "init | update",
  "gitHead": "current HEAD short commit hash via git rev-parse --short HEAD",
  "generator": "sdd-document",
  "version": "2.0",
  "sections": ["list of generated page paths relative to output dir"],
  "stats": {
    "filesGenerated": 0,
    "filesUpdated": 0,
    "filesSkipped": 0
  }
}
```

This file is used by future update runs to scope the git diff window.

### Step 6.5: Cleanup

1. Delete `{output_dir}/_plan.md` if it still exists.
2. Verify no files were written outside the approved output directory.

### Step 7: Return Summary

Upon successful generation, return the standard result envelope:
- **status**: `success`
- **executive_summary**: "Successfully generated repository wiki pages under the approved directory." (include mode: init/update, page count, and any skipped sections)
- **artifacts**: List of all files created/modified during this batch.
- **next_recommended**: "sdd-verify" (or "none")
- **risks**: List any sections that could not be fully generated, with reasons.
- **skill_resolution**: "injected"

Ensure to output the parsed json:result-envelope block as well.
