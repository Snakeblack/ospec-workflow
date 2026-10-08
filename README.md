# ospec-workflow

![ospec-banner.png](docs/banner-op/ospec-banner.png)

> **🌐 English** · [Español](./README.es.md)

## 📖 Read this in Spanish / Leer en español

The primary documentation is in English. Spanish versions of the main guides:

| Document | Link |
| --- | --- |
| Full README | [README.es.md](./README.es.md) |
| Installation guide | [docs/plugin-installation.es.md](./docs/plugin-installation.es.md) |
| SDD methodology (optional mode) | [docs/sdd-metodologia.es.md](./docs/sdd-metodologia.es.md) |

Internal architecture and workflow references remain available in Spanish under [`docs/`](./docs/README.md).

---

> **A change is done when the evidence says so, not when the agent does.** `ospec-workflow` is an impact-driven development (IDD) harness for AI coding agents. Each code change goes through the `ospec` CLI: it derives the change's obligations from what the change touches, records evidence only from runs it observes, and closes the change when every obligation is satisfied. Spec-Driven Development (SDD) with OpenSpec remains available as an optional mode.

It is based on [Gentle-ai by Gentleman Programming](https://github.com/Gentleman-Programming/gentle-ai).

---

## IDD: Obligations From Impact, Evidence From Runs

A one-line fix and a schema migration do not need the same ceremony. IDD has no phases and no documents to write first; the impact of the change decides what it owes:

1. **Impact decides the work**: `ospec signals` reads the files the change touches (and later the real diff) and raises signals; each signal adds one obligation.
2. **Evidence over opinion**: an obligation is satisfied only by evidence the CLI records from a run it observes (`ospec run`, `ospec check`, `ospec review`). Saying that tests pass satisfies nothing.
3. **Ask before deciding**: the agent stops only at four gates, and an explicit answer from you is the only thing that resolves one.
4. **The repository is the memory**: each change lives in `idd/<change>/state.yaml` (owned by the CLI) and is archived under `idd/archive/` when `ospec close` succeeds.

| Signal | Raised when | Obligation |
| --- | --- | --- |
| `always` | Every change with a resolved intent | `checks-pass`: `ospec check` runs the checks declared in `idd/config.yaml` on the current tree |
| `bug-fix` | The intent is a bug | `repro-test`: the reproduction test fails first, then passes |
| `strict-tdd` | `strict_tdd: true` in `idd/config.yaml` | `tdd-red-green`: a red → green pair per unit |
| `public-contract` | The change touches API routes, OpenAPI, proto or GraphQL schemas, or what a non-private `package.json` publishes | `contract-spec-and-test`: the contract document and its test change in the diff |
| `persistent-data` | The change touches migrations, SQL or ORM schemas | `migration-compat-and-test`: a migration test with a compatibility or rollback plan |
| `security-boundary` | The change touches auth, security, permissions, secrets or credentials | `trust-review`: a bounded read-only trust review |
| `multi-unit-or-decision` | Several work units or a recorded design decision | `living-doc`: `idd/<change>/change.md` keeps the plan and decisions current |

The patterns adapt to the detected stack (Node, JVM, .NET, Python, Go) and extend under `impact:` in `idd/config.yaml`. The four gates are `ambiguous-intent` (no acceptance can be stated yet), `open-facts` (behaviors that neither the request nor the code settle, asked all at once before editing), `irreversible-operation` and `adr-amend-or-contradict`.

---

## Quick Start in 3 Steps

### 1. Nothing to copy: the installer adds a small router
Every installer adds a small router to the instructions your host loads on every request ([`rules/ospec-router.instructions.md`](rules/ospec-router.instructions.md)). It sends code changes through IDD by default, keeps questions and read-only work direct, and enters SDD **only** when you run a `/sdd-*` command or ask for spec-driven work. Claude Code and Codex get it as a marked block in `~/.claude/CLAUDE.md` and `AGENTS.md`, next to your own text; pass `--no-router` to leave it out or remove it.

### 2. Install the Plugin in Your Tool
Choose your target and run its automatic configurator:

| Environment / Target | Quick Install Command | What does it do? |
| :--- | :--- | :--- |
| **VS Code** | `npm run setup:vscode` | Builds to `dist/vscode` and adds it to `chat.pluginLocations`. |
| **Claude Code** | `npm run setup:claude` | Builds, validates strictly, and installs as a persistent plugin. |
| **Copilot CLI** | `npm run setup:copilot` | Builds and installs globally on your machine (`~/.copilot/`). |
| **opencode** | `npm run setup:opencode` | Builds and installs into the OpenCode folder (`~/.config/opencode/`). |
| **Codex CLI** | `npm run setup:codex` | Builds `dist/codex`, registers the marketplace, adds only missing global MCPs and copies `.codex/agents/*.toml`. |
| **Cursor** | `npm run setup:cursor` | Builds `dist/cursor`, syncs to `~/.cursor/`, configures MCPs and preserves hooks. |
| **Antigravity** | `npm run setup:antigravity` | Builds `dist/antigravity` and installs into `~/.gemini/config/` with a transactional manifest. |
| **Guided TUI** | `npm run setup:tui` | Opens the guided installer from this repository checkout. |

### 3. Ask for a change
Once the plugin is loaded in your chat agent, ask for the change in your own words ("make the session expire after 30 minutes of inactivity"). The router sends it through IDD:
1. **Declare your checks once**: `ospec check` runs the commands listed under `checks:` in `idd/config.yaml`. Create it once at the project root:
   ```yaml
   checks:
     test: npm test
   ```
2. **Answer the open facts**: the agent records the intent, lists the behaviors the request leaves open and asks them all at once before editing.
3. **Let the CLI close it**: the agent follows `ospec next` until `ospec close` succeeds and archives the change under `idd/archive/`. Branches, commits and PRs stay your decision.

On Claude Code you can also enter IDD explicitly with `/ospec-workflow:idd <request>`. To turn IDD off in a project, declare `mode: sdd` in `idd/config.yaml`: the agent then works directly and enters SDD only on request. SDD changes already in flight finish in SDD.

### Guided installer TUI

From a repository checkout, use Node.js 22+ and Go 1.23+:

```powershell
npm run setup:tui
```

Choose a target, edit models when that target supports it, review the summary, then activate **Install**. Use arrow keys to move, Enter to select, Escape to go back, and `q` or Ctrl-C to cancel. Back retains selections per target; canceling before Install does not write files. Choices are per-run and do not modify `models.yaml`; destinations and installer behavior remain the existing defaults. Model availability and host authentication are outside this flow, and standalone binaries are outside the MVP.

---

## Detailed Setup per Target

### 🛠️ VS Code (Agent Plugin from `dist/vscode`)
VS Code loads the built tree, not the source: the source still carries placeholders that only the build renders, and the whole SDD package.
```powershell
npm run setup:vscode
```
It builds `dist/vscode` and adds it to `chat.pluginLocations`. To update after pulling changes, run `npm run reload:vscode` and reload VS Code. `node scripts/ospec.js doctor --target vscode` reports a duplicated, missing or source-checkout entry.

### 🤖 Claude Code (Persistent Plugin and Marketplace)
- **For end users** (without cloning the repository):
  ```powershell
  claude plugin marketplace add https://github.com/snakeblack/ospec-workflow.git#release
  claude plugin install ospec-workflow@ospec-tools
  ```
  The marketplace build is the default one: IDD without the SDD package. For SDD, install from a checkout with `npm run setup:claude -- --with-sdd`.
- **For plugin development** (idempotent local installation):
  ```powershell
  npm run setup:claude
  ```
  *(Inside the Claude Code session, type `/reload-plugins` to apply changes).*
- **Engram session memory**: configured automatically when the `engram` binary is on PATH (`--no-engram` to skip); see [Engram session memory](#-engram-session-memory-every-target).
- **Fast rebuild during development**:
  ```powershell
  npm run reload:claude
  ```

### 💻 GitHub Copilot CLI (Global Loading)
- **Global Install (Recommended)**:
  ```powershell
  npm run setup:copilot
  ```
  *(This copies agents, instructions, and commands to `~/.copilot/` and merges the global `mcp-config.json` file).*
- **Local Install (For a specific project only)**:
  ```powershell
  npm run install:copilot -- ../my-project
  ```

### 🧬 opencode
- **Global Install (Recommended)**:
  ```powershell
  npm run setup:opencode
  ```
  *(The main agent is automatically renamed to `ospec-workflow` to make it easier to discover via autocomplete).*
- **Local Install**:
  ```powershell
  npm run install:opencode -- ../my-project
  ```

### 🧠 Codex CLI
- **Global Install (Recommended)**:
  ```powershell
  npm run setup:codex
  ```
  *(Builds `dist/codex`, writes the router as a block in `~/.codex/AGENTS.md`, syncs agents, skills and runtime into `~/.codex/`, merges native hooks into `~/.codex/hooks.json` and registers missing global MCPs.)*
- **Per-repository Local Install**:
  ```powershell
  npm run install:codex -- ../my-project
  ```
  *(Copies `.codex/agents/*.toml`, writes the router block into the repo's `AGENTS.md` and the orchestrator skill into `.agents/skills/`, and does not modify `.codex/config.toml`.)*

  By default the installer does not alter `.codex/config.toml`. If Codex rejects the exact legacy key `service_tier = "default"`, the repair is an explicit opt-in:
  ```powershell
  npm run setup:codex:repair
  ```
  The dedicated script is the recommended path on Windows PowerShell because it does not depend on npm flag forwarding. As a fallback you can run `node scripts/configure/install-codex.js --repair-config`; to preview without writing, use `node scripts/configure/install-codex.js --dry-run --repair-config`.

  The repair removes only that top-level assignment, keeps a single byte-for-byte backup and restores the original if the write, rename, or validation with Codex fails. Other incompatible keys remain intact and produce a diagnostic. It does not touch `auth.json`, other keys, or MCP entries; per-repository local installation never repairs global configuration.

### 🖱️ Cursor
- **Global Install**:
  ```powershell
  npm run setup:cursor
  ```
  *(Builds `dist/cursor`, syncs to `~/.cursor/`, translates `.mcp.json` and preserves user hooks in `hooks.json`.)*

### 🌌 Antigravity IDE
- **Global Install**:
  ```powershell
  npm run setup:antigravity
  ```
  *(Builds `dist/antigravity` with profiles and validation, deploying adapted skills, agents and hooks into `~/.gemini/config/` with a transactional manifest.)*
- **Fast rebuild during development**:
  ```powershell
  npm run reload:antigravity
  ```

See the [installation guide](docs/plugin-installation.md) for more details on native global installation and the hooks runtime.

### 🧭 Optional SDD package (every target)
The SDD mode (the `sdd-*` skills and agents with the orchestrator, the `/sdd-*` commands and the `sdd-*` rules) is not installed by default. Add `--with-sdd` to any installer to include it (`npm run setup:claude -- --with-sdd`, `node scripts/configure/install-codex.js --with-sdd`); the guided TUI offers it as the «SDD mode» package. A reinstall without the flag keeps SDD when the previous install held it and says so; `--no-sdd` removes it. The `review-*` agents, `skills/_shared/` and the runtime stay in every install because IDD uses them.

### 🧩 Optional extras package (every target)
`issue-creation`, `comment-writer`, `gh-release-notes`, `judgment-day`, `caveman-compress` and `stack-webmcp` are not installed by default. Add `--with-extras` to any installer to include them (`npm run setup:claude -- --with-extras`, `node scripts/configure/install-codex.js --with-extras`). Installs remove what the new build no longer has, so re-running an installer without the flag uninstalls them.

### 🧠 Engram session memory (every target)
Every `npm run setup:<target>` (Claude, Codex, Antigravity, opencode, Cursor, VS Code, Copilot CLI) configures [Engram](https://github.com/Gentleman-Programming/engram) automatically when the `engram` binary is on PATH. It runs the upstream `engram setup <agent>` (`claude-code`, `codex`, `antigravity-cli`, `opencode`, `cursor`, `vscode-copilot`). Copilot CLI has no upstream setup, so the installer adds an `engram mcp` entry to `~/.copilot/mcp-config.json` instead. The step is idempotent and fail-open, and it never changes the install exit code. Pass `--no-engram` to skip it (`npm run setup:codex -- --no-engram`). Without the binary, the installer only prints install guidance.
- **Claude Code on Windows**: a short Git Bash fork probe decides whether the upstream hook's safe mode can be turned off (`ENGRAM_CLAUDE_WINDOWS_BASH_SAFE_MODE=0` in `~/.claude/settings.json`). The safe mode disables prompt capture and save reminders. A value you already set is never overwritten. The upstream hooks need bash, jq and curl.
- **Cursor**: Cursor does not read global rule files, so paste `~/.cursor/engram-memory-protocol.md` into Settings → Rules → User Rules once.
- Every target ships the same host-neutral SDD memory addendum. Engram is non-authoritative: `idd/` and OpenSpec state on disk remain the source of truth.

## What's included

| Path | Purpose |
| --- | --- |
| `rules/ospec-router.instructions.md` | The always-on router: IDD by default for code changes, SDD only on request through the host's orchestrator. Installers add it to every target. |
| `skills/idd/` | The IDD protocol the router loads for a code change. |
| `scripts/ospec.js` | The `ospec` CLI (`status`, `next`, `record`, `signals`, `check`, `run`, `review`, `close`), shipped with the runtime. |
| `idd/` | IDD configuration (`config.yaml`), changes in flight and `archive/`, in each project. |
| `.plugin.json` | **Canonical** manifest (VS Code/direct-load). Edit this one first. |
| `.claude-plugin/plugin.json` | Compatibility copy for Claude distribution; also the source read by the generator (`scripts/configure/cli.js`). It must mirror the canonical one — `scripts/manifest-sync.test.js` verifies this in CI. |
| `agents/` | Orchestrator and specialized agents per phase. |
| `commands/` | Visible commands and routing to the orchestrator. |
| `skills/` | On-demand capabilities and shared contracts. |
| `rules/` | Persistent SDD, OpenSpec and Strict TDD rules. |
| `hooks/` | Declarative definition of plugin lifecycle events. |
| `scripts/hooks/` | Hooks runtime (Node.js) and its tests. |
| `scripts/lib/` | Shared libraries: OpenSpec state, artifact-store and the generator core (`frontmatter`, `model-resolver`, `target-transform`, profiles). |
| `scripts/configure/` | Multi-target generator CLI (`cli.js`), per-profile validators and golden fixtures. |
| `models.yaml` | Tier→model tables per target for the generator. |
| `profiles/models/` | Optional model-routing profiles (direct use in VS Code). |
| `docs/` | Detailed architecture and usage documentation. |
| `.mcp.json` | Canonical MCP source. Codex does not bundle it: `setup:codex` translates its entries to the native CLI and avoids duplicates. |
| `openspec/` | Versionable source of truth for every SDD change. |

## Optional SDD Mode

SDD runs a change through planned phases (proposal, specs, design, tasks, apply, verify, archive) with OpenSpec artifacts. Use it when you want the contract written and approved before any code: install the package with `--with-sdd`, then run a `/sdd-*` command or ask for spec-driven work ("do SDD for X"). The rest of this section describes that mode.

### SDD Commands

| Command | Usage |
| --- | --- |
| `/sdd-init` | Detects the project and prepares OpenSpec, testing and the skill registry. |
| `/sdd-baseline` | Seeds openspec/specs/ with baseline specs of existing behavior (brownfield repos, resumable batches). |
| `/sdd-workspace` | Manages multi-repo federation: atlas (`init`), cross-repo state (`status`), contract-based impact (`impact`). |
| `/sdd-new` | Starts a persisted change and selects the workflow. |
| `/sdd-lite` | Runs the reduced flow for small, low-risk changes. |
| `/sdd-ff` | Completes planning: proposal, specs, design and tasks. |
| `/sdd-continue` | Restores state from OpenSpec and resumes the next available phase. |
| `/sdd-explore` | Investigates an idea without implementing. |
| `/sdd-propose` | Defines intent, scope, risks and approach of the change. |
| `/sdd-spec` | Writes requirements and verifiable scenarios. |
| `/sdd-design` | Defines architecture, data flow and testing strategy. |
| `/sdd-tasks` | Breaks the change into implementable, reviewable units. |
| `/sdd-apply` | Implements tasks in reviewable batches. |
| `/sdd-verify` | Checks specs, design, tasks and test evidence. |
| `/sdd-archive` | Consolidates and archives a verified change. |
| `/sdd-onboard` | Walks through a real SDD cycle on the current repository. |

`sdd-foundation` builds the documentary base when the project is empty. Phase agents must not be invoked as an uncoordinated team: the orchestrator preserves order and contracts.

### SDD Flows

The standard full cycle goes through every planning, implementation, and closing phase:

```text
propose → spec → design → tasks → apply → verify → archive
```

But not every change needs the full cycle. The orchestrator evaluates the routing table
(`openspec/config.yaml`) top-down and activates the **first matching route**.

#### Canonical routes

| Route | Classification | When | Phases |
| --- | --- | --- | --- |
| **foundation** | normal, high-risk | Empty project, no stack or architecture | `sdd-foundation` |
| **federated** | normal, high-risk | Multi-repo workspace (`workspace-federated`) | `sdd-workspace` → propose → spec → design → tasks → apply → verify → archive |
| **bugfix** | small, normal | User states an explicit bugfix intent | `sdd-explore` → tasks → apply → verify → archive |
| **brownfield** | normal, high-risk | There is code but `openspec/specs/` is empty | `sdd-baseline` (in batches per domain) |
| **refactor** | small, normal | User states an explicit refactor intent | design → tasks → apply → verify → archive |
| **hotfix** | trivial, small | Explicit emergency patch | apply → verify → archive |
| **standard** | normal, high-risk | Active project (default route) | propose → spec → design → tasks → apply → verify → archive |
| **lite** | trivial, small | Small, low-risk change | propose → tasks → apply → verify → archive |

#### Entry shortcuts

| Command | What it does |
| --- | --- |
| `/sdd-new` | Classifies the change, selects the route and starts the first phase. |
| `/sdd-ff` | Planning fast-forward: runs propose → spec → design → tasks without implementing. |
| `/sdd-lite` | Starts the lite route directly. |
| `/sdd-continue` | Restores state from `state.yaml` and resumes the next pending phase. |

#### Gates

Some routes include gates that block progress until resolved:

- **clarify** — the orchestrator detects ambiguity and requests clarifications before continuing.
- **quality-review-gate** — after a successful `sdd-verify`, runs deterministic quality classification (Trust, Runtime, Evolution, Efficiency) and bounded review lineage. Legacy **`4r-review-gate`** applies only to in-flight `schema_version: 1` lineages.
- **impact** — in federated routes, evaluates cross-repo impact before implementing.
- **brownfield-advisory** — reports baseline status before executing.

#### Batched implementation

`/sdd-apply` works in reviewable batches (it merges `apply-progress.md`). When a change exceeds the
~400-line budget, the orchestrator proposes chained PRs (`stacked-to-main` or
`feature-branch-chain`) or requires a conscious `size:exception`.

#### Execution modes

| Mode | Behavior |
| --- | --- |
| **Interactive** (default) | Pauses between phases to review decisions. |
| **Automatic** | Chains phases without pausing, but never bypasses risk, architecture, testing, or review-load gates. |

Full detail in [docs/sdd-workflows.md](docs/sdd-workflows.md).

## Runtime and continuity

Hooks offload repetitive lifecycle-cycle tasks from the prompt and enforce security and control policies:

| Event | Responsibility |
| --- | --- |
| `SessionStart` | Validates OpenSpec, refreshes the compact skill cache and runs **AgentShield** security scans (alerts for exposed `.env` files or credentials in `.git/config`). |
| `PreToolUse` | Blocks or asks for confirmation for dangerous commands, evaluates **Token Budget Advisor** limits (limit of 50k tokens per file, 150k accumulated tokens per session) and implements **AgentShield** (blocking of SSH keys, `.npmrc`, `.git/config`, and interactive prompts for secrets). |
| `PreCompact` | Persists a recoverable summary before compacting context. |
| `SubagentStop` | Detects degradation in skill resolution. |
| `Stop` | Records minimal session continuity. |

### Bypass Environment Variables (Harness Gates)

You can temporarily skip the various security checks, budgets, and validators using the following environment variables:

- `DISABLE_AGENT_SHIELD=true`: Disables AgentShield scanning and blocking/prompting of sensitive files and credentials.
- `DISABLE_TOKEN_ADVISOR=true`: Disables the estimated token-size check on file reads during the session (Token Budget Advisor).
- `DISABLE_OSPEC_PRECOMMIT=true`: Disables local workspace-validation and Strict TDD enforcement in the Git pre-commit hook.

Hooks run native code (Node.js or optimized Go executables). `.ospec/cache` and `.ospec/session` are auxiliary; **`idd/` and OpenSpec state on disk remain the source of truth**.

## Model routing

Agents do not hardcode concrete model names. By default they inherit the selected model and can use local profiles:

- `default`: single-model fallback;
- `cheap`: reduces cost during exploration and proposal;
- `premium`: increases reasoning during design and verification.

Profiles live in `profiles/models/`. See [model-routing.md](docs/model-routing.md).

## Multi-target compatibility

The canonical origin is in VS Code format and is loaded directly, without transformation.
For other targets, a pure generator (`scripts/configure/cli.js`) produces a native, validated tree
in `dist/<target>/` without touching the origin:

| Target | Output |
| --- | --- |
| `vscode` | Canonical identity: VS Code loads the repository as-is, without generating `dist/`. |
| `claude` | `.claude-plugin` tree: renames files, restructures manifest and hooks, substitutes tools (context-aware), rewrites command variables, incorporates `rules/` and emits the orchestrator as a **skill**. Gate: `claude plugin validate --strict` 0/0. |
| `github-copilot` | `.github/` layout: agents to `.github/agents/*.agent.md` (`target: github-copilot`, `vscode/askQuestions`→`ask_user`), commands to `.github/prompts/*.prompt.md`, rules to `.github/instructions/*.instructions.md` (keeping the source `applyTo`; `agents/**` rules go into the orchestrator agent), hooks to `.github/hooks/hooks.json` (Copilot schema) and `.mcp.json` as-is. Validated by `scripts/configure/validate-github-copilot.js` inside the profile flow. |
| `opencode` | `.opencode/` layout + `opencode.json`: agents to `.opencode/agents/*.md` (`mode: primary\|subagent`, `tools:` as a **map**, model `provider/model`), commands to `.opencode/commands/*.md` (keeps `agent:`, args `$1`/`$ARGUMENTS`), rules to `.opencode/instructions/*.md` referenced via `instructions` in `opencode.json`, MCP folded into `opencode.json` (`mcp` with `type: local\|remote`) and, since opencode has no shell hooks, the runtime is bridged with a JS plugin in `.opencode/plugins/ospec.js`. Validated by `scripts/configure/validate-opencode.js`. |
| `codex` | `.codex-plugin/` layout + `.codex/agents/*.toml`, without `.mcp.json` in the bundle: the plugin and agents are installed separately; `setup:codex` registers missing global MCPs with valid IDs and deduplication by identity. The generator rejects `.codex/config.toml`, `.mcp.json` and `mcpServers` inside the payload. Validated by `scripts/configure/validate-codex.js`. |

```powershell
node scripts/configure/cli.js --target claude          --out dist/claude
node scripts/configure/cli.js --target codex           --out dist/codex
node scripts/configure/cli.js --target github-copilot  --out dist/github-copilot
node scripts/configure/cli.js --target opencode        --out dist/opencode
```

The transform is pure and tested under Strict TDD; the CLI is the IO layer with a
validation gate per target (golden fixtures, `claude plugin validate` for `claude` and Node validators for GitHub Copilot and opencode). Model selection is abstracted into tiers (`models.yaml`). Each generated tree is **self-contained**: the generator
follows `require`s from the hooks and includes their runtime (`scripts/hooks/` + their dependencies from
`scripts/lib/`), without tests or the generator itself. See [model-routing.md](docs/model-routing.md)
and the [installation guide](docs/plugin-installation.md).

## MCP

The default configuration is kept deliberately small:

- Context7 for up-to-date library documentation;
- MarkItDown for document conversion.

Additional servers must be activated explicitly. See [mcp-policy.md](docs/mcp-policy.md).

## Workflow guarantees

- A change is done only when `ospec close` succeeds; obligations are satisfied only by evidence from runs the CLI observes.
- Strict TDD when the project enables it (`strict_tdd: true` in IDD, a compatible runner in SDD).
- Change state recoverable from disk: `idd/<change>/` in IDD, `openspec/changes/{change-name}/` in SDD.
- Gates and approvals persisted in `state.yaml`, resolved only by an explicit answer, never inferred from chat history.
- Dynamic delimited prompts to separate intent, artifacts, standards, and approval context.
- Skills resolved as compact rules to control the token budget.
- Changes organized into reviewable units, with guards when load exceeds the recommended budget.

## Documentation

| Document | Content |
| --- | --- |
| [docs/README.md](docs/README.md) | Index and recommended reading path. |
| [openspec/specs/idd/spec.md](openspec/specs/idd/spec.md) | IDD contract: signals, obligations, gates and the `ospec` CLI. |
| [docs/sdd-metodologia.md](docs/sdd-metodologia.md) | SDD mode: principles and mental model. |
| [docs/sdd-fases.md](docs/sdd-fases.md) | Contracts of each phase. |
| [docs/sdd-workflows.md](docs/sdd-workflows.md) | Work lines: standard, lite, fast-forward, foundation, brownfield baseline, continuation, workspace and onboarding. |
| [docs/openspec.md](docs/openspec.md) | Persistence, delta specs and archiving. |
| [docs/tdd-y-revision.md](docs/tdd-y-revision.md) | Strict TDD and review budget. |
| [docs/harness-runtime.md](docs/harness-runtime.md) | Hooks runtime architecture. |
| [docs/model-routing.md](docs/model-routing.md) | Model tiers and format per target (`models.yaml`). |
| [docs/mcp-policy.md](docs/mcp-policy.md) | MCP policy and server configuration. |
| [docs/plugin-installation.md](docs/plugin-installation.md) | Installation, generation per target, trust and diagnostics. |

Spanish versions of the main guides are listed in the language section at the top of this file.

## Validation

A single command covers local and CI verification of the hooks runtime, multi-target generator,
profile validators and expected artifacts:

```powershell
node scripts/check.js
```

CI runs the same gate in `.github/workflows/validate-harness.yml` with Node 22 and a multi-OS matrix.

Before publishing changes to the manifest, hooks, MCP, or the generator, explicitly review the new
execution and trust surface.
