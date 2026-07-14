# Spec: install

## Domain

Per-target installation and distribution of the ospec-workflow plugin. Covers how each supported tool target receives the generated output tree, the npm commands that drive each path, the safety constraints on output directories and destinations, the idempotency contract, and the test infrastructure that validates generated outputs against real CLIs.

## Scope

- npm scripts: `build:claude`, `setup:claude`, `reload:claude`, `build:copilot`, `build:opencode`, `install:opencode`, `install:copilot`, `build:codex`, `setup:codex`, `install:codex`
- Source modules: `scripts/configure/claude-marketplace.js`, `scripts/configure/install-claude.js`, `scripts/configure/install-target.js`, `scripts/configure/install-codex.js`
- Generated distribution roots: `dist/claude-marketplace/`, `dist/github-copilot/`, `dist/opencode/`, `dist/codex/`
- Test files: `scripts/configure/claude-marketplace.test.js`, `scripts/configure/real-repo.test.js`, `scripts/configure/e2e.test.js`, `scripts/configure/install-codex.test.js`, `scripts/configure/validate-codex.test.js`

Out of scope: the generator pipeline that produces the per-target file tree (covered by the `generator` domain), the in-process validators (`validate-github-copilot.js`, `validate-opencode.js`), and the vscode target (no public install command exists; generated only in tests).

---

## 1. Target Install Models

There are two fundamentally different distribution mechanisms, one per tool family.

### 1.1 Claude Code — Marketplace Registration

Claude Code discovers plugins through a local marketplace registered with its CLI. Installation therefore has two steps: (a) build the marketplace tree and (b) register/update it via the `claude` binary.

**npm commands**

| Command | Script | Effect |
|---|---|---|
| `npm run build:claude` | `scripts/configure/claude-marketplace.js` | Build `dist/claude-marketplace/` only |
| `npm run setup:claude` | `scripts/configure/install-claude.js` | Build + register marketplace + install plugin |
| `npm run reload:claude` | `scripts/configure/install-claude.js --build-only` | Build only; user applies via `/reload-plugins` |

The `setup:claude` / `reload:claude` split exists because registering the marketplace requires an interactive Claude Code session on subsequent runs; `reload:claude` is the preferred path for day-to-day iteration when a session is already open.

### 1.2 GitHub Copilot and Opencode — Filesystem Sync

These targets have no plugin marketplace. The workflow is consumed by copying the generated tree into the root of a destination repository, where each tool auto-discovers it via its conventional directory layout (`.github/` + `.mcp.json` for Copilot; `.opencode/` + `opencode.json` for opencode).

**npm commands**

| Command | Script | Effect |
|---|---|---|
| `npm run build:copilot` | `scripts/configure/cli.js --target github-copilot --out dist/github-copilot` | Build `dist/github-copilot/` only |
| `npm run build:opencode` | `scripts/configure/cli.js --target opencode --out dist/opencode` | Build `dist/opencode/` only |
| `npm run install:copilot -- <destRepo>` | `scripts/configure/install-target.js github-copilot <destRepo>` | Build + sync into destRepo |
| `npm run install:opencode -- <destRepo>` | `scripts/configure/install-target.js opencode <destRepo>` | Build + sync into destRepo |

The `--` separator is required to pass `<destRepo>` through npm to the script.

### 1.3 Codex — Native Global Installation

`npm run setup:codex` MUST install the generated `AGENTS.md`, `.codex/agents/*.toml`, skills, runtime scripts and native `hooks.json` under the user's `~/.codex/` without a plugin or marketplace. It MUST register only missing global MCP definitions through `codex mcp add`, deduplicating by command plus ordered arguments and preserving name collisions. It MUST merge its own hook groups while preserving user-owned groups. `npm run install:codex -- <destRepo>` targets `<destRepo>/.codex/agents/` and MUST NOT modify the destination project's `.codex/config.toml`.

The generated Codex tree MUST contain `agent.md`, `.codex/agents/*.toml`, `skills/`, runtime `scripts/` and `hooks.json`, and MUST NOT contain `.codex-plugin/`, `.codex/config.toml` or `.mcp.json`. The Codex validator MUST reject generated config and plugin artifacts, and require a valid native hooks payload with the runtime placeholder.

