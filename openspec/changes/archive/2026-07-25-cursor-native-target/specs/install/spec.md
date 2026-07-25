# Delta for install

## ADDED Requirements

### Requirement: Native Cursor Global Installation Is Idempotent {#REQ-install-004}

The system MUST expose `npm run build:cursor` and `npm run setup:cursor` as the supported
Cursor install entry points. `build:cursor` MUST generate `dist/cursor` via
`runConfigure({ target: "cursor", validate: true })`. `setup:cursor` MUST build when
needed, validate, and sync the generated tree into the user's global Cursor home
`path.join(os.homedir(), ".cursor")`. The installer MUST expand every
`__OSPEC_CURSOR_ROOT__` placeholder in installed `hooks.json` to an absolute launcher
root (forward slashes allowed on Windows), copy the `ospec-hooks` binary into the
managed tree, and support `--dry-run` that performs no filesystem writes. Re-running
`setup:cursor` MUST converge to the same managed state (overwrite managed same-path
files; preserve unrelated user files). Repo-local `.cursor/` install and `mcp.json`
emit/merge are out of scope.

#### Scenario: First setup installs into global Cursor home

- GIVEN no prior managed install exists under `~/.cursor`
- WHEN `npm run setup:cursor` runs
- THEN `dist/cursor` MUST be produced and synced into `~/.cursor`
- AND installed `hooks.json` MUST contain absolute launcher paths with no unresolved
  `__OSPEC_CURSOR_ROOT__`

#### Scenario: Re-running setup is idempotent

- GIVEN a prior successful `setup:cursor`
- WHEN `setup:cursor` is re-run unchanged
- THEN managed files MUST match the prior run and unrelated user files under `~/.cursor`
  MUST remain intact

#### Scenario: Dry-run writes nothing

- GIVEN `setup:cursor --dry-run` is invoked
- WHEN the installer completes
- THEN no files under `~/.cursor` MUST be created or modified

### Requirement: Cursor Home-Directory Install Safety {#REQ-install-005}

`install-cursor.js` MUST treat `~/.cursor` as an explicitly allowed managed global
destination. It MUST NOT reuse `install-target.js` `assertSafeDest` (which refuses
`$HOME`). The installer MUST apply a managed-path safety check equivalent in spirit to
Codex `assertManagedPathSafe`: refuse filesystem roots, refuse paths outside the
intended `~/.cursor` managed root, and throw synchronously before any destructive write.

#### Scenario: Managed ~/.cursor destination is allowed

- GIVEN the resolved destination equals the user's `~/.cursor`
- WHEN the Cursor installer safety check runs
- THEN it MUST allow the destination

#### Scenario: Unsafe destination is refused before writes

- GIVEN a destination outside the managed `~/.cursor` root (e.g. filesystem root)
- WHEN the Cursor installer safety check runs
- THEN it MUST throw before any copy/delete occurs

### Requirement: sync-cursor Ad-Hoc Installer Is Retired {#REQ-install-006}

After generator-first Cursor install lands, `scripts/sync-cursor.js` MUST NOT remain the
implementation of `setup:cursor` / `reload:cursor`. Those npm scripts MUST invoke
`install-cursor.js` (directly or via a one-cycle thin wrapper that delegates to
`install-cursor.js`). The ad-hoc source→`~/.cursor` copy path without `toolMap`
substitution MUST be removed from the supported install surface.

#### Scenario: setup:cursor uses install-cursor

- GIVEN `package.json` scripts for `setup:cursor` / `reload:cursor`
- WHEN those scripts are inspected after this change
- THEN they MUST resolve to `install-cursor.js` behavior (not an independent sync
  transform of source files)

#### Scenario: Ad-hoc sync is not required for install

- GIVEN a contributor runs `npm run setup:cursor`
- WHEN install completes successfully
- THEN a separate manual `sync-cursor.js` source copy MUST NOT be required

### Requirement: Cursor Install Matrix Coverage {#REQ-install-007}

`real-repo.test.js`, `check.js`, and related parity suites MUST include `cursor` in the
supported target matrix. Cursor generation MUST produce a non-empty tree that passes
`validate-cursor.js`. Documentation touched by this change MUST describe `build:cursor`
and `setup:cursor` as the supported Cursor path.

#### Scenario: Real-repo matrix includes cursor

- GIVEN the real-repo / check target matrix runs
- WHEN targets are enumerated
- THEN `cursor` MUST be present and MUST produce a non-empty validated tree

#### Scenario: Docs mention Cursor native install commands

- GIVEN install documentation updated by this change
- WHEN Cursor installation is described
- THEN `build:cursor` and `setup:cursor` MUST be documented as the supported flow

## MODIFIED Requirements

### Requirement: Real-repo integration target coverage

Generate from the actual repository root without external CLIs:

- All six supported targets (`claude`, `vscode`, `github-copilot`, `opencode`, `codex`,
  `cursor`) MUST produce a non-empty file tree.
- GitHub Copilot output MUST pass the pure-Node `validate-github-copilot` validator (zero errors).
- Opencode output MUST pass the pure-Node `validate-opencode` validator (zero errors).
- Codex output MUST pass the pure-Node `validate-codex` validator when validation is enabled for that target.
- Cursor output MUST pass the pure-Node `validate-cursor` validator (zero errors).
- Opencode output MUST contain every source `skills/**/*.md` file.
- Opencode output MUST contain the plugin bridge, and the bridge MUST reference both hook scripts at paths that exist in the output.
- GitHub Copilot output MUST contain every source `skills/**/*.md` file.
- Every skill path referenced by a phase agent in the github-copilot output MUST exist in the output tree.
- Claude output MUST NOT contain `vscode/` namespace residue in any `.md` file.
- Cursor agent output MUST NOT contain `vscode/askQuestions`, bare `AskUserQuestion`,
  or unmapped abstract tool-name residue in agent bodies/frontmatter.
- Command-file `${input:…}` / `agent:` retention is out of scope for this change;
  `validate-cursor` MUST NOT fail solely because commands still contain `${input:…}`.

(Previously: wording required “all four targets”; coverage now enumerates all six supported targets including `cursor`.)

#### Scenario: Six-target real-repo generation succeeds

- GIVEN the repository root is used as generator source
- WHEN real-repo generation runs for all six targets
- THEN each target MUST emit a non-empty tree
- AND cursor MUST pass `validate-cursor`

## Clarifications

### Session 2026-07-25

- Q: ¿`validate-cursor` / el contrato de `dist/cursor` DEBE fallar ante cualquier `${input:…}` (incluidos commands), o solo ante residuo `vscode/`/`AskUserQuestion` en agents, dejando el strip de `${input:…}`/`agent:` en commands diferido? → A: Fail on leftover `vscode/`, `AskUserQuestion`, or unmapped abstract tool names in agent bodies/frontmatter only; command `${input:…}`/`agent:` MAY remain this change and MUST NOT alone fail the validator (strip deferred).
