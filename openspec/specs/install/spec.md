# Spec: install

## Domain

Per-target installation and distribution of the ospec-workflow plugin. Covers how each supported tool target receives the generated output tree, the npm commands that drive each path, the safety constraints on output directories and destinations, the idempotency contract, and the test infrastructure that validates generated outputs against real CLIs.

## Scope

- npm scripts:
  - Claude: `build:claude`, `setup:claude`, `reload:claude`
  - GitHub Copilot: `build:copilot`, `setup:copilot`, `reload:copilot`, `install:global:copilot`
  - OpenCode: `build:opencode`, `setup:opencode`, `reload:opencode`, `install:opencode`, `install:global:opencode`
  - Codex: `build:codex`, `setup:codex`, `install:codex`
  - VS Code: `build:vscode`, `setup:vscode`, `reload:vscode`
  - Cursor: `build:cursor`, `setup:cursor`, `reload:cursor`
  - Antigravity: `build:antigravity`, `setup:antigravity`, `reload:antigravity`
  - Compiler Hooks: `build:hooks`, `ensure:hooks`
- Source modules: `scripts/configure/install-engine.js`, `scripts/configure/claude-marketplace.js`, `scripts/configure/install-claude.js`, `scripts/configure/install-target.js`, `scripts/configure/install-global-copilot.js`, `scripts/configure/install-global-opencode.js`, `scripts/configure/install-codex.js`, `scripts/configure/install-vscode.js`, `scripts/configure/install-cursor.js`, `scripts/configure/install-antigravity.js`
- Generated distribution roots: `dist/claude-marketplace/`, `dist/github-copilot/`, `dist/opencode/`, `dist/codex/`, `dist/vscode/`, `dist/cursor/`, `dist/antigravity/`
- Test files: `scripts/configure/install-engine.test.js`, `scripts/configure/claude-marketplace.test.js`, `scripts/configure/install-codex.test.js`, `scripts/configure/install-vscode.test.js`, `scripts/configure/install-cursor.test.js`, `scripts/configure/install-antigravity.test.js`, `tests/integration/installation-convergence.test.js`

---

## 1. Target Install Models

There are three primary distribution mechanisms across supported AI assistants:

### 1.1 Claude Code — Marketplace Registration

Claude Code discovers plugins through a local marketplace registered with its CLI. Installation therefore has two steps: (a) build the marketplace tree and (b) register/update it via the `claude` binary.

**npm commands**

| Command | Script | Effect |
|---|---|---|
| `npm run build:claude` | `scripts/configure/claude-marketplace.js` | Build `dist/claude-marketplace/` only |
| `npm run setup:claude` | `scripts/configure/install-claude.js` | Build + register marketplace + install plugin |
| `npm run reload:claude` | `scripts/configure/install-claude.js --build-only` | Build only; user applies via `/reload-plugins` |

### 1.2 GitHub Copilot and OpenCode — Global Home and Repo Sync

Copilot (`~/.copilot/` or `.github/`) and OpenCode (`~/.config/opencode/` or `.opencode/`) consume the workflow through structured folders. Global setups use `install-engine.js` with `.ospec-workflow-install.json` manifest tracking, subfolder prefix preservation, and stale file pruning.

**npm commands**

| Command | Script | Effect |
|---|---|---|
| `npm run build:copilot` | `scripts/configure/cli.js --target github-copilot --out dist/github-copilot` | Build `dist/github-copilot/` only |
| `npm run setup:copilot` | `scripts/configure/install-global-copilot.js` | Build + install into global Copilot config (`~/.copilot/`) |
| `npm run reload:copilot` | `scripts/configure/install-global-copilot.js` | Re-run global Copilot installation |
| `npm run install:global:copilot` | `scripts/configure/install-global-copilot.js` | Alias for `setup:copilot` |
| `npm run build:opencode` | `scripts/configure/cli.js --target opencode --out dist/opencode` | Build `dist/opencode/` only |
| `npm run setup:opencode` | `scripts/configure/install-global-opencode.js` | Build + install into global OpenCode config (`~/.config/opencode/`) |
| `npm run install:opencode -- <destRepo>` | `scripts/configure/install-target.js opencode <destRepo>` | Build + sync into destination repository |

### 1.3 Codex — Native Global Installation & Ownership

`npm run setup:codex` MUST install the generated router into `~/.codex/AGENTS.md` as a marked block (REQ-install-033), and `.codex/agents/*.toml`, skills (including the `sdd-orchestrator` skill), runtime scripts and native `hooks.json` under the user's `~/.codex/` and `~/.agents/skills/`, without a plugin or marketplace. It MUST register only missing global MCP definitions through `codex mcp add`, deduplicating by command plus ordered arguments and preserving name collisions. It MUST merge its own hook groups while preserving user-owned groups. `npm run install:codex -- <destRepo>` targets `<destRepo>/.codex/agents/`, writes the router block into `<destRepo>/AGENTS.md`, the IDD protocol, its reviewers and (with SDD) the orchestrator skill into `<destRepo>/.agents/skills/` and its own runtime into `<destRepo>/.codex/ospec-workflow/` (REQ-install-041), and MUST NOT modify the destination project's `.codex/config.toml`.

The generated Codex tree MUST contain `agent.md`, `.codex/agents/*.toml`, `skills/`, runtime `scripts/` and `hooks.json`, and MUST NOT contain `.codex-plugin/`, `.codex/config.toml` or `.mcp.json`. The Codex validator MUST reject generated config and plugin artifacts, and require a valid native hooks payload with the runtime placeholder. It maintains `.ospec-workflow-install.json`, and prunes stale agents/scripts upon upgrade.

### 1.4 VS Code — Settings Configuration & Plugin Root

`npm run setup:vscode` builds `dist/vscode` and updates VS Code's `settings.json` (`chat.pluginLocations` array) non-destructively, preserving existing comments and syntax while guaranteeing fail-closed execution on unparseable configurations.

### 1.5 Cursor — Native Global Home & Hook Adapter

`npm run setup:cursor` builds `dist/cursor` and deploys into `~/.cursor`, configuring `mcp.json` with sanitized environment variables, non-destructively merging `hooks.json`, and managing rollback journals.

### 1.6 Antigravity — Native Configuration & Hooks

`npm run setup:antigravity` builds `dist/antigravity` and deploys into `~/.gemini/config`, non-destructively merging `hooks.json` and tracking installed files via `.ospec-workflow-install.json`.

---

## 2. Claude Marketplace Build (`claude-marketplace.js`)

### 2.1 Output Structure

`buildClaudeMarketplace` produces the following layout under `dist/claude-marketplace/` (the `outDir`):

```
dist/claude-marketplace/
  .claude-plugin/
    marketplace.json       # marketplace registration manifest
  plugins/
    ospec-workflow/        # plugin tree (generated for target: claude)
      .claude-plugin/
        plugin.json
      .mcp.json
      agents/
      commands/
      hooks/
        hooks.json
      scripts/
        hooks/
        lib/
      skills/
```

The `marketplace.json` registers `name: "ospec-tools"` and lists one plugin entry with `name: "ospec-workflow"` and `source: "./plugins/ospec-workflow"`.

### 2.2 Build Sequence

1. Resolve and validate `outDir` with `assertSafeOutDir`.
2. `fs.rmSync(outDir, { recursive: true, force: true })` — full wipe of any prior build.
3. Call `runConfigure({ target: "claude", outDir: pluginDir, validate: true })` to generate the plugin tree into `dist/claude-marketplace/plugins/ospec-workflow/`.
4. Write `dist/claude-marketplace/.claude-plugin/marketplace.json` with owner and plugin metadata.
5. Return `{ outDir, pluginDir, exitCode, validation }`.

If `validate: false` is passed, the plugin validator is skipped. Validation is enabled by default in the production path.

### 2.3 Safe-Output Guard (`assertSafeOutDir`)

`assertSafeOutDir(outDir, sourceDir)` MUST be called before any destructive write. It throws with a descriptive message in each of the following cases:

| Condition | Error text |
|---|---|
| `outDir` resolves to the filesystem root | `"filesystem root"` |
| `outDir` resolves to the user home directory | `"home directory"` |
| `outDir` equals `sourceDir` | `"equals --source"` |
| `outDir` is an ancestor of `sourceDir` or `cwd` | `"is an ancestor of …"` |
| `outDir` is non-empty and has no `.claude-plugin/marketplace.json` | `"non-empty and not a previous marketplace build"` |

A prior build is identified by the presence of `.claude-plugin/marketplace.json` at the root of `outDir`. Re-running against a prior build is allowed (idempotency).

### 2.4 CLI Arguments

When invoked directly (`npm run build:claude`):

| Flag | Default | Description |
|---|---|---|
| `--source <dir>` | `process.cwd()` | Source repo root |
| `--out <dir>` | `dist/claude-marketplace` | Output root |
| `--marketplace-name <n>` | `ospec-tools` | Name field in marketplace.json |
| `--plugin-name <n>` | `ospec-workflow` | Plugin directory and name field |
| `--no-validate` | (omit) | Skip plugin validation |

---

## 3. Claude Installation (`install-claude.js`)

### 3.1 Full Install Sequence (`npm run setup:claude`)

