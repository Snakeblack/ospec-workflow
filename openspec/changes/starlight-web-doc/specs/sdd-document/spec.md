# Delta for sdd-document

## ADDED Requirements

### Requirement: Option D OpenWiki + Starlight Web Scaffold Generation {#REQ-sdd-document-014}

When the user selects Option D, the `sdd-document` agent MUST generate the full `openwiki/` structure identically to Option A, AND additionally write a static Starlight scaffold under `web-doc/` consisting of exactly this file set: `package.json`, `astro.config.mjs`, `content.config.ts`, `tsconfig.json`, and a CSS custom-properties file under `web-doc/src/styles/`. The agent MUST NOT run `npm create astro`, `npm create`, `npm install`, or any other package-manager install/scaffold command — every scaffold file MUST be written directly as templated static content via the `edit`/`write` tool.

The agent MUST NOT write any authored content into `web-doc/src/content/docs/` during generation; that directory is populated exclusively by the sync script (see the sync requirement below), never by direct agent writes.

On any run with scope D — init mode or update mode alike, including when `web-doc/` already contains files not created by a prior Option D run (e.g. a pre-existing directory) — the agent MUST treat the static scaffold files as idempotent: it writes each scaffold file only if that specific file is missing, and MUST NOT overwrite an existing file of the same name, whether that file originated from this agent or from elsewhere. This uniform rule avoids a separate "foreign content" detection path: the agent never inspects or judges the origin of an existing scaffold-slot file, it only checks presence.

#### Scenario: Option D output generated — dual output, no installers run

- GIVEN the user selects Option D
- WHEN the generation completes successfully
- THEN `openwiki/` is generated identically to Option A
- AND `web-doc/` contains exactly the scaffold file set (`package.json`, `astro.config.mjs`, `content.config.ts`, `tsconfig.json`, a CSS custom-properties file)
- AND no `npm create`/`npm install`/scaffold-installer command was executed

#### Scenario: web-doc/src/content/docs/ has no authored content at generation time

- GIVEN Option D generation has just completed
- WHEN the agent inspects `web-doc/src/content/docs/`
- THEN it MUST NOT contain any file written directly by the agent
- AND its population is deferred entirely to the sync script

#### Scenario: Update-mode run does not rewrite existing scaffold files

- GIVEN `web-doc/package.json` already exists — whether from a prior Option D run in update mode, or found already present the first time the agent runs with scope D (init mode)
- WHEN the agent (re-)runs with scope D
- THEN it MUST NOT overwrite the existing scaffold files
- AND it MAY only re-run the sync-script wiring check to confirm `predev`/`prebuild` are still present

---

### Requirement: OpenWiki-to-Web-Doc Sync Script {#REQ-sdd-document-015}

Under Option D, `web-doc/package.json` MUST declare `predev` and `prebuild` scripts that invoke a sync script — itself part of the static scaffold, written (never installed) by the agent — that transforms `openwiki/` into `web-doc/src/content/docs/`. `openwiki/` remains the single source of truth; files under `web-doc/src/content/docs/` MUST always be treated as generated sync output, never as an authored location.

The sync script MUST be efficient: it MUST only re-transform pages that changed since the prior sync (e.g. via mtime or content-hash comparison), rather than unconditionally rewriting every page on each invocation.

#### Scenario: predev and prebuild wired to the sync script

- GIVEN `web-doc/package.json` is generated under Option D
- WHEN its `scripts` block is inspected
- THEN both `predev` and `prebuild` MUST invoke the sync script

#### Scenario: Incremental sync skips unchanged pages

- GIVEN one `openwiki/` page changed since the last sync and nine did not
- WHEN the sync script runs via `predev`/`prebuild`
- THEN it MUST only re-transform the one changed page

---

### Requirement: Web Frontmatter Injection {#REQ-sdd-document-016}

The sync script MUST inject a `title` frontmatter field into every transformed page, satisfying the Starlight content schema (see `skills/stack-starlight/SKILL.md`, which fails the build without `title`). `title` MUST be derived from the source openwiki page's first heading, falling back to a humanized filename when no heading exists. The sync script MAY also inject an optional `description` field derived from the page's opening summary paragraph.

#### Scenario: Title injected from an openwiki page lacking frontmatter

- GIVEN an `openwiki/` page has no frontmatter and starts with `# Architecture Overview`
- WHEN the sync script transforms it
- THEN the resulting web page's frontmatter MUST include `title: Architecture Overview`

#### Scenario: Build-required title is always present

- GIVEN any `openwiki/` page, regardless of its own structure
- WHEN the sync script transforms it into `web-doc/src/content/docs/`
- THEN the transformed page's frontmatter MUST always include a non-empty `title`

---

### Requirement: Source Link Rewriting to Remote Repository {#REQ-sdd-document-017}

