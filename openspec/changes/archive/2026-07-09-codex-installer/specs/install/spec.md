# Delta for install

## ADDED Requirements

### Requirement: Codex Install Entry Points And Plugin Registration {#REQ-install-001}

The system MUST expose `npm run setup:codex` and `npm run install:codex -- <destRepo>` as the supported Codex installer entry points. `setup:codex` MUST build `dist/codex`, validate the generated output by default, and attempt Codex marketplace registration when the Codex CLI is available; when the CLI is unavailable, it MUST still leave a usable build artifact and print actionable next steps instead of failing the build.

#### Scenario: Setup codex installs through the CLI when available

- GIVEN the Codex CLI is installed and `dist/codex` does not exist
- WHEN `npm run setup:codex` is executed
- THEN `dist/codex` MUST be rebuilt from the source tree and the plugin MUST be registered or updated through the supported Codex marketplace mechanism

#### Scenario: Setup codex degrades to manual instructions when the CLI is unavailable

- GIVEN the Codex CLI is not available on PATH
- WHEN `npm run setup:codex` is executed and the build succeeds
- THEN the process MUST exit successfully with the built artifact preserved and MUST print manual installation guidance

### Requirement: Codex Agent Copy Scope And Preservation {#REQ-install-002}

The system MUST install Codex agents as a separate step from plugin registration because Codex plugins SHALL NOT package agents. `setup:codex` MUST copy generated `.codex/agents/*.toml` into `~/.codex/agents/`, and `install:codex -- <destRepo>` MUST copy them into `<destRepo>/.codex/agents/`. Re-running either command MUST overwrite managed same-path agent files while preserving unrelated user files.

#### Scenario: Setup codex copies global agents

- GIVEN a successful `dist/codex` build containing generated agent TOML files
- WHEN `npm run setup:codex` is executed
- THEN each generated `.codex/agents/*.toml` MUST be copied into `~/.codex/agents/` without deleting unrelated files there

#### Scenario: Install codex copies repo-local agents

- GIVEN `<destRepo>` is an existing safe destination repository
- WHEN `npm run install:codex -- <destRepo>` is executed
- THEN each generated `.codex/agents/*.toml` MUST be copied into `<destRepo>/.codex/agents/`, replacing only managed same-path files

### Requirement: Codex Config TOML Merge Is Non-Destructive {#REQ-install-003}

The system MUST merge destination `.codex/config.toml` non-destructively. For `setup:codex`, the destination MUST be `~/.codex/config.toml`; for `install:codex -- <destRepo>`, the destination MUST be `<destRepo>/.codex/config.toml`. The merge MUST add or update only the managed `[agents]` limits and `skills.config` values required by ospec-workflow, and it MUST preserve unrelated sections, keys, comments, and user-managed values outside that managed key set. The managed key set and managed values MUST be sourced from the generated source-tree `.codex/config.toml` for this repository; the installer MUST NOT invent additional managed Codex keys beyond the `[agents]` and `skills.config` entries present there.

#### Scenario: Managed keys are added to an existing config

- GIVEN a destination `.codex/config.toml` missing the managed ospec-workflow keys
- WHEN a Codex install command updates the destination
- THEN the managed `[agents]` and `skills.config` keys MUST be added without removing unrelated configuration

#### Scenario: Unrelated user configuration is preserved during merge

- GIVEN a destination `.codex/config.toml` already contains unrelated user settings
- WHEN a Codex install command updates the managed keys
- THEN unrelated sections and keys MUST remain intact and unchanged

#### Scenario: Managed keys come from the generated source config only

- GIVEN the generated source tree contains a `.codex/config.toml`
- WHEN a Codex install command computes the managed merge payload
- THEN it MUST read only that source file's `[agents]` and `skills.config` entries as the managed key set
- AND it MUST NOT synthesize additional managed Codex keys outside those entries

### Requirement: Codex Installer Documentation, Release Metadata, And Validation {#REQ-install-004}

The system MUST document Codex installation as a first-class supported path. README target tables, `docs/plugin-installation.md`, and release/marketplace metadata MUST describe the Codex plugin install flow, separate agent copy behavior, and config merge expectations. Automated tests run by `npm test` MUST cover successful install flow, CLI-unavailable fallback, TOML merge preservation, and validation of generated Codex output.

#### Scenario: Documentation and release metadata reflect Codex install behavior

- GIVEN the Codex installer change is prepared for release
- WHEN the distribution and docs artifacts are reviewed
- THEN README, plugin-installation docs, and marketplace metadata MUST describe the supported Codex commands and their agent/config behavior consistently

#### Scenario: Test suite covers Codex installer safety guarantees

- GIVEN the repository test suite is executed with `npm test`
- WHEN Codex installer coverage runs
- THEN it MUST verify install success paths, fallback messaging, non-destructive TOML merge behavior, and generated output validation expectations

## Clarifications

### Session 2026-07-09

- Q: What is the source of truth for the managed `.codex/config.toml` merge payload? → A: The generated source-tree `.codex/config.toml`, limited to its `[agents]` and `skills.config` entries.