1. Call `buildClaudeMarketplace` with `source: cwd, out: dist/claude-marketplace, validate: true, marketplaceName: "ospec-tools", pluginName: "ospec-workflow"`.
2. If build `exitCode !== 0`, write to stderr and set `process.exitCode`; do not touch marketplace state.
3. Resolve the `claude` binary with `resolveClaudeBin()`.
4. If no binary is found, print the artifact path and return (non-fatal; build artifact is ready).
5. Probe `claude plugin marketplace list`. If `"ospec-tools"` appears in output, run `claude plugin marketplace update ospec-tools`; otherwise run `claude plugin marketplace add <outDir> --scope user`.
6. Probe `claude plugin list`. If `"ospec-workflow@ospec-tools"` appears in output, run `claude plugin update ospec-workflow@ospec-tools`; otherwise run `claude plugin install ospec-workflow@ospec-tools`.
7. Print "Done. Restart Claude Code or run /reload-plugins to apply."

### 3.2 Build-Only Mode (`npm run reload:claude`)

Passes `--build-only`. Steps 1-2 execute. On success, prints "Built. Run /reload-plugins in your Claude Code session to apply." and returns without touching the marketplace or plugin state.

### 3.3 Claude Binary Resolution (`resolveClaudeBin`)

Tries the candidates `["claude", "claude.cmd", "claude.exe"]` in PATH using `spawnSync(bin, ["--version"], { stdio: "ignore", shell: false })`. Returns the first candidate that does not produce a spawn error.
On Windows, if not found on PATH, it additionally checks the WinGet packages folder under `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Anthropic.ClaudeCode*\claude.exe`.
If no binary is found after these checks, it returns `null`.

The `.cmd` variant is required on Windows because PowerShell does not resolve `.cmd` shims when `shell: false` is set.

### 3.4 Idempotency Contract

`setup:claude` MUST be safe to re-run. The detection logic (probe list output → choose add-vs-update) ensures:
- First run: adds the marketplace at `--scope user`; installs the plugin.
- Subsequent runs: updates both. The plugin id `ospec-workflow@ospec-tools` is used for both detection and update because the bare plugin name is ambiguous to the Claude CLI.

---

## 4. Filesystem-Sync Installation (`install-target.js`)

### 4.1 Install Sequence

Given `node scripts/configure/install-target.js <target> <destRepo>`:

1. Parse arguments: positional `target` and `dest`, plus `--dry-run`, `--no-validate`, `--source <dir>`. `--source` without a following non-flag value MUST exit with code 2.
2. Reject unsupported targets (only `"opencode"` and `"github-copilot"` are accepted).
3. Resolve `destDir = path.resolve(dest)` and call `assertSafeDest(destDir, sourceDir)`.
4. Verify `destDir` exists and is a directory; exit with code 2 otherwise.
5. Build into `dist/<target>/` via `runConfigure({ target, outDir, validate })`. Validation is enabled by default (pure-Node validators require no external CLI).
6. If `exitCode !== 0`, write to stderr and return; nothing is synced.
7. `fs.readdirSync(outDir)` — enumerate top-level entries.
8. Unless `--dry-run`, sync those entries through `syncEntriesTransactional`: snapshot each destination entry into a temp backup, copy all entries, and on any failure roll back every mutated entry (restore backups or remove newly created paths) before exiting with code 2. Unrelated destination entries MUST NOT be included in the snapshot/rollback set.
9. If `--dry-run`, print preview lines but write nothing.

(Previously: step 8 used a best-effort per-entry `fs.cpSync` without transactional rollback.)

### 4.2 Safe-Destination Guard (`assertSafeDest`)

`assertSafeDest(destDir, sourceDir)` resolves both directories to their canonical absolute paths (using `fs.realpathSync` to prevent symlink bypasses) and checks for safety. It throws in these cases:

| Condition | Error text |
|---|---|
| `destDir` is the filesystem root | `"filesystem root"` |
| `destDir` equals the user home directory (case-insensitive on Windows/Darwin) | `"home directory"` |
| `destDir` equals `sourceDir` (case-insensitive on Windows/Darwin) | `"equals the source repo (would overwrite the harness)"` |
| `destDir` is inside `sourceDir` (descendant) | `"inside the source repository (nested target write)"` |
| `destDir` contains `sourceDir` (ancestor) | `"contains the source repository (would overwrite the harness root)"` |

The source-repo check prevents syncing a generated github-copilot tree (which contains `.github/` and `scripts/`) back into the workflow repo, which would overwrite the harness files.

### 4.3 CLI Interface

```
install-target <opencode|github-copilot> <destRepo> [--dry-run] [--no-validate] [--source <dir>]
```

npm aliases:
- `npm run install:opencode -- <destRepo>` → `install-target.js opencode <destRepo>`
- `npm run install:copilot -- <destRepo>` → `install-target.js github-copilot <destRepo>`

### 4.4 Copy Semantics

- Granularity: top-level entries of `dist/<target>/` are enumerated; each is recursively copied inside one transactional batch.
- Overwrite: existing same-path files are replaced after a pre-copy snapshot.
- Preservation: files in `destDir` that have no counterpart in `dist/<target>/` are left untouched and are outside the rollback set.
- Atomicity: a mid-sync failure MUST restore snapshotted destinations and remove newly created synced entries; a rollback failure MUST surface both the primary and rollback errors.
- Idempotency: re-running replaces all generated files with fresh copies; nothing is deleted from `destDir` on success.

### 4.5 Binary Integration (`copyBinaryToTree`)

The installation process integrates the platform-appropriate pre-compiled Go binary (`ospec-hooks`) into the target distribution tree before syncing to the destination.

- **Best-Effort Delivery (default)**: If the source binary is absent under `release/dist/` (e.g. pre-CI development environment), a warning is written to stderr and installation proceeds without failure unless callers set `required: true`.
- **Required Delivery**: When `deps.required` is true, a missing source binary or copy failure MUST throw and abort the install path.
- **Platform Detection**: Platform and architecture are resolved (`hostBinarySuffix()`) to locate the source binary `ospec-hooks-${goos}-${arch}${ext}`.
- **Freshness (E1.22)**: `ensureRuntimeBinary` MUST treat the source binary as stale when its modification time is older than the newest file under `cmd/`, `internal/`, `go.mod` or `go.sum` of the source checkout. A missing or stale binary MUST be compiled with the local Go toolchain when `go` is available; a fresh one MUST be reused without compiling. Without Go, a stale binary MUST still be used and a warning naming it as possibly outdated MUST be written to stderr. If the modification time cannot be read, the binary is reused as before.
- **Target-Specific Destination**:
  - For target `opencode`, the binary is copied to `release/dist/ospec-hooks${ext}` in the output tree.
  - For all other targets (including `claude`, `vscode`, `github-copilot`), the binary is copied to `scripts/hooks/ospec-hooks${ext}`.
- **Permissions**: On POSIX (non-win32) platforms, the copied binary's permissions are updated to `0755` (executable) using `chmodSync`.

(Previously: an existing binary under `release/dist/` was always reused, so local installs kept shipping a Go hook compiled months earlier after the Go sources changed.)

#### Scenario: Stale binary is rebuilt with Go

- GIVEN `release/dist/ospec-hooks-<goos>-<arch>` is older than a file under `internal/`
- AND `go version` succeeds
- WHEN `ensureRuntimeBinary` runs
- THEN it MUST run `go build` and return the rebuilt binary

#### Scenario: Stale binary without Go is used with a warning

- GIVEN a stale source binary AND `go` is unavailable
- WHEN `ensureRuntimeBinary` runs
- THEN it MUST return the existing binary AND write a warning that it may be outdated

#### Scenario: Transactional sync rolls back on mid-copy failure

- GIVEN `destDir` already contains one of the top-level generated entries
- AND copying a later entry throws
- WHEN `syncEntriesTransactional` runs
- THEN previously overwritten entries MUST be restored from the backup snapshot
- AND newly created synced entries from this attempt MUST be removed
- AND the installer MUST exit non-zero without leaving a partial sync

#### Scenario: Missing --source value fails closed

- GIVEN argv ends with `--source` and no following path value
- WHEN `parseArgs` runs
- THEN it MUST throw / the CLI MUST exit with code 2 before any configure or sync work

---

## 5. Generated Distribution Contents

### 5.1 Claude (`dist/claude-marketplace/plugins/ospec-workflow/`)

Contains the complete Claude Code plugin tree: `.claude-plugin/plugin.json`, `.mcp.json`, `agents/`, `commands/`, `hooks/hooks.json`, `scripts/hooks/`, `scripts/lib/`, `skills/`.

### 5.2 GitHub Copilot (`dist/github-copilot/`)

Root layout copied directly into `destRepo/`:
- `.github/agents/` — all phase agent `.agent.md` files
- `.github/instructions/` — instruction files
- `.mcp.json`
- `scripts/hooks/`, `scripts/lib/`
- `skills/`

### 5.3 Opencode (`dist/opencode/`)

Root layout copied directly into `destRepo/`:
- `.opencode/agents/` — phase agent `.md` files
- `.opencode/commands/` — slash-command `.md` files
- `.opencode/instructions/`
- `.opencode/plugins/ospec.js` — plugin bridge that references `scripts/hooks/pre-tool-use.js` and `scripts/hooks/session-start.js`
- `opencode.json`
- `scripts/hooks/`, `scripts/lib/`
- `skills/`

The opencode plugin bridge MUST reference both hook scripts at their relative paths, and both scripts MUST be present in the synced tree.

---

## 6. Test Coverage

### 6.1 Unit Tests (`claude-marketplace.test.js`)

Cover `assertSafeOutDir` boundary conditions and `buildClaudeMarketplace` core behavior:

