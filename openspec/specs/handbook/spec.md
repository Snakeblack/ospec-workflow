# handbook Specification

## Purpose

The `handbook` domain defines the skill that writes and maintains a repository's documentation in `handbook/`, the `handbook.json` manifest that orders it, the optional Starlight website built from it, and the agent through which the SDD orchestrator delegates that work. It replaced `sdd-document` (its `openwiki/` output, its A/B/C/D scopes and its `/sdd-document` command).

## Requirements

### Requirement: handbook Skill, Agent and Install {#REQ-handbook-001}

The system MUST ship `skills/handbook/SKILL.md` in every install, invocable by the user or the router outside SDD (**Direct** mode), and `agents/handbook.agent.md` only with the SDD package, as the orchestrator's delegate (**Delegated** mode: it never asks the user and returns `status: blocked` with a `question_gate` instead). The agent MUST be non-user-invocable, use the abstract tools `read`, `search`, `edit` and `execute`, carry no `model:` key, and map to the `cheap` tier in `models.yaml`. There MUST be no slash command for either.

#### Scenario: The skill installs without SDD

- GIVEN an install without `--with-sdd`
- WHEN configure writes any target
- THEN `skills/handbook/SKILL.md` and `skills/handbook/assets/web-doc-template/` are present
- AND the `handbook` agent and any `sdd-document` artifact are absent

#### Scenario: Generated targets honor the cheap tier or inherit

- GIVEN `models.yaml` maps `handbook` to `cheap`
- WHEN configure runs with `--with-sdd` for claude, vscode, opencode, github-copilot and codex
- THEN Claude pins its cheap alias, the other targets use the user's cheap model or inherit
- AND Codex pins the user's cheap model with `model_reasoning_effort = "low"`

---

### Requirement: Settings in handbook.json {#REQ-handbook-002}

When `handbook/handbook.json` does not exist, the skill MUST ask once, in one round, the handbook language and whether to build the website, and write the answers to `handbook.json` (`language`, `web`) before writing any page. When it exists, the skill MUST read the settings and ask nothing; a user's request to change one setting edits only that field.

#### Scenario: First run asks once

- GIVEN a repository without `handbook/handbook.json`
- WHEN the skill runs
- THEN it asks the language and the website question in a single round
- AND writes `handbook.json` before the first page

#### Scenario: Later runs ask nothing

- GIVEN `handbook/handbook.json` holds `language` and `web`
- WHEN the skill runs again
- THEN it asks no settings question

---

### Requirement: The handbook.json Manifest {#REQ-handbook-003}

`handbook.json` MUST be a JSON object with an optional `language` (a language code), `web` (boolean) and `groups`: an ordered array where each group names a top-level directory of the handbook (`directory`), a `label` written in `language`, and an optional `audience` written in `language`. A directory MUST appear in at most one group. `groups` is the reading order of the website and the quickstart; the order of pages inside a group is each page's frontmatter `sidebar.order`. The skill MUST keep the user's hand edits (order, labels, audiences) and MUST add or remove a group only for a directory it creates or deletes.

#### Scenario: This repository's manifest names every directory once

- GIVEN `handbook/handbook.json` of this repository
- WHEN a contract test reads it
- THEN its groups name exactly the top-level directories of `handbook/`, each with a non-empty label

---

### Requirement: Migration of openwiki/ {#REQ-handbook-004}