### 1.4 VSCode

No public install command exists for the VSCode target. It is generated internally by `runConfigure({ target: "vscode" })` during `real-repo.test.js` regression tests but is not shipped via any npm dist command.

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

1. Parse arguments: positional `target` and `dest`, plus `--dry-run`, `--no-validate`, `--source <dir>`.
2. Reject unsupported targets (only `"opencode"` and `"github-copilot"` are accepted).
3. Resolve `destDir = path.resolve(dest)` and call `assertSafeDest(destDir, sourceDir)`.
4. Verify `destDir` exists and is a directory; exit with code 2 otherwise.
5. Build into `dist/<target>/` via `runConfigure({ target, outDir, validate })`. Validation is enabled by default (pure-Node validators require no external CLI).
6. If `exitCode !== 0`, write to stderr and return; nothing is synced.
7. `fs.readdirSync(outDir)` — enumerate top-level entries.
8. For each entry, `fs.cpSync(src, dst, { recursive: true, force: true })` — copies directory trees or files, overwriting same-path destinations; unrelated files in `destDir` are left untouched.
9. If `--dry-run`, print preview lines but write nothing.

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

- Granularity: top-level entries of `dist/<target>/` are enumerated; each is recursively copied.
- Overwrite: `force: true` — existing same-path files are replaced.
- Preservation: files in `destDir` that have no counterpart in `dist/<target>/` are left untouched.
- Idempotency: re-running replaces all generated files with fresh copies; nothing is deleted from `destDir`.

### 4.5 Binary Integration (`copyBinaryToTree`)

The installation process integrates the platform-appropriate pre-compiled Go binary (`ospec-hooks`) into the target distribution tree before syncing to the destination.

- **Best-Effort Delivery**: If the source binary is absent under `release/dist/` (e.g. pre-CI development environment), a warning is written to stderr and installation proceeds without failure.
- **Platform Detection**: Platform and architecture are resolved (`hostBinarySuffix()`) to locate the source binary `ospec-hooks-${goos}-${arch}${ext}`.
- **Target-Specific Destination**:
  - For target `opencode`, the binary is copied to `release/dist/ospec-hooks${ext}` in the output tree.
  - For all other targets (including `claude`, `vscode`, `github-copilot`), the binary is copied to `scripts/hooks/ospec-hooks${ext}`.
- **Permissions**: On POSIX (non-win32) platforms, the copied binary's permissions are updated to `0755` (executable) using `chmodSync`.

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

- All four targets MUST produce a non-empty file tree.
- GitHub Copilot output MUST pass the pure-Node `validate-github-copilot` validator (zero errors).
- Opencode output MUST pass the pure-Node `validate-opencode` validator (zero errors).
- Opencode output MUST contain every source `skills/**/*.md` file.
- Opencode output MUST contain the plugin bridge, and the bridge MUST reference both hook scripts at paths that exist in the output.
- GitHub Copilot output MUST contain every source `skills/**/*.md` file.
- Every skill path referenced by a phase agent in the github-copilot output MUST exist in the output tree.
- Claude output MUST NOT contain `vscode/` namespace residue in any `.md` file.

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
- THEN `AGENTS.md`, `.codex/agents/*.toml`, skills, runtime scripts and `hooks.json`
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

---

## 9. Constraints and Invariants

- Node.js >=22 is REQUIRED. All install scripts use CommonJS (`"use strict"`, `require`).
- External CLI dependencies (`claude`) MUST be treated as optional: their absence MUST NOT cause a build failure or a non-zero exit code when the build itself succeeds.
- The `install-target.js` MUST NOT support the `claude` target (the TARGETS set is limited to `"opencode"` and `"github-copilot"`).
- `assertSafeOutDir` and `assertSafeDest` MUST throw synchronously before any destructive filesystem operation occurs.
- `spawnSync` MUST be used with `shell: false` for all CLI invocations to avoid .cmd shim resolution issues on Windows.
- The `dist/` directory is NOT committed to version control; it is generated on demand and is gitignored.
- Running any install command multiple times MUST produce the same final state (idempotency).