- MUST refuse filesystem root, ancestor of source, equals-source.
- MUST refuse a non-empty non-prior-build directory.
- MUST allow a fresh/empty directory.
- MUST allow re-running against a directory containing `.claude-plugin/marketplace.json`.
- MUST write `.claude-plugin/marketplace.json` and set `pluginDir` to `<out>/plugins/<pluginName>`.
- MUST leave pre-existing data untouched when `assertSafeOutDir` throws (no partial writes).

### 6.2 Real-Repo Integration Tests (`real-repo.test.js`)

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

(Previously: wording required "all four targets"; coverage now enumerates all six supported targets including `cursor`.)

#### Scenario: Six-target real-repo generation succeeds

- GIVEN the repository root is used as generator source
- WHEN real-repo generation runs for all six targets
- THEN each target MUST emit a non-empty tree
- AND cursor MUST pass `validate-cursor`

### 6.3 E2E Tests (`e2e.test.js`)

Drive the real `claude` CLI (self-skips when not installed):

- The `claude plugin validate --strict` command MUST exit 0 against a freshly generated claude plugin tree.

The E2E suite uses the same binary probe order as `resolveClaudeBin` (`claude`, `claude.cmd`, `claude.exe`).

---

## 7. Behavioral Scenarios

**Scenario: First-time Claude setup on a machine with the claude CLI**

Given the claude CLI is installed and `dist/claude-marketplace/` does not exist
When `npm run setup:claude` is executed
Then `dist/claude-marketplace/` is created with the marketplace manifest and plugin tree
And `claude plugin marketplace add dist/claude-marketplace --scope user` is invoked
And `claude plugin install ospec-workflow@ospec-tools` is invoked
And the process exits 0
And the user is instructed to restart Claude Code or run `/reload-plugins`

**Scenario: Subsequent run of Claude setup (idempotent update)**

Given `dist/claude-marketplace/` exists from a prior build
And the marketplace `ospec-tools` is already listed in `claude plugin marketplace list`
And the plugin `ospec-workflow@ospec-tools` is already listed in `claude plugin list`
When `npm run setup:claude` is executed
Then the marketplace tree is rebuilt (old tree wiped, new tree written)
And `claude plugin marketplace update ospec-tools` is invoked
And `claude plugin update ospec-workflow@ospec-tools` is invoked
And the process exits 0

**Scenario: Build-only for hot-reload**

Given a Claude Code session is open
When `npm run reload:claude` is executed
Then the marketplace tree is rebuilt
And no `claude` CLI commands are invoked
And the user is instructed to run `/reload-plugins`

**Scenario: Claude setup when the claude CLI is not on PATH**

Given the `claude`, `claude.cmd`, and `claude.exe` binaries are all absent from PATH
When `npm run setup:claude` is executed
And the build step succeeds
Then the process exits 0
And a message is printed indicating that the built artifact is ready and the CLI was not found
And no marketplace or plugin commands are attempted

**Scenario: Install opencode workflow into a destination repository**

Given `<destRepo>` is an existing directory
And `<destRepo>` is not the source repo root and not the filesystem root
When `npm run install:opencode -- <destRepo>` is executed
Then `dist/opencode/` is (re)built from the source tree
And all top-level entries of `dist/opencode/` are copied recursively into `<destRepo>`, overwriting same-path files
And files in `<destRepo>` that are not part of the generated tree are left untouched
And the process exits 0

**Scenario: Dry-run preview for opencode install**

Given `<destRepo>` is a valid existing directory
When `npm run install:opencode -- <destRepo> --dry-run` is executed
Then the build runs
And the sync plan is printed (one line per top-level entry, prefixed with `·`)
And no files are written to `<destRepo>`
And the output ends with `[dry-run] no files written.`

**Scenario: Refused install into source repo**

Given `<destRepo>` resolves to the same absolute path as the source repo root
When `npm run install:copilot -- <destRepo>` is executed
Then `assertSafeDest` throws with a message containing `"equals the source repo"`
And the process exits 2
And no files are written

**Scenario: Build failure aborts sync**

Given the generator or validator reports a non-zero exit code
When `npm run install:opencode -- <destRepo>` is executed
Then the error is written to stderr
And no files are copied to `<destRepo>`
And the process exits with a non-zero code

**Scenario: Refused claude marketplace build into a non-prior-build directory**

Given `outDir` is a non-empty directory without `.claude-plugin/marketplace.json`
When `buildClaudeMarketplace` is called with that `out`
Then `assertSafeOutDir` throws before any files are modified
And the non-empty directory is left untouched

---

## 8. Requirements for Codex Installation

### Requirement: Native Codex Global Installation Is Idempotent {#REQ-install-001}

`install-codex.js` MUST install the generated AGENTS guidance, TOML agents, skills, hook runtime,
native hook configuration, and required global MCP definitions without using a plugin or marketplace.
The native installation MUST be idempotent: re-running the same install command a second time MUST
converge to the same final state without duplicating managed hook groups or corrupting prior output.
The MCP channel MUST use the native Codex CLI, reuse an existing server with the same
command and ordered arguments even when its name differs, and preserve an existing
same-name server with a different identity. The repository-local install MUST leave the
destination `.codex/config.toml` byte-for-byte unchanged.

#### Scenario: First install writes the native global runtime

- GIVEN no prior Codex install exists at the destination
- WHEN `npm run setup:codex` (or `install:codex -- <destRepo>`) runs
- THEN the router block in `AGENTS.md`, `.codex/agents/*.toml`, skills, runtime scripts and `hooks.json`
  are installed under the global Codex home
- AND the hook configuration contains no unresolved runtime placeholder

#### Scenario: Re-running install is idempotent

- GIVEN a prior successful Codex install exists at the destination
- WHEN the same install command is re-run unchanged
- THEN the resulting managed files are identical to the prior run (no duplicate
  TOML entries, hook groups, or drift in unrelated hook groups)
- AND each required MCP command identity exists at most once

#### Scenario: Project config.toml never touched

- GIVEN a destination repository `.codex/config.toml` exists with user-authored content
- WHEN the repository-local agent-TOML channel installs or updates
- THEN `.codex/config.toml` MUST remain byte-for-byte unchanged

### Requirement: Codex Installation and Operational Documentation {#REQ-install-002}

`docs/codex/README.md` MUST document, as part of the installation documentation surface:
(a) the install and update flow (`setup:codex` / `install:codex`), (b) how to review and
trust the `/hooks` cache entries for the codex payload, (c) the "new task" flow — a fresh
Codex task invoking the orchestrator via a TOML agent and receiving `SessionStart`
context, and (d) the rollback procedure (reverting to a previously published payload
without touching `.codex/config.toml`). Absence of any one of these four sections MUST
be treated as an incomplete documentation deliverable for this change.

#### Scenario: All four documentation sections present

- GIVEN `docs/codex/README.md` is read
- WHEN each of the four required topics is checked
- THEN install/update, `/hooks` review, new-task flow, and rollback sections are all
  present with concrete command examples

#### Scenario: Missing rollback section fails documentation review

- GIVEN `docs/codex/README.md` omits the rollback procedure
- WHEN the change's documentation deliverable is checked against this requirement
- THEN the documentation MUST be considered incomplete

### Requirement: Codex Smoke Test — Skill to Orchestrator to SessionStart {#REQ-install-003}

A minimal smoke test MUST exercise the published codex payload end-to-end at the
narrowest useful scope: a skill entry point invokes the orchestrator (via a TOML agent),
and the orchestrator's session initialization receives a valid `SessionStart` response
(hooks Requirement REQ-hooks-007). The smoke test MUST run against the actual generated
and installed payload (not a hand-authored fixture) and MUST be part of the standard
`npm test` suite. This smoke test is explicitly narrower than a full E2E apply/verify/4R
cycle (out of scope for this change).

#### Scenario: Smoke test passes over the published payload

- GIVEN the codex payload has been generated and installed
- WHEN the smoke test invokes the entry skill and follows the orchestrator dispatch to
  `SessionStart`
- THEN the `SessionStart` response is well-formed per REQ-hooks-007 and the test exits 0

#### Scenario: Smoke test runs in the standard suite

- GIVEN a contributor runs `npm test`
- WHEN the suite executes
- THEN the codex smoke test runs alongside existing install/generator tests with no
  separate invocation required

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
- AND each required MCP command identity exists at most once

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

---

## 9. Constraints and Invariants

- Node.js >=22 is REQUIRED. All install scripts use CommonJS (`"use strict"`, `require`).
- External CLI dependencies (`claude`) MUST be treated as optional: their absence MUST NOT cause a build failure or a non-zero exit code when the build itself succeeds.
- The `install-target.js` MUST NOT support the `claude` target (the TARGETS set is limited to `"opencode"` and `"github-copilot"`).
- `assertSafeOutDir` and `assertSafeDest` MUST throw synchronously before any destructive filesystem operation occurs.
- `spawnSync` MUST be used with `shell: false` for all CLI invocations to avoid .cmd shim resolution issues on Windows.
- The `dist/` directory is NOT committed to version control; it is generated on demand and is gitignored.
- Running any install command multiple times MUST produce the same final state (idempotency).

---

## 10. Unified Installation Engine Requirements

### Requirement: Unified Installation Ownership Manifest & Convergence {#REQ-install-008}