When a repository has `openwiki/` and no `handbook/`, the skill MUST ask once whether to migrate it. On yes it MUST move it with `git mv openwiki handbook`, build `handbook.json` from `openwiki/.last-update.json` (`doc_language` as `language`, scope `D` as `web: true`, `section_labels` as group labels, groups in the quickstart's first-link order), turn the rest of that file into `.state.json`, and rename `web-doc/scripts/sync-openwiki.mjs` to `sync-handbook.mjs` with the `package.json` scripts updated. On no it MUST stop without writing.

#### Scenario: A declined migration writes nothing

- GIVEN a repository with `openwiki/` and no `handbook/`
- WHEN the user declines the migration
- THEN the skill stops and writes no file

---

### Requirement: Write Boundary and Secrets {#REQ-handbook-005}

The skill MUST write only inside `handbook/`, inside `web-doc/` when `web` is true, and the handbook block of the top-level `AGENTS.md` and `CLAUDE.md`; during a migration the user approved, also `openwiki/`, only to move it to `handbook/` and delete its `.last-update.json`. `web` is the value `handbook.json` had when the run started, or the one the user set in the run; the skill MUST NOT change it on its own. It MUST NOT write into `web-doc/src/content/docs/`, which the sync script generates. A write outside the boundary MUST stop the run. The skill MUST record `git status --porcelain` before its first write and compare it at the end, reporting every changed path outside the boundary (in Direct mode that report and the user's review of the diff are the only checks). In Delegated mode the orchestrator also verifies the boundary after the run (REQ-agents-006); the skill's own check does not replace it. The skill MUST NOT read or document secrets, credentials, private keys, tokens or `.env` files.

#### Scenario: The generated website content is never authored

- GIVEN a run with `web: true`
- WHEN the skill writes the handbook
- THEN no file under `web-doc/src/content/docs/` is written by the skill

---

### Requirement: Init and Update Runs {#REQ-handbook-006}

The run MUST be **init** when `handbook/` has no `quickstart.md` and no `.state.json`, and **update** otherwise. Before writing, the skill MUST write `handbook/_plan.md` with one row per page (`page`, `group`, `category`, `evidence`, `substance`, `canonical for`), merge low-substance pages, give each concept exactly one canonical page, and in update mode list `coverage proposals` before editing. Init MUST write at most 16 pages, with groups discovered from the repository. Update MUST use `gitHead` only when it matches `^[0-9a-f]{7,40}$` and `git cat-file -e <gitHead>^{commit}` succeeds (otherwise the run is an init), scope edits with `git diff --name-only <gitHead>..HEAD`, edit surgically, re-check volatile facts on every run, and on a no-op edit no page and refresh only `updatedAt` and `gitHead`. `_plan.md` MUST be deleted at the end.

#### Scenario: No drift is a no-op

- GIVEN `.state.json` holds the current `gitHead` and no source changed
- WHEN the skill runs in update mode
- THEN it writes no new file and refreshes only `updatedAt` and `gitHead`

---

### Requirement: Page Structure and Quality {#REQ-handbook-007}

The quickstart MUST hold the title, a summary, what the repository lets you do, a "Start here" list linking every group in manifest order, the key source files, notes for future agents and a source map. Each page MUST hold its role, how it works, technical details, rationale when not obvious, extension points, what to watch when editing, and a source map with commit hashes. Every statement MUST come from the repository; pages follow `skills/cognitive-doc-design/SKILL.md` (paragraphs of at most four sentences, tables for structured data, imperative headings), link each other with relative links, and link repository files with root-relative paths, never `file://` URLs.

#### Scenario: Source links are root-relative

- GIVEN a page that cites `package.json`
- WHEN the skill writes it
- THEN the link is `/package.json`

---

### Requirement: Measurable Checklist and Fact Check {#REQ-handbook-008}

Before writing `.state.json`, the skill MUST check every page: at least 30 substantive lines (non-blank, not headings, outside the source map), at least one outgoing and one incoming handbook link, a non-empty Mermaid block on every `flow` page, and Mermaid blocks that start with a known diagram type and quote labels holding `[ ] ( ) { } *`. A failing page MUST be fixed or listed with its reason in the result. The skill MUST compare every number, version, threshold, path, command and configuration key on the touched pages with the repository and correct or remove mismatches, keeping that record out of the pages. With `web: true` it MUST run `node scripts/sync-handbook.mjs` from `web-doc/` and treat each warning as a defect.

#### Scenario: A thin page does not ship silently

- GIVEN a page with fewer than 30 substantive lines
- WHEN the skill checks it
- THEN it merges the page or lists it with a reason in `justifiedExceptions`

---

### Requirement: The .state.json File {#REQ-handbook-009}

After each run the skill MUST write `handbook/.state.json` with `updatedAt`, `command` (`init` | `update`), `gitHead`, `generator: "handbook"`, `version`, `pages` (equal to the set of `*.md` files under `handbook/`) and `stats` whose `filesSkipped` is an array of `{file, reason}` objects. A failed write MUST be reported as a warning without failing the run; the next run then works as an init.

#### Scenario: This repository's state lists every page

- GIVEN `handbook/.state.json` of this repository
- WHEN a contract test compares `pages` with the `*.md` files under `handbook/`
- THEN both sets are equal

---

### Requirement: Root Agent Instruction Files {#REQ-handbook-010}

Unless the user says not to, the skill MUST keep a `## Handbook` block pointing to `handbook/quickstart.md` in the top-level `AGENTS.md` and `CLAUDE.md` (both when both exist; a new `AGENTS.md` with only the block when neither exists), replacing an older `## OpenWiki` block instead of adding a second one and touching nothing else in those files.

#### Scenario: An OpenWiki block is replaced

- GIVEN an `AGENTS.md` with an `## OpenWiki` block
- WHEN the skill runs
- THEN the file holds one `## Handbook` block and no `## OpenWiki` block

---

### Requirement: No Self-Certification of Content Quality {#REQ-handbook-011}

The result MUST NOT certify content quality ("facts verified", "readability OK"). In Delegated mode the result carries a mechanical `checklist` (per-page counts and `justifiedExceptions`) and the orchestrator reviews the content (REQ-agents-018); in Direct mode the user does.

#### Scenario: The delegated result carries counts only

- GIVEN a delegated run
- WHEN the agent returns
- THEN the envelope holds the `checklist` and no quality verdict

---

### Requirement: Website Scaffold {#REQ-handbook-012}

With `web: true`, the skill MUST copy `package.json`, `astro.config.mjs`, `src/content.config.ts`, `tsconfig.json`, `src/styles/custom.css` and `scripts/sync-handbook.mjs` from `skills/handbook/assets/web-doc-template/` into `web-doc/`, each only when missing, without running any installer, retrying a failed write once and reporting a second failure as a warning. It MUST check on every run that `predev` and `prebuild` run the sync script, passing `--source <dir>` when the handbook is not at `handbook/`.

#### Scenario: An existing scaffold file is left alone

- GIVEN `web-doc/astro.config.mjs` already exists
- WHEN the skill materializes the scaffold
- THEN it does not overwrite that file

---

### Requirement: Sync Script {#REQ-handbook-013}

`scripts/sync-handbook.mjs` MUST be a zero-dependency Node script that turns the handbook (`../handbook` by default, or `--source <dir>`) into `web-doc/src/content/docs/`. It MUST re-transform only pages whose mtime or content hash changed, inject a `title` (first heading, else humanized filename) without re-serializing existing frontmatter, strip the leading H1, rewrite repository-file links to the `origin` remote's public web URL on the default branch, never keeping the remote's user or password (leaving the links and warning when there is no usable `origin`), map handbook-internal links (relative or prefixed with the handbook's repository path) to slug URLs, keep strict 1:1 page parity, and never publish `handbook.json`, `.state.json` or `_plan.md`. It MUST always degrade with a warning instead of failing `predev`/`prebuild`, and MUST NOT prune the site when the handbook is missing or empty. This repository's `web-doc/scripts/sync-handbook.mjs` MUST equal the template's.

#### Scenario: A deleted page leaves the website

- GIVEN a handbook page was deleted since the last sync
- WHEN the sync runs
- THEN its page under `web-doc/src/content/docs/` is removed

#### Scenario: Origin credentials never reach the site

- GIVEN an `origin` such as `https://user:token@github.com/o/r.git`
- WHEN the sync rewrites a repository-file link
- THEN the link starts with `https://github.com/o/r/blob/<branch>/` and no generated file holds `user` or `token`

#### Scenario: A missing handbook never empties the site

- GIVEN the handbook directory is missing
- WHEN the sync runs
- THEN it warns, exits 0 and leaves the existing output untouched

---

### Requirement: Sidebar and Language from the Manifest {#REQ-handbook-014}

The sync script MUST write `web-doc/src/sidebar.generated.json` with `language` (the manifest's, else `en`), the top-level pages (quickstart first) and the groups in manifest order with their labels and, when a group has an `audience`, a `badge` with that text. Directories the manifest does not name MUST follow, alphabetically with humanized names, with a warning; a group whose directory has no pages MUST be skipped with a warning. A missing `handbook.json` MUST give alphabetical groups without a warning; an unreadable or invalid one (bad JSON, `groups` not an array, a group without `directory` or `label`, a repeated directory, a non-string `audience`, an invalid `language`) MUST give alphabetical groups and English with a warning, never a failed build. `astro.config.mjs` MUST take the Starlight root locale from that `language` and render each badge as text, falling back to Starlight's default sidebar when the file is missing.

#### Scenario: Groups follow the manifest

- GIVEN a manifest listing `security` before `orchestration`, with an audience on `security`
- WHEN the sync runs
- THEN the sidebar lists `security` first with its badge, then `orchestration`

#### Scenario: An invalid manifest degrades

- GIVEN a `handbook.json` that is not valid JSON
- WHEN the sync runs
- THEN it warns, orders the groups alphabetically and sets the language to `en`