The sync script MUST rewrite links in transformed pages that reference repository source files (e.g. paths under `src/`, `scripts/`, or other non-`openwiki/` repository paths) into absolute links pointing at the remote repository host, using the configured `origin` remote URL and the repository's default branch name (e.g. `main`) as the ref — never a fixed commit SHA, so links keep tracking the latest content on that branch. Links between openwiki pages themselves (wiki-internal cross-links) MUST NOT be rewritten to remote URLs — only source-file links are rewritten.

If the repository has no `origin` remote configured, the sync script MUST NOT rewrite the link and MUST NOT fail `predev`/`prebuild` because of it: it leaves the link as the original relative/local path and emits a warning noting that source-link rewriting was skipped for lack of a configured remote.

#### Scenario: Source file link rewritten to the remote repository

- GIVEN an `openwiki/` page links to `/scripts/lib/cache.js`
- WHEN the sync script transforms the page
- THEN the resulting web page's link MUST point to the remote repository's hosted URL for that file on the default branch

#### Scenario: Wiki-internal link is left untouched

- GIVEN an `openwiki/` page links to another wiki page, e.g. `./architecture.md`
- WHEN the sync script transforms the page
- THEN that link MUST remain a same-site relative link, not a remote repository URL

---

### Requirement: 1:1 OpenWiki-to-Web Page Parity {#REQ-sdd-document-018}

The sync script MUST maintain strict 1:1 parity between `openwiki/` pages and `web-doc/src/content/docs/` pages: every `openwiki/` page produces exactly one corresponding transformed web page, and no web-only pages are authored in this iteration. When an `openwiki/` page is deleted, the corresponding transformed web page MUST be removed by the next sync run.

#### Scenario: Parity maintained after an openwiki update

- GIVEN `openwiki/` contains 8 pages
- WHEN the sync script runs
- THEN `web-doc/src/content/docs/` MUST contain exactly 8 corresponding pages, no more and no fewer

#### Scenario: Deleted wiki page removed from web output

- GIVEN an `openwiki/` page was deleted since the last sync
- WHEN the sync script runs again
- THEN the corresponding page under `web-doc/src/content/docs/` MUST be removed

## MODIFIED Requirements

### Requirement: Interactive Launch Gate and Scope Selection {#REQ-sdd-document-002}

The `sdd-document` agent MUST block launch at startup by returning `status: blocked` with a `question_gate` payload to present the user with a choice of documentation scope options:
- Option A: Full Technical Wiki (OpenWiki style)
- Option B: Lightweight wiki under `docs/wiki/`
- Option C: Custom freeform path
- Option D: OpenWiki + Starlight web (`openwiki/` plus a static `web-doc/` scaffold synced from it)

The scope-choice question MUST be batched together with the language-selection question (see the batched gate requirement below) into ONE `question_gate` payload containing two independent questions, presented via a single `vscode/askQuestions` call — never as two separate blocking round-trips.

If Option C is selected, the agent MUST validate the user-provided custom output directory and block with a clarification request if the path is fuzzy, invalid, or missing.

The agent MUST enforce a write sandbox: all file writes are strictly restricted to the approved output directory (or directories), with the sole exception of the repository's top-level `/AGENTS.md` and `/CLAUDE.md` files (and only to append or update the OpenWiki reference section). For Options A, B, and C the approved output is a single directory. For Option D, the approved output is the SET of both `openwiki/` and `web-doc/` — the agent MAY write to either, and MUST NOT write outside both. If the agent's own write plan would target a file outside the approved path(s) (and not matching the `/AGENTS.md` or `/CLAUDE.md` exception), it MUST halt execution and return `status: blocked` with `blocker_type: design-mismatch` before performing that write.

The agent's own pre-write self-check is NOT sufficient evidence of overall sandbox compliance and MUST NOT be presented as such: the authoritative, independent verification that no write landed outside the approved sandbox is an orchestrator-owned post-run step (see `openspec/specs/agents/spec.md`, Orchestrator-Owned Post-Run Sandbox Inventory Verification). The agent MUST NOT self-certify sandbox compliance in its return envelope as a substitute for that orchestrator check.

(Previously: the gate offered only Options A, B, and C, and the write sandbox was always scoped to a single approved directory with no dual-directory case.)

#### Scenario: Agent blocks on startup for option choice

- GIVEN the `sdd-document` agent starts execution
- WHEN no scope choice has been approved/recorded
- THEN it MUST return `status: blocked` with a `question_gate` containing Options A, B, C, and D
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

#### Scenario: Option D sandbox approves both directories

- GIVEN the user selects Option D
- WHEN the agent writes `openwiki/` pages and the `web-doc/` scaffold in the same run
- THEN both writes MUST be considered inside the approved sandbox
- AND a write attempted to any third directory MUST still trigger the write-sandbox-violation halt

#### Scenario: Agent does not self-certify sandbox compliance