All global filesystem target installers (Cursor, Copilot, OpenCode, Codex, Antigravity) MUST persist an installation manifest (`.ospec-workflow-install.json` in their managed global root, as well as in `~/.agents/skills/` for Codex skills) recording the installed version, target, timestamp, and array of all files owned by OSpec Workflow. On subsequent executions, the installer MUST compute `stale = previous_owned - current_owned` and delete stale files while strictly preserving all user-created or third-party files. VS Code manages plugin registration via its `settings.json` `chat.pluginLocations` array.

#### Scenario: Stale agent or script removed after version upgrade
- GIVEN a previous installation recorded `agents/old-agent.md` in its ownership manifest
- WHEN the new version of OSpec Workflow no longer includes `old-agent.md` and `npm run setup:<target>` is executed
- THEN `agents/old-agent.md` MUST be deleted from the target destination
- AND all files belonging to the new version MUST be present and updated
- AND the ownership manifest MUST be updated with the current file list

#### Scenario: User-created custom files are preserved
- GIVEN the target home contains a user-created file `agents/my-custom-agent.md` not present in `.ospec-workflow-install.json`
- WHEN `npm run setup:<target>` runs
- THEN `agents/my-custom-agent.md` MUST NOT be deleted or overwritten

---

### Requirement: Fail-Closed Zero-Write User Config Parsing {#REQ-install-009}

When modifying existing target configuration files (`opencode.json`, `mcp-config.json`, `settings.json`, `hooks.json`), the installer MUST parse the configuration safely. If the existing file is unparseable or malformed, the installer MUST abort immediately with a diagnostic error and MUST NOT write to the file (zero-write fail-closed guarantee).

#### Scenario: Corrupted JSON configuration prevents destructive overwrite
- GIVEN a target user configuration file exists with invalid syntax (e.g. truncated JSON)
- WHEN `npm run setup:<target>` runs
- THEN the installer MUST fail with exit code non-zero
- AND the target configuration file MUST remain completely unmodified

#### Scenario: Valid existing configuration is merged non-destructively
- GIVEN a valid user configuration file with custom MCP servers or hooks
- WHEN `npm run setup:<target>` runs
- THEN OSpec keys MUST be added or updated under OSpec namespace/groups
- AND existing non-OSpec user keys MUST be preserved intact

---

### Requirement: Antigravity Target Profile & Standard Compiler Pipeline {#REQ-install-010}

Antigravity MUST be a first-class compiler target defined in `scripts/lib/target-profiles/antigravity.js` and registered in `PROFILES` (`scripts/configure/cli.js`). `npm run build:antigravity` and `npm run setup:antigravity` MUST build into `dist/antigravity` and install into `~/.gemini/config` using the standard transformation, model mapping, runtime script closure, validator, and transactional installer. The legacy script `scripts/sync-antigravity.js` MUST be removed.

#### Scenario: Antigravity builds and validates through standard CLI
- GIVEN the canonical repository source
- WHEN `npm run build:antigravity` is executed
- THEN `dist/antigravity` MUST contain transformed agents, skills, rules, hooks, and runtime scripts
- AND validation MUST pass with 0 errors

#### Scenario: Antigravity global installation is transactional
- GIVEN `npm run setup:antigravity` is executed
- THEN files are deployed into `~/.gemini/config`
- AND `~/.gemini/config/.ospec-workflow-install.json` is recorded
- AND pre-existing user hooks in `hooks.json` are preserved

---

### Requirement: Cursor MCP Synchronization & Non-Destructive Hook Merging {#REQ-install-011}

`scripts/configure/install-cursor.js` and the Cursor target transformer MUST translate canonical `.mcp.json` into Cursor's configuration format, and MUST merge OSpec hooks into `~/.cursor/hooks.json` while preserving all user-defined hook events and commands.

#### Scenario: Canonical MCP servers configured in Cursor
- GIVEN canonical `.mcp.json` contains `context7` and `markitdown`
- WHEN `npm run setup:cursor` runs
- THEN Cursor configuration MUST include equivalent MCP definitions

#### Scenario: Existing Cursor hooks preserved
- GIVEN `~/.cursor/hooks.json` contains pre-existing user hooks under `beforeShellExecution`
- WHEN `npm run setup:cursor` runs
- THEN OSpec hook commands MUST be present
- AND the user's pre-existing hook commands MUST remain in `~/.cursor/hooks.json`

---

### Requirement: OpenCode Fail-Closed Security Policy & Binary Requirement {#REQ-install-012}

The OpenCode target plugin (`.opencode/plugins/ospec.js`) and installer (`install-global-opencode.js`) MUST enforce fail-closed security. The installer MUST require the `ospec-hooks` binary. If the binary is missing or `tool.execute.before` hook execution fails, the tool call MUST be blocked (deny) rather than silently permitted.

#### Scenario: Missing binary fails installation
- GIVEN `release/dist/ospec-hooks` is absent
- WHEN `npm run setup:opencode` runs
- THEN the installer MUST fail with exit code non-zero unless binary resolution succeeds

#### Scenario: Plugin denies tool execution when hook process returns non-zero error
- GIVEN OpenCode plugin intercepts `tool.execute.before`
- WHEN `spawnSync` to `ospec-hooks pre-tool-use` encounters a policy deny or critical execution failure
- THEN the plugin MUST throw an Error blocking tool execution

---

### Requirement: Codex MCP Canonical Parity & Environment Variable Support {#REQ-install-013}

Codex MCP installation in `scripts/configure/install-codex.js` MUST derive server definitions dynamically from canonical `.mcp.json` without hardcoded static tables, and MUST forward declared `env` variables to `codex mcp add` / configuration.

#### Scenario: MCP server with environment variables registered in Codex
- GIVEN `.mcp.json` defines `context7` with `env: { CONTEXT7_API_KEY: ... }`
- WHEN `npm run setup:codex` runs
- THEN the registered Codex MCP definition MUST preserve the environment variable mapping

---

### Requirement: Claude Setup Strict CLI Exit Code Verification {#REQ-install-014}

`scripts/configure/install-claude.js` MUST check the exit code of every invocation of `claude plugin marketplace` and `claude plugin install/update`. If any CLI sub-command returns a non-zero exit code, the installer MUST abort immediately and exit with non-zero code.

#### Scenario: Claude CLI failure aborts installation
- GIVEN `claude plugin install` fails with exit code 1
- WHEN `npm run setup:claude` is executed
- THEN the script MUST abort immediately and exit with code 1 without printing a false success message

---

### Requirement: Fresh-Clone Automated Binary Provisioning {#REQ-install-015}

`npm run setup:*` and `copyBinaryToTree` MUST ensure the required `ospec-hooks` executable is provisioned. If the target platform binary is absent under `release/dist/`, the provisioning logic MUST attempt to compile it using the host's `go` compiler (`go build -o release/dist/ospec-hooks-... ./cmd/ospec-hooks`). If `go` is unavailable and the pre-built binary is absent, it MUST fail-closed when `required: true`.

#### Scenario: Fresh clone builds binary when Go is installed
- GIVEN a fresh repository clone where `release/dist/` has no pre-compiled binaries
- AND `go` is available on PATH
- WHEN `npm run setup:opencode` (or any setup requiring binary) is executed
- THEN `ospec-hooks` binary MUST be automatically compiled to `release/dist/` and copied to the target tree

---

### Requirement: Transient Filesystem Error Resilience Across Installer Targets {#REQ-install-016}

All installer targets (Antigravity, Cursor, GitHub Copilot, OpenCode, Codex, VS Code, and repository sync) MUST execute leaf filesystem mutations (writes, copies, deletions, and directory creations) through a centralized transient retry policy. The system MUST retry filesystem operations encountering transient error codes `EPERM`, `EACCES`, and `EBUSY` with bounded attempts (at most 5 attempts, default 3 retries) and backoff. The system MUST NOT retry non-transient or permanent errors (such as `ENOENT`, `ENOSPC`, or malformed configurations), and MUST fail immediately on the initial attempt. Merges, JSON/JSONC parsing, and content computation MUST execute prior to retry loops to ensure only minimal, idempotent filesystem mutations are repeated. External CLI processes and non-idempotent operations MUST NOT be wrapped in retry loops.

#### Scenario: Transient lock succeeds within retry budget

- GIVEN a destination file or directory encounters a transient `EPERM`, `EACCES`, or `EBUSY` lock
- WHEN an installer target performs a filesystem write, copy, remove, or directory creation
- THEN the operation MUST retry with incremental backoff
- AND succeed once the lock clears without failing the installation

#### Scenario: Permanent error fails immediately without retries

- GIVEN an operation encounters a non-transient filesystem error such as `ENOENT`
- WHEN a filesystem mutation or read is executed
- THEN the installer MUST fail immediately on the initial attempt without sleeping or retrying
- AND the original error code and stack MUST be preserved

#### Scenario: Transient lock exhaustion fails closed

- GIVEN a file lock persists across all configured retry attempts
- WHEN the mutation reaches maximum attempts
- THEN the installer MUST terminate and throw an enriched error
- AND the error MUST preserve the original error `code` (`EPERM`, `EACCES`, `EBUSY`) and `cause`

---

### Requirement: Resilient Rollback on Transient Filesystem Locks {#REQ-install-017}

When an installation step aborts or encounters a fatal error mid-execution, rollback mechanisms across all targets—including `createRollbackJournal` and Codex `createFilesystemTransaction.rollback()` / `restorePath`—MUST apply the transient filesystem retry policy to every individual rollback mutation (file restoration, newly created file removal, mode restoration, and directory cleanup). Rollback steps MUST NOT fail immediately on transient `EPERM`, `EACCES`, or `EBUSY` locks. If rollback mutations exhaust all retries or encounter unrecoverable errors, the rollback handler MUST aggregate and surface all unrestored paths and error causes in diagnostic reporting rather than silently masking unrestored state.

#### Scenario: Rollback succeeds despite transient lock on restored file

- GIVEN an installation encounters an error after modifying managed destination files
- AND a transient `EBUSY`, `EPERM`, or `EACCES` lock is encountered during file restoration
- WHEN rollback executes via `createRollbackJournal` or `createFilesystemTransaction`
- THEN the restoration step MUST retry with backoff and successfully restore original contents once the lock clears

#### Scenario: Rollback removes newly created paths under transient lock

- GIVEN newly created files or directories were added during an aborted installation attempt
- AND a temporary lock occurs when removing a newly created path during rollback
- WHEN the rollback process cleans up newly created entries
- THEN the removal MUST retry with backoff and remove the paths without leaving dangling files

#### Scenario: Exhausted rollback surfaces unrestored paths

- GIVEN a persistent filesystem lock prevents restoration or removal of paths during rollback
- WHEN all retry attempts in rollback are exhausted
- THEN the installer MUST record every failed path restoration
- AND the diagnostic output MUST explicitly list each unrestored path and its failure reason

---

### Requirement: Actionable Diagnostics and Target Identity Preservation {#REQ-install-018}

When filesystem mutations fail or exhaust retries across any installer phase (including target tree sync, hook merges, settings updates, manifest writes, and stale file pruning via `pruneStaleFiles`), the diagnostic error MUST explicitly identify the specific installer target (e.g. `antigravity`, `cursor`, `codex`, `vscode`, `opencode`, `github-copilot`). The error message and metadata MUST structure and expose: (a) target identifier, (b) operation name, (c) target path, (d) total attempt count, and (e) actionable user remediation advice instructing the user to close locking host applications or background processes. Stale file pruning (`pruneStaleFiles`) MUST propagate the target context and retry options to prevent defaulting to a generic untargeted diagnostic.

#### Scenario: Mutation exhaustion emits structured diagnostic with target name and remedy

- GIVEN a mutation fails after exhausting all retries on a specific target
- WHEN the enriched error is generated
- THEN the error message MUST include the target name, failed operation name, target path, attempt count, and error code
- AND the error MUST provide actionable advice to close processes locking the path
- AND the error object MUST attach `code`, `attempts`, `operation`, `path`, and `target` properties

#### Scenario: Stale file pruning exhaustion preserves target identity

- GIVEN stale file pruning (`pruneStaleFiles`) executes during `install-antigravity`, `install-cursor`, or `install-codex`
- AND a stale file removal exhausts transient retries due to a persistent lock
- WHEN the pruning operation fails
- THEN the diagnostic error MUST identify the exact calling installer target

---

## 11. Guided TUI and Adapter Plan Requirements

### Requirement: Guided Single-Target Installer TUI {#REQ-install-019}

The system MUST provide a Go TUI that receives seven supported targets from its
adapter, schedules exactly one target per run, and uses preset-first hierarchical
configuration for selectable targets. A selectable target MUST flow through preset,
grouped phase customization, compatible model/reasoning selection, and review;
choosing a preset MAY skip customization and proceed to review. Antigravity MUST show
inheritance and no target-specific selector. Back from any non-initial step MUST retain
valid selections.
(Previously: the TUI used a flat per-agent model step and only non-editable targets bypassed it.)

#### Scenario: Select one target

- GIVEN the installer starts without a target
- WHEN the user selects one adapter-supplied target and continues
- THEN subsequent steps MUST use that target only

#### Scenario: Select a preset

- GIVEN the selected target exposes presets
- WHEN the user selects one preset
- THEN all phase assignments MUST resolve from that preset
- AND the TUI MUST advance to review without requiring linear agent traversal

#### Scenario: Customize grouped phases

- GIVEN the user selects Custom for a selectable target
- WHEN the phase-group screen is displayed
- THEN phases MUST be grouped for navigation
- AND entering a phase MUST open only that phase's model and compatible-control choices

#### Scenario: Antigravity remains inherited

- GIVEN the user selects Antigravity
- WHEN target configuration is displayed
- THEN the TUI MUST show inherited host behavior
- AND MUST NOT offer a model, preset, or reasoning selector

#### Scenario: Back retains selections

- GIVEN the user selected a target, preset or phase choices, and available models
- WHEN the user goes Back and continues without changes
- THEN the same selections MUST be displayed

---

### Requirement: Capability-Evidenced Per-Agent Model Choices {#REQ-install-020}

The adapter plan MUST declare each agent's selectability, finite supported models, and
compatible reasoning controls. The TUI MUST offer only declared choices, reject
free-form or unsupported identifiers, and display inherited behavior otherwise.
GitHub Copilot MUST expose the same selectable configuration surface and choice
semantics as VS Code. Antigravity MUST display inheritance and omit multi-model
selection; a missing configuration column alone MUST NOT prove model support.
(Previously: GitHub Copilot was treated as inherited while VS Code was selectable.)

#### Scenario: Select a supported model

- GIVEN the target has adapter-declared model choices
- WHEN the user selects one model for an agent
- THEN only that agent's plan entry MUST record the selected model
- AND the summary MUST show its effective model and compatible control

#### Scenario: GitHub Copilot matches VS Code configurability

- GIVEN VS Code and GitHub Copilot expose the same canonical model catalog
- WHEN the user configures either target in the TUI
- THEN both targets MUST expose equivalent preset/phase/model navigation
- AND each request MUST retain its target-specific value representation

#### Scenario: Bypass inherited models

- GIVEN the user selects Antigravity
- WHEN the TUI reaches model selection
- THEN it MUST show inheritance and offer no model-choice control

#### Scenario: Unsupported selection is rejected

- GIVEN a request contains an agent, model, preset, or control absent from a fresh plan
- WHEN the adapter validates the request
- THEN it MUST reject the request before installation

---

### Requirement: Review Before Explicit Installation {#REQ-install-021}

The TUI MUST summarize the selected target, preset or custom mode, every agent's
selected or inherited behavior, and each selected compatible reasoning control before
installation. The summary MUST also list the optional packages of the plan (SDD mode
and extras, REQ-install-036 and REQ-install-032), numbered, each toggled by its digit;
none is selected at first, which keeps each installer's default. It MUST invoke no target installer or destination write before explicit
Install. Cancel, exit, and Back from summary MUST preserve or discard the plan without
installation.
(Previously: the summary listed selected or inherited models but had no preset or reasoning-control state.)

#### Scenario: Summary waits for Install

- GIVEN a valid plan and a rendered summary
- WHEN the summary is displayed before Install
- THEN no installer invocation or destination write MUST occur

#### Scenario: Edit from summary

- GIVEN the summary shows an effective model or reasoning control
- WHEN the user chooses Back, changes an allowed value, and returns
- THEN the revised summary MUST retain all other selections

---

### Requirement: Adapter Plan and Delegated Installation {#REQ-install-022}

The Node adapter MUST expose a machine-readable, read-only plan from canonical target,
preset, phase, catalog, and capability configuration without changing `models.yaml`.
It MAY merge bounded Codex/OpenCode discovery according to REQ-install-025. On Install
it MUST revalidate the target, preset, phase selections, opaque choice IDs, and
target-compatible controls against a fresh plan, pass the resulting values as an
in-memory override, and delegate only the selected target to its compatible existing
`main(argv, deps)` installer seam. The plan MUST list the optional packages (`sdd`,
`extras`) with a label and a description; a request MAY name them in `packages`, each
at most once, and the adapter MUST pass them to the installer as `--with-sdd` and
`--with-extras` and reject an unknown or repeated one before any installer runs. It MUST preserve installer outcomes and diagnostics
and MUST NOT duplicate validation, transaction, rollback, manifest, or destination-write
behavior.
(Previously: the plan contained target/model choices only and did not define hierarchical or discovery state.)

#### Scenario: Planning is read-only

- GIVEN a caller requests an adapter plan
- WHEN it returns targets, presets, model capabilities, and inherited states
- THEN `models.yaml`, destination paths, and discovery configuration MUST remain unmodified

#### Scenario: Confirmed plan delegates once

- GIVEN a displayed plan remains valid at confirmation
- WHEN the user chooses Install
- THEN exactly the selected installer MUST run once
- AND its outcome and diagnostics MUST reach the TUI

#### Scenario: Invalid plan is refused

- GIVEN confirmation contains a target, preset, model, or control absent from a fresh plan
- WHEN the adapter revalidates it
- THEN it MUST reject before installer invocation or destination write

#### Scenario: Discovery failure does not invalidate installation

- GIVEN Codex/OpenCode discovery fails while the static catalog is valid
- WHEN a user confirms a static-catalog selection
- THEN revalidation MUST succeed from the static plan
- AND the selected installer MUST be delegated normally

---

### Requirement: Installer TUI Contract Coverage {#REQ-install-023}

Automated tests MUST cover navigation retention, capability-gated models, the no-write confirmation boundary, and selected-target delegation.

#### Scenario: Contract tests pass

- GIVEN the Go TUI and Node adapter tests run with observable installer seams
- WHEN they exercise navigation, cancellation, and confirmation
- THEN they MUST observe no pre-Install invocation and one selected-target invocation after confirmation

---

### Requirement: Searchable Model Choices and Compatible Reasoning Controls {#REQ-install-024}