- GIVEN the `sdd-document` agent completes a run with no self-detected sandbox violation
- WHEN it composes its return envelope
- THEN it MUST NOT claim final, authoritative sandbox compliance in place of the orchestrator's independent post-run inventory check
- AND the orchestrator still performs that check before closing the route

---

### Requirement: Batched Language and Scope Selection Gate {#REQ-sdd-document-006}

The `sdd-document` agent MUST present language selection and scope selection as ONE batched `question_gate` — two independent questions delivered in a single `vscode/askQuestions` call — rather than as two separate blocking round-trips. The gate determines the language for all generated wiki content and all subsequent interaction prompts, and the documentation scope (Options A/B/C/D, per the launch-gate requirement above).

In **init mode** (no persisted `.last-update.json`, or the persisted metadata lacks `doc_language`/`scope_choice`), the agent MUST ask both questions together at startup. The language question MUST offer at minimum English (recommended) and Spanish, with freeform input allowed.

In **update mode**, when the persisted `.last-update.json` already carries values for both `doc_language` and `scope_choice`, the agent MUST skip both gates and reuse the persisted values without asking. An explicit parameter override — `doc_language` or `scope_choice` passed explicitly in the launch parameters — MUST force re-asking only the overridden question, even in update mode.

To give the user an actual, user-facing path to this override, the agent MUST present a short yes/no pre-question at the start of every update-mode run — before checking for an explicit parameter override — asking whether to keep the persisted `doc_language`/`scope_choice` or change them ("Keep previous documentation language and scope, or change them?"). If the user answers to keep them, the agent proceeds using the persisted values without further asking. If the user answers to change them, the agent MUST treat that as the explicit parameter override for only the field(s) the user selects to change, and re-ask only the corresponding question(s) (language, scope, or both), reusing the persisted value for any field not selected for change.

Once resolved (by answer or by reuse from persisted metadata), all subsequent gates and generated content MUST use the resolved language and scope. When the resolved scope is D, the resolved output target for all subsequent generation steps is the pair `openwiki/` + `web-doc/`.

(Previously: the batched gate's scope question offered only Options A, B, and C; Option D and its dual-directory resolution did not exist.)

#### Scenario: Init mode — batched gate asks both questions together

- GIVEN the `sdd-document` agent starts execution with no persisted `.last-update.json`
- WHEN it composes its launch gate
- THEN it MUST return `status: blocked` with ONE `question_gate` containing both the language question (English recommended) and the scope-choice question (Options A, B, C, D)
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

#### Scenario: Scope D resolves to the dual output target

- GIVEN the user selects Option D at the batched gate
- WHEN the gate resolves
- THEN the resolved output target for the run MUST be both `openwiki/` and `web-doc/`

---

### Requirement: `.last-update.json` Metadata {#REQ-sdd-document-011}

After all wiki files are written, the agent MUST generate (or update) a `.last-update.json` metadata file in the output directory root containing: `updatedAt` (ISO-8601 UTC), `command` (init/update), `gitHead` (current HEAD short commit hash), `generator` (sdd-document), `version`, `sections` (list of generated page paths), `stats` (filesGenerated, filesUpdated, filesSkipped), `doc_language` (the resolved language code from the batched gate), and `scope_choice` (the resolved scope option, `A`/`B`/`C`/`D`).

When the resolved scope is D, `.last-update.json` MUST be written under `openwiki/` (the source-of-truth directory); `web-doc/` does not carry its own separate `.last-update.json`.

The `doc_language` and `scope_choice` fields exist so that a subsequent update-mode run can skip the batched gate (per the Batched Language and Scope Selection Gate requirement above) by reading these persisted values instead of re-asking.

(Previously: `scope_choice` was constrained to `A`/`B`/`C`, with no Option D value and no rule for where the metadata file lives under a dual-directory scope.)

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

#### Scenario: scope_choice D metadata lives under openwiki/

- GIVEN the resolved scope is D
- WHEN the agent writes `.last-update.json`
- THEN it MUST write it under `openwiki/.last-update.json`
- AND `scope_choice` MUST be `"D"`

## Clarifications

### Session 2026-07-06

- Q: Si al elegir Opción D en modo init (primera vez) `web-doc/` ya existe con contenido no generado por este agente, ¿qué debe hacer el scaffold? → A: Extender la regla idempotente (escribe solo los archivos de scaffold que falten) también al modo init, igual que en update mode.
- Q: Cuando el repositorio no tiene un remote `origin` configurado, ¿cómo debe comportarse el sync script para la reescritura de enlaces a archivos fuente (REQ-sdd-document-017)? → A: Omitir la reescritura y dejar el enlace como ruta relativa/local, registrando una advertencia (nunca fallar `predev`/`prebuild` por esto).
- Q: ¿Qué ref debe usar la reescritura de enlaces remotos (REQ-sdd-document-017): el nombre de la rama por defecto (movible) o el commit SHA vigente al momento del sync (fijo)? → A: Rama por defecto (p. ej. `main`), no SHA fijo.