For every selectable target, the installer plan MUST expose finite model choices and
only the reasoning controls declared compatible with the selected model and target.
The TUI MUST provide case-insensitive search over visible choices, preserve the query
and selected value when returning with Back, and MUST NOT present unsupported controls.
Claude choices MAY expose `effort`, Codex choices MAY expose
`model_reasoning_effort`, and OpenCode choices MAY expose `variant`; other fields MUST
remain target-defined rather than inferred by the TUI.

#### Scenario: Search narrows choices without changing the selected value

- GIVEN a selectable target has multiple model choices and a current selection
- WHEN the user enters a case-insensitive search query
- THEN only matching choices MUST be shown
- AND clearing the query MUST restore the complete finite choice set

#### Scenario: Compatible control is shown after model selection

- GIVEN a selected model declares a finite set of supported reasoning values
- WHEN the user opens its reasoning control
- THEN the TUI MUST show only those values and record the selected value in the review

#### Scenario: Unsupported control is unavailable

- GIVEN a selected model has no declared `effort`, `model_reasoning_effort`, or `variant`
- WHEN the user configures that phase
- THEN the TUI MUST skip or disable the reasoning step
- AND the installation request MUST contain no unsupported control

#### Scenario: Back retains search and reasoning state

- GIVEN the user searched for a model and selected a model/control pair
- WHEN the user goes Back to the phase list and re-enters the choice
- THEN the query, selected model, and selected control MUST remain valid and visible

---

### Requirement: Bounded Codex and OpenCode Discovery with Static Fallback {#REQ-install-025}

The adapter MAY discover models for `codex` and `opencode` only when their supported
local CLI is available. Discovery MUST be bounded by a finite timeout, parse and
deduplicate only valid capability-bearing entries, and merge them with the static
`models.yaml` catalog without replacing it. If a CLI is unavailable, times out,
returns malformed data, or returns no usable entries, the adapter MUST return a valid
plan from the static catalog. Discovery MUST NOT run for any other target.

#### Scenario: Usable discovery augments the static catalog

- GIVEN the Codex or OpenCode CLI is available and returns valid model entries
- WHEN the adapter builds a plan
- THEN the plan MUST contain the valid discovered entries and all applicable static entries
- AND duplicate choices MUST occur only once

#### Scenario: Discovery timeout falls back safely

- GIVEN the discovery command exceeds its configured timeout
- WHEN the adapter builds a plan
- THEN the plan MUST complete with static catalog choices
- AND the TUI MUST remain usable without a discovery error

#### Scenario: Discovery is not attempted for IDE targets

- GIVEN the adapter builds a plan for `claude`, `vscode`, `github-copilot`, `cursor`, or `antigravity`
- WHEN plan generation runs
- THEN no discovery command MUST be invoked

#### Scenario: Capability-incompatible discovered entry is excluded

- GIVEN OpenCode discovery returns an entry without the required model capability
- WHEN the adapter normalizes discovered entries
- THEN that entry MUST be excluded from selectable choices
- AND the static fallback entries MUST remain available

### Requirement: Quality Review Attribution Build Propagation {#REQ-install-026}

When the Quality Review Gate attribution-resolution behavior changes
(`scripts/lib/review-dimensions.js`, `review-gate-state.js`,
`review-lineage.js`, or their skills/rules sources), the generated build MUST
be regenerated and validated for the four in-scope targets: `claude`, `vscode`,
`github-copilot`, and `opencode`. Each target's installer and validator
(`scripts/configure/install-*.js`, `validate-*.js`) MUST cover the attribution
behavior, including each target's native tool mappings where the target
expresses tools differently from the kernel vocabulary. `codex`, `cursor`, and
`antigravity` targets MUST remain unchanged by this propagation. Generated
dist MUST be validated per target via its `validate-*` entry point, and dist
tests MUST self-generate output in a temporary directory rather than read the
gitignored root `dist/`.

#### Scenario: Four targets regenerate with attribution changes

- GIVEN kernel review-dimensions/gate-state/lineage sources changed for attribution resolution
- WHEN the build is regenerated
- THEN `claude`, `vscode`, `github-copilot`, and `opencode` dist outputs MUST reflect the change
- AND each target's `validate-*` run MUST pass

#### Scenario: Native tool mappings cover attribution behavior per target

- GIVEN a target expresses review/gate tools with native mappings
- WHEN that target's generated output is validated
- THEN the attribution-resolution behavior MUST be present through its native tool mapping
- AND unmapped kernel tool references MUST fail that target's validation

#### Scenario: Out-of-scope targets are untouched

- GIVEN the regenerated build for the four in-scope targets
- WHEN `codex`, `cursor`, and `antigravity` outputs are compared to their prior build
- THEN those targets MUST remain byte-equivalent (no attribution-driven changes)

---

# Delta for install

## ADDED Requirements
### Requirement: Global Validate-Phase Separates Plugin and Project Roots {#REQ-install-027}

When `validate-phase` runs from a globally installed target layout, it MUST resolve the plugin/runtime root independently from the project workspace root. Project-owned OpenSpec state and artifacts under the consumer project's `openspec/` MUST be resolved relative to the project workspace, not relative to the plugin install location. Plugin/runtime assets required for validation MUST be resolved from the plugin/runtime root. Collapsing both roots into a single path MUST NOT be the default behavior for global installs.

This separation MUST hold for Claude Code and for at least one other globally installed target. An in-repository or repo-relative invocation MAY continue to resolve both roots consistently with the repository layout when plugin and project coincide, without relaxing the global-install separation requirement.

Acceptance of the global-install root split MUST include an independent Node process whose current working directory (`cwd`) is a consumer project that does not contain the `validate-phase` script. Passing that process an explicit plugin script path and project `--workspace` MUST succeed at keeping plugin and project roots distinct. An in-process call such as `main({ scriptDir })` (or equivalent same-process root injection) MAY be used as a unit aid, but MUST NOT be the sole acceptance evidence for this requirement.

(Previously: Root separation was required for global installs, but acceptance did not require an independent Node process whose cwd is a project that lacks the script.)

#### Scenario: Globally installed Claude Code validates project openspec

- GIVEN Claude Code is installed globally so the plugin/runtime root differs from the consumer project workspace
- AND the project workspace contains an `openspec/` tree for the active change
- WHEN `validate-phase` runs against that project
- THEN it MUST resolve plugin/runtime assets from the plugin/runtime root
- AND MUST resolve project `openspec/` paths from the project workspace
- AND MUST NOT require `openspec/` to live under the plugin install root

#### Scenario: At least one other globally installed target keeps the same root split

- GIVEN a second globally installed target other than Claude Code whose plugin/runtime root differs from the project workspace
- WHEN `validate-phase` runs for that target against the same project workspace
- THEN it MUST apply the same plugin-root versus project-workspace separation
- AND project `openspec/` MUST resolve from the project workspace

#### Scenario: Collapsed roots on global install fail closed or misresolution is rejected

- GIVEN a globally installed layout where plugin/runtime root and project workspace differ
- WHEN `validate-phase` would otherwise treat the plugin root as the sole project root for `openspec/` lookup
- THEN that collapsed resolution MUST NOT be accepted as a successful project validation
- AND the invocation MUST fail closed or otherwise refuse to treat plugin-local paths as the project's authoritative `openspec/`

#### Scenario: In-repo invocation remains valid when roots coincide

- GIVEN an in-repository invocation where the plugin/runtime root and project workspace are the same repository root
- WHEN `validate-phase` runs
- THEN it MUST still resolve project `openspec/` correctly
- AND MUST NOT break existing repo-relative validation solely because global-install root separation is required elsewhere

#### Scenario: Independent Node process with foreign cwd proves root separation

- GIVEN a consumer project workspace that does not contain the `validate-phase` script
- AND the plugin/runtime root that does contain the script differs from that project workspace
- WHEN an independent Node process runs with `cwd` set to that project workspace and invokes `validate-phase` via the plugin install path with an explicit project `--workspace`
- THEN the process MUST resolve plugin assets from the plugin/runtime root and project `openspec/` from the project workspace
- AND an in-process `main({ scriptDir })` (or equivalent) alone MUST NOT count as sufficient acceptance for this scenario
# Delta for install

## ADDED Requirements

### Requirement: Target Installers Detect Engram Fail-Open {#REQ-install-028}

Every global target installer (`setup:claude`, `setup:codex`, `setup:antigravity`, `setup:opencode`, `setup:cursor`, `setup:vscode`, `setup:copilot`) MUST detect, by capability and not by version, whether the Engram binary is on PATH and whether the host already has both the `engram` MCP server and its memory-protocol piece (Claude/Codex: the `engram@engram` plugin; Antigravity: the marked GEMINI.md block; OpenCode: `plugins/engram.ts`; Cursor: `engram-memory-protocol.md`; VS Code: `prompts/engram.instructions.md`; Copilot CLI: no separate piece). The installers MUST NOT invoke `engram doctor`, either during initial detection or when re-checking setup; the whole-store diagnostic remains available through the explicit `ospec doctor` command (REQ-idd-019). Detection MUST be non-fatal: absence, probe failure or timeout MUST NOT change the install outcome, the exit code, or the existing REQ-install-014 exit-code checks for ospec's own steps. The step MUST NOT run on `--dry-run`, `--build-only`, a custom `--dest`/repo destination, or after a failed install. The installers MUST NOT download or install the Engram binary.

#### Scenario: Engram absent

- GIVEN no Engram binary on PATH
- WHEN any `npm run setup:<target>` runs
- THEN it prints informational install guidance only and exits 0 if ospec's own steps succeed

#### Scenario: Installation does not scan the Engram store

- GIVEN the binary exists and `engram doctor` would error or time out
- WHEN a target installer runs
- THEN it detects the host's registration without invoking `engram doctor`
- AND if setup runs, the re-check also omits `engram doctor`
- AND the host's registration and the installer exit code follow the existing setup rules

### Requirement: Engram Setup Runs Automatically Unless Disabled {#REQ-install-029}

When the Engram binary is on PATH and the host is not fully configured, the installer MUST configure it automatically: it MUST run the idempotent upstream `engram setup <agent>` for the target (`claude-code`, `codex`, `antigravity-cli`, `opencode`, `cursor`, `vscode-copilot`). Copilot CLI has no upstream setup, so the installer MUST instead merge a stdio `engram mcp --tools=agent` entry into `~/.copilot/mcp-config.json`, preserving every other key and server and never rewriting an unparseable file. `--no-engram` MUST disable every Engram mutation and print how to enable it. The legacy `--with-engram` flag MUST be accepted without effect. Any failure MUST be reported as a warning without failing ospec's own install. Embedded or test invocations of an installer `main` MUST NOT reach the real upstream setup unless the caller injects the step (the CLI entry and the TUI adapter do).

#### Scenario: Default run configures Engram

- GIVEN Engram is installed but not registered for the target host
- WHEN `npm run setup:<target>` runs without flags
- THEN the target's upstream setup (or the Copilot CLI MCP merge) runs once and the result is re-checked

#### Scenario: Opt-out

- GIVEN the user passes `--no-engram`
- WHEN the installer runs
- THEN no Engram-related command that mutates user configuration runs and guidance is printed

### Requirement: Engram Registration Is Idempotent {#REQ-install-030}

Engram counts as configured for a host only when BOTH its `engram` MCP server (the `mem_*` tools) and its memory-protocol piece are present. A single piece alone is NOT configured, and any piece that cannot be read (for example a missing `claude`/`codex` CLI or an unparseable config) MUST lead to no change. When both are present, the installer MUST NOT register anything again and MUST report it as already configured. After a setup action, the installer MUST re-check both pieces and warn (without failing) when one is still missing, naming the manual fix. Re-running MUST converge to the same state.

#### Scenario: Already registered

- GIVEN the Engram MCP server and protocol piece are already present for the host
- WHEN the installer runs
- THEN no registration command is issued and the output states it is already configured

#### Scenario: Plugin registered without MCP server

- GIVEN the Claude `engram@engram` plugin is registered but no `engram` MCP server is listed
- WHEN `setup:claude` runs
- THEN `engram setup claude-code` runs and the output confirms the configuration, or a warning names the manual fix when it is still incomplete

### Requirement: Windows Prompt-Capture Safe Mode Is Decided by Measurement {#REQ-install-031}

On Windows, after Engram is configured for Claude Code, `setup:claude` MUST decide the upstream hook's Git Bash safe mode with a bounded fork probe instead of leaving prompt capture silently disabled. When the probe succeeds within its budget, it MUST merge `ENGRAM_CLAUDE_WINDOWS_BASH_SAFE_MODE=0` into the `env` block of `~/.claude/settings.json`, preserving every other setting. When the probe is slow, fails or Git Bash is not found, it MUST keep the safe mode and print how to override it. It MUST NOT overwrite a value the user already set (in settings or the environment), MUST NOT rewrite an unparseable settings file, and MUST NOT run on other targets or platforms.

#### Scenario: Fast forks

- GIVEN Windows, Engram configured for Claude Code, and a fork probe within budget
- WHEN `setup:claude` runs
- THEN `ENGRAM_CLAUDE_WINDOWS_BASH_SAFE_MODE=0` is written and other settings are kept

#### Scenario: User already decided

- GIVEN the variable is already set by the user
- WHEN `setup:claude` runs
- THEN no probe runs and the value is left unchanged

### Requirement: Installers Accept The Extras Package Flag {#REQ-install-032}

Every target installer (`setup:claude`, `setup:vscode`, `setup:copilot`, `setup:opencode`, `setup:codex`, `setup:cursor`, `setup:antigravity`) and the repo-local `install-target` MUST accept `--with-extras` and forward it to the build (REQ-generator-021). Without the flag they MUST install the default package. Because installs prune files of the previous install that the new build no longer has, re-running an installer without the flag removes extras installed earlier.

#### Scenario: Flag reaches the build

- GIVEN any installer run with `--with-extras`
- WHEN it builds its target
- THEN the build receives `withExtras: true`, and `false` when the flag is absent

### Requirement: Router Installs As A Marked Block {#REQ-install-033}

Where the router lands in a file the user also owns (`~/.claude/CLAUDE.md` for `setup:claude`; `~/.codex/AGENTS.md` for `setup:codex`; `<destRepo>/AGENTS.md` for `install:codex -- <destRepo>`), the installer MUST write it between the `<!-- ospec-workflow:router:begin -->` and `<!-- ospec-workflow:router:end -->` markers (`scripts/configure/instruction-block.js`): a reinstall replaces only that block, the text around it is preserved, and a begin marker without its end marker fails the install instead of being guessed. An `AGENTS.md` that a pre-E0.4 install owned whole (listed in the ownership manifest, or carrying the `# SDD Orchestrator` heading without markers) MUST be replaced by the block, never pruned. `--no-router` MUST skip the router and remove a block an earlier install wrote, deleting the file only when nothing else is left. `setup:claude` writes the block only after the plugin is installed or updated, never with `--build-only` or without the `claude` CLI. The other targets install the router as one more global rule file, which their ownership manifests already prune.

#### Scenario: User text survives install and removal

- GIVEN `~/.codex/AGENTS.md` holds the user's own instructions
- WHEN `setup:codex` runs twice and then once with `--no-router`
- THEN after each install the file holds the user's text followed by one router block, and after the last run it holds only the user's text

#### Scenario: Pre-E0.4 orchestrator copy is migrated

- GIVEN `~/.codex/AGENTS.md` is the orchestrator copy that the previous install listed in its manifest
- WHEN `setup:codex` runs
- THEN the file holds only the router block and is not deleted

### Requirement: Installers Render The Shared Handler Directory {#REQ-install-034}

Each installer that ships an orchestrator carrying `__OSPEC_SHARED_DIR__` (REQ-generator-023) MUST replace the marker with the directory where it installs `skills/_shared/` (`scripts/configure/shared-dir.js`): the absolute POSIX path for a global install (`setup:copilot`, `setup:opencode`, `setup:cursor`, `setup:codex` under `~/.agents/skills`, and `setup:antigravity` per destination root, a WSL root written as its Windows path), the absolute path of `dist/vscode` for `setup:vscode`, which VS Code loads in place, and a path relative to the repository root for a repository install (`skills/_shared` for `install-target`; `.agents/skills/_shared` for `install:codex -- <destRepo>`, which now also installs `_shared` beside the orchestrator skill). Except on VS Code, the marker MUST be rendered only for the sync and restored in the generated tree afterwards, also when the sync fails, so `dist/` stays deterministic and one build can serve several roots. An empty value or one that still holds the marker MUST fail the install. `setup:claude` renders nothing: Claude Code substitutes `${CLAUDE_SKILL_DIR}` itself.

#### Scenario: A global install names its own shared directory

- GIVEN `setup:copilot` runs with `--dest <root>`
- WHEN the installed orchestrator is read
- THEN it names `<root>/skills/_shared/gate-4r-review.md` as an absolute POSIX path, the file exists, and the generated orchestrator in `dist/` still holds the marker

#### Scenario: A repository install stays portable

- GIVEN `install:codex -- <destRepo>` runs
- WHEN `<destRepo>/.agents/skills/sdd-orchestrator/SKILL.md` is read
- THEN it names `.agents/skills/_shared/` relative to the repository, and `<destRepo>/.agents/skills/_shared/` holds the shared handlers

### Requirement: Installers Render The Runtime Directory {#REQ-install-035}

Each installer that ships the IDD protocol carrying `__OSPEC_RUNTIME_DIR__` (REQ-generator-024) MUST replace the marker with the directory that holds the installed runtime `scripts/` (`scripts/configure/shared-dir.js`): the install root as an absolute POSIX path for `setup:copilot`, `setup:opencode`, `setup:cursor` and `setup:antigravity` (a WSL root written as its Windows path), `~/.codex/ospec-workflow` for `setup:codex`, the absolute path of `dist/vscode` for `setup:vscode`, and `.` for `install-target`, which syncs the tree into the repository root. The marker follows the rendering and restore rules of REQ-install-034. An empty value or one that still holds the marker MUST fail the install. `setup:claude` renders nothing. `install:codex -- <destRepo>` installs no runtime and does not install the protocol.

#### Scenario: A global install names its own runtime

- GIVEN `setup:copilot` runs with `--dest <root>`
- WHEN the installed `skills/idd/SKILL.md` is read
- THEN it runs `node "<root>/scripts/ospec.js"` as an absolute POSIX path, that file exists, and the generated protocol in `dist/` still holds the marker

#### Scenario: A repository install stays portable

- GIVEN `install-target github-copilot <repo>` runs
- WHEN `<repo>/skills/idd/SKILL.md` is read
- THEN it runs `node "./scripts/ospec.js"`, and `<repo>/scripts/ospec.js` exists

### Requirement: Installers Install SDD On Request And Keep It {#REQ-install-036}

Every target installer (`setup:claude`, `setup:vscode`, `setup:copilot`, `setup:opencode`, `setup:codex` global and `install:codex -- <destRepo>`, `setup:cursor`, `setup:antigravity`) and the repo-local `install-target` MUST accept `--with-sdd` and `--no-sdd` (`scripts/configure/sdd-package.js`) and pass the result to the build as `withSdd` (REQ-generator-025). `--with-sdd` installs the SDD package and `--no-sdd` leaves it out. With neither flag, the installer MUST keep SDD when its previous install held it, read before the build: from the ownership manifest where the target keeps one (`setup:copilot`, `setup:opencode`, `setup:cursor`, `setup:antigravity` per destination root, and global `setup:codex`), and otherwise from the `sdd-*` entries of the agents directory that install wrote (`dist/vscode/agents` for `setup:vscode`, the marketplace build's plugin `agents/` for `setup:claude`, `<destRepo>/.codex/agents` for `install:codex -- <destRepo>`, and `.opencode/agents` or `.github/agents` for `install-target`). Runtime scripts and `skills/_shared/` never count as the package, and an unreadable manifest holds nothing. When it keeps SDD without the flag, the installer MUST say so and name `--no-sdd`. Both flags together MUST be a usage error before any build. A first install without the flag installs no SDD; a reinstall with `--no-sdd` prunes it through the ownership manifest as any other file the build no longer has.

#### Scenario: A reinstall keeps SDD

- GIVEN any installer whose previous install held the SDD package
- WHEN it runs again without `--with-sdd` or `--no-sdd`
- THEN its build receives `withSdd: true`, and `false` when `--no-sdd` is given

#### Scenario: A first install is lean

- GIVEN any installer with no previous install
- WHEN it runs without flags
- THEN its build receives `withSdd: false`, and `true` with `--with-sdd`

### Requirement: Published Descriptions Lead With IDD {#REQ-install-037}

`package.json`, `.plugin.json` and `.claude-plugin/plugin.json` MUST publish one description that starts with `Impact-driven development (IDD)` and names Spec-Driven Development as the optional SDD mode. The Claude marketplace built by `scripts/configure/claude-marketplace.js` MUST copy that description from the source `.claude-plugin/plugin.json` into its plugin entry instead of keeping its own text.

#### Scenario: One description everywhere

- GIVEN the plugin manifests and `package.json`
- WHEN a release publishes them or builds the Claude marketplace
- THEN every description is the same IDD-first text, and the marketplace entry carries the source manifest's description

### Requirement: Installers Share One Output And Survive A Live Plugin Tree {#REQ-install-038}

Every target installer (`setup:claude`, `setup:vscode`, `setup:copilot`, `setup:opencode`, `setup:codex` global and `install:codex -- <destRepo>`, `setup:cursor`, `setup:antigravity`) MUST write through the reporter of `scripts/configure/install-output.js`, in Spanish: a header naming the host, one line per phase in the form `✓ [n/N] <fase> (<s> s)` (or `✗` when it fails), the Engram step as the last phase when it runs, and a final summary (`Listo · <host>` with destination, files, packages, next step and total time, or `✗ Instalación fallida · <host> (código N)`). On an interactive terminal (TTY, no `CI`, `TERM` not `dumb`) the running phase MUST show as `… [n/N] <fase>` and be rewritten in place when it ends; elsewhere each phase prints one line when it ends. The per-file lists, the validator output and the host CLI output MUST print only with `--verbose`, which the installer consumes before its own argument parser; warnings and errors always print, and a failed build always shows the validator output. The output change MUST NOT change what is installed. `configure --target` (`scripts/configure/cli.js`) keeps its own output.

A filesystem mutation that still fails with `EPERM`, `EACCES` or `EBUSY` after its retries MUST raise an error that keeps the code and names the operation, the path and the action, naming the host to close (`Cierra VS Code (o el proceso que use esa ruta) y reintenta la instalación.`). The build publication of `scripts/configure/cli.js` stays an atomic rename, except for the tree a host loads live (`dist/vscode` for `vscode`): when renaming that destination meets one of those codes, it MUST write the already validated tree in place (overwrite and prune within the managed roots, then validate the result), report `publication: "in-place"`, and leave no staging, backup or lock behind. If the in-place write also fails, the error MUST say that the destination is half updated and to run the installation again. Any other target fails with the actionable error and keeps its destination intact.

#### Scenario: VS Code holds dist/vscode open

- GIVEN `dist/vscode` cannot be renamed because VS Code or a shell has it open
- WHEN `setup:vscode` runs
- THEN the build is written in place, the summary says so, and the installation ends with code 0

#### Scenario: A locked destination without in-place publication

- GIVEN any other target whose destination rename fails with `EPERM`
- WHEN its build is published
- THEN the error names `renombrar`, the destination path and the host to close, and the destination is unchanged

#### Scenario: Seven installers, one format

- GIVEN any of the seven installers
- WHEN it runs without `--verbose`
- THEN it prints the header, one line per phase and the final summary, and no per-file list

### Requirement: The Live VS Code Tree Is Published Prepared Or Not At All {#REQ-install-039}

`setup:vscode` MUST never leave `dist/vscode`, the tree VS Code loads live, holding a build that is not fully prepared. `runConfigure` (`scripts/configure/cli.js`) MUST accept a `prepareTree(dir)` step and run it on the validated stage before publishing it, and on the destination after an in-place publication (REQ-install-038). `setup:vscode` uses that step to copy the hooks binary and to render `__OSPEC_SHARED_DIR__` and `__OSPEC_RUNTIME_DIR__` (REQ-install-034, REQ-install-035) with the paths of `dist/vscode`, so a failure in it leaves the previous `dist/vscode` unchanged and no staging, backup or lock behind. With `--dry-run`, `setup:vscode` MUST build, validate and render in a temporary directory that it removes afterwards, report the result as it does today, and leave `dist/vscode` byte for byte as it was (absent if it did not exist); the dry run copies no hooks binary. The SDD package of the previous install (REQ-install-036) is still read from `dist/vscode/agents`.

#### Scenario: Dry run leaves the live tree alone

- GIVEN `dist/vscode` holds a previous install, or does not exist
- WHEN `setup:vscode --dry-run` runs
- THEN the build is validated, the command ends with code 0, and `dist/vscode` is unchanged or still absent

#### Scenario: Preparing the build fails

- GIVEN `dist/vscode` holds a previous install
- WHEN `setup:vscode` builds and copying the hooks binary or rendering a marker fails
- THEN the installation fails and `dist/vscode` still holds the previous install, with no marker left unrendered

### Requirement: Setup Flags Work From Every Shell And Claude Dry Run Writes Nothing {#REQ-install-040}

`setup:claude --dry-run` MUST build and validate the marketplace in a temporary directory that it removes afterwards, report the result, and exit with code 0 without registering the marketplace or the plugin, without writing the router block of `~/.claude/CLAUDE.md`, without copying the hooks binary, without running the Engram step and without touching `dist/claude-marketplace`. PowerShell's `npm.ps1` shim consumes the `--` that separates `npm run` from the script flags, so every target (`claude`, `copilot`, `opencode`, `codex`, `vscode`, `cursor`, `antigravity`) MUST also have the fixed scripts `setup:<target>:sdd` and `setup:<target>:no-sdd`, which run the same installer with `--with-sdd` and `--no-sdd` and need no separator. The guides MUST say that `npm.cmd run setup:<target> -- <flags>` and a quoted `'--'` also work in PowerShell.

#### Scenario: Claude dry run installs nothing

- GIVEN `~/.claude/CLAUDE.md` and `dist/claude-marketplace` exist
- WHEN `setup:claude --dry-run` runs
- THEN the build is validated, the command ends with code 0, no `claude plugin` command runs, `~/.claude/CLAUDE.md` and `dist/claude-marketplace` are unchanged and no temporary directory is left

#### Scenario: Fixed SDD scripts need no separator

- GIVEN a PowerShell session where `npm run setup:codex -- --no-sdd` is rejected by npm
- WHEN `npm run setup:codex:no-sdd` runs
- THEN the Codex installer runs with `--no-sdd`

### Requirement: Codex Repository Install Carries The IDD Protocol And Its Runtime {#REQ-install-041}

`npm run install:codex -- <destRepo>` MUST let the repository follow IDD without a global install (E1.14). Besides the agents and the router, it MUST write into `<destRepo>/.agents/skills/` the `idd` protocol and the `review-trust` and `review-correction` skills it dispatches (plus `sdd-orchestrator` when the build has SDD), with the `_shared` handlers beside them, and MUST copy the runtime (`scripts/` and `schemas/`) into `<destRepo>/.codex/ospec-workflow/`. The installed skills MUST name `_shared` as `.agents/skills/_shared` and the runtime as `.codex/ospec-workflow`, relative to the repository root where the protocol runs `ospec`, and MUST keep no install marker. The runtime directory belongs to the install: a later install MUST remove the files the build no longer has. Every destination MUST pass the managed-path checks before anything is written, and `--dry-run` MUST write nothing. `ospec doctor` MUST report `codex-repo` as `ok` only when the runtime the repository's `idd` protocol names exists, and as `warn` with the reinstall command otherwise.

#### Scenario: A repository-only Codex install runs ospec next

- GIVEN a repository with no global Codex install
- WHEN `npm run install:codex -- <repo>` runs and the command the `idd` skill names, `node ".codex/ospec-workflow/scripts/ospec.js" next --json`, runs from the repository root
- THEN it exits with 0 and returns the `open-change` step
- AND `ospec doctor` reports `codex-repo` as `ok`
