# Domain Spec: generator

## Overview

The generator is the build pipeline that transforms the canonical source plugin tree into target-native file distributions for six supported targets: `claude`, `vscode`, `github-copilot`, `opencode`, `codex`, and `cursor`. It is composed of a pure transform layer (`scripts/lib/target-transform.js`) and an IO shell (`scripts/configure/cli.js`) that handles filesystem reads, writes, and validation.

## Source files

- `scripts/configure/cli.js` — IO shell: loads source tree, invokes transform, writes output, runs validator
- `scripts/lib/target-transform.js` — pure transform: reshapes files according to target profile
- `scripts/lib/target-profiles/claude.js` — Claude Code target profile
- `scripts/lib/target-profiles/vscode.js` — VS Code target profile
- `scripts/lib/target-profiles/github-copilot.js` — GitHub Copilot target profile
- `scripts/lib/target-profiles/opencode.js` — opencode target profile
- `scripts/lib/target-profiles/opencode-plugin.js` — opencode JS plugin source shim
- `scripts/lib/frontmatter.js` — YAML-lite frontmatter parser / serializer
- `scripts/lib/model-resolver.js` — model resolution from models.yaml data
- `scripts/configure/validate-github-copilot.js` — GitHub Copilot output validator
- `scripts/configure/validate-opencode.js` — opencode output validator
- `scripts/configure/validate-cursor.js` — Cursor output validator
- `scripts/lib/target-profiles/cursor.js` — Cursor target profile
- `scripts/configure/claude-marketplace.js` — Claude marketplace build helper

## Scenarios

### Requirement: Source tree loading ampliado

#### Scenario: Carga del árbol fuente con entry scripts de skill

- GIVEN the generator is invoked with a `sourceDir` and a set of `SOURCE_ROOTS`
- WHEN `loadTree` runs
- THEN it MUST collect files from each root that exists, recursing into directories and reading file contents as UTF-8 strings into `{ path, content }` objects
- AND it MUST additionally invoke `gatherRuntimeScripts` to include both (a) the runtime hook scripts and (b) the skill entry-point scripts listed below as additional BFS roots, resolving the full transitive `require()` closure of both groups (resolved statically by regex, no dynamic evaluation)

**Skill entry-point allowlist** (additional BFS roots alongside `hooks/*.js`):

| Script | Role |
|--------|------|
| `scripts/lib/review-dimensions.js` | selective 4R evidence normalization |
| `scripts/lib/review-gate-state.js` | 4R gate `next_action` adapter |
| `scripts/lib/review-lineage.js` | bounded review lineage reducer |
| `scripts/lib/federation-marker.js` | enroll runtime |
| `scripts/lib/federation-explore.js` | explore runtime |
| `scripts/lib/workspace-general-baseline.js` | general-baseline runtime |
| `scripts/lib/federation-baseline-orchestrator.js` | baseline-orchestrator runtime |
| `scripts/lib/strict-tdd-evidence-remediation.js` | Strict TDD evidence remediation reducer |

All eight scripts and their transitive `require()` dependencies MUST be present in the dist of ALL six targets (`claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`) under `scripts/lib/`.
And it MUST NOT include test files (`.test.js`) or generator-only modules (`target-*`, `frontmatter`, `model-resolver`, `configure/`) in the runtime script bundle. Transitive dependencies are subjected to the same exclusion check, preventing excluded files from being resolved or bundled.
When `loadTree` reads files under `SOURCE_ROOTS` or a profile's optional `sourceRoots`, I/O failures MUST propagate and fail the configure run (no warn-and-skip).
And it MUST silently skip any root that does not exist on disk.
When a target profile declares `sourceRoots`, `runConfigure` MUST load those roots in addition to the canonical `SOURCE_ROOTS`.

The canonical `SOURCE_ROOTS` are:
`.claude-plugin/plugin.json`, `hooks/hooks.json`, `.mcp.json`, `agents/`, `commands/`, `rules/`, `skills/`.

(Previously: four federation entry scripts and five targets; entry allowlist now includes review-lineage and Strict TDD remediation modules, and `cursor` remains a sixth target.)

#### Scenario: Skill entry-point scripts present in dist

- GIVEN the source tree contains the eight skill entry-point scripts under `scripts/lib/`
- WHEN `gatherRuntimeScripts` runs during generation for any of the six targets (`claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`)
- THEN `review-dimensions.js`, `review-gate-state.js`, `review-lineage.js`, `federation-marker.js`, `federation-explore.js`, `workspace-general-baseline.js`, `federation-baseline-orchestrator.js`, and `strict-tdd-evidence-remediation.js` MUST each appear in the collected runtime file set
- AND they MUST be emitted under `scripts/lib/` in the output dist

#### Scenario: Generator-only modules excluded from dist

- GIVEN the source tree contains generator modules such as `scripts/lib/target-transform.js` and `scripts/configure/cli.js`
- WHEN `gatherRuntimeScripts` collects the runtime script bundle
- THEN no file matching `target-*`, `frontmatter.js`, `model-resolver.js`, any `configure/` module, or `*.test.js` MUST appear in the output
- AND this exclusion applies regardless of whether those modules are transitively required by any non-excluded script

#### Scenario: Transitive dependency of an entry script included

- GIVEN `scripts/lib/federation-marker.js` contains a static `require('./some-dep')` call and `some-dep.js` is not itself an excluded module
- WHEN `gatherRuntimeScripts` resolves the transitive closure from `federation-marker.js`
- THEN `scripts/lib/some-dep.js` MUST also be present in the collected runtime file set
- AND resolution MUST use only static regex matching on `require()` calls — no script execution

### Scenario 2: Pure transform — file routing

Given a loaded file collection, a target profile, and models data,
When `transform` is called,
Then each file MUST be routed through exactly one handler in this priority order:
1. Dropped files (profile `drop` list) — removed from output.
2. Plugin manifest (`profile.manifest.location`) — field-stripped via `reshapeManifest`.
3. Hooks file with `shape: "nested"` — wrapped in an outer group array via `nestHooks`.
4. Hooks file with `format: "copilot"` — reshaped to Copilot schema via `copilotHooks`.
5. Hooks file with `format: "codex"` — reshaped via `codexHooks`.
6. Hooks file with `format: "cursor"` — reshaped via cursor hooks (REQ-generator-007).
7. Rules files (`rules/` prefix) — inlined, instruction files, config-referenced, or `.mdc` per `profile.rules.strategy` (including `to-mdc` per REQ-generator-006).
8. Agent files (matching `profile.agentFile.from`) — handled via `handleAgent` (frontmatter strip, model injection, optional `readonly`, tool name substitution); or emitted as an orchestrator skill when the profile sets `orchestrator.emitAs: "skill"`; or emitted as a TOML file per `agentFile.format: "toml"` (REQ-generator-001), excluded from the plugin manifest bundle in that case.
9. Command files (matching `profile.commandFile.from`) — handled via `handleCommand` (frontmatter strip, variable substitution); or emitted as an invocable skill per `commandFile.format: "skill"` (REQ-generator-002).
10. **`.mcp.json` for profiles with MCP placeholder normalization enabled** (`profile.mcpPlaceholders` truthy) — every `${input:NAME}` occurrence in `env`, `args`, `url`, and `headers` string values MUST be rewritten to `${NAME:-}` before the file is added to the output tree; intercepted here and MUST NOT reach step 11.
11. Passthrough (skills, shared docs with `.md` extension) — tool name substitution in prose applied; binary/other files copied as-is.

And synthesized files (e.g. `opencode.json`, the opencode JS plugin shim) MUST be appended after the per-file pass.
And the output file array MUST be sorted deterministically by path (lexicographic ascending) regardless of OS filesystem read order.

(Previously: routing listed nested + copilot hooks only and three rules strategies; now includes explicit `codex`/`cursor` hooks formats and `to-mdc` rules, with step renumbering.)

### Scenario 3: Rules strategy dispatch

Given a profile with a `rules.strategy` field,
When a `rules/*.md` file is processed,
Then:
- If `strategy` is `"inline-into-orchestrator"`: the file MUST be dropped from output (content is folded into the orchestrator agent/skill by a separate collector).
- If `strategy` is `"to-instructions"`: the file MUST be emitted under `profile.rules.dir/` with the target extension and an `applyTo` frontmatter key added.
- If `strategy` is `"to-instructions-config"`: the file MUST be emitted under `profile.rules.dir/` and referenced from the synthesized config file (e.g. `opencode.json`); no `applyTo` key is added.
- If `strategy` is `"to-mdc"`: the file MUST be emitted as `.mdc` per REQ-generator-006.

(Previously: three strategies only; `to-mdc` added for Cursor.)

### Scenario 4: Orchestrator skill emission (Claude target)

Given the claude profile with `orchestrator.emitAs: "skill"`,
When the agent file matching `orchestrator.agent` (i.e. `agents/sdd-orchestrator.agent.md`) is processed,
Then the generator MUST emit it at `orchestrator.skillPath` (`skills/sdd-orchestrator/SKILL.md`),
And MUST prepend the collected rules content (from all `rules/*.md` files) into that file,
And MUST NOT also emit the agent file at its default agent path.

### Scenario 5: Tool name substitution

Given a target profile with a `toolMap` (abstract-name → target-name mapping),
When any `.md` file passes through the transform (agent, command, or passthrough),
Then every occurrence of an abstract tool name (e.g. `Read`, `Edit`, `Bash`, `Grep`, `Glob`, `Agent`, `AskUserQuestion`) in the prose MUST be replaced with the target-specific name.
And when an abstract name maps to an array (e.g. `edit: ["Edit", "Write"]`), prose references MUST collapse to the primary (first) name.

### Scenario 6: Model injection from models.yaml

Given a `models.yaml` file with a two-level map (phase × target columns),
When a target profile sets `model.format`,
Then the generator MUST parse `models.yaml` without any YAML library dependency (custom parser),
And MUST inject the resolved model name into each agent's frontmatter `model:` field.
And for the `claude` target with `format: "alias"`, model values MUST be emitted as alias strings.
And for the `opencode` target with `format: "provider-slug"`, model values MUST be emitted as provider-prefixed slugs (e.g. `anthropic/claude-opus-4-5`).
And if a model resolves to the `OMIT` sentinel, the `model:` field MUST be omitted entirely from the output frontmatter.

### Scenario 7: Hooks reshaping — nested format (Claude)

Given the claude profile with `hooks.shape: "nested"`,
When `hooks/hooks.json` is processed,
Then each event's array of hook entries MUST be wrapped in `[{ hooks: [...] }]`,
So the output JSON has the shape `{ hooks: { EventName: [{ hooks: [...] }], ... } }`.

### Scenario 8: Hooks reshaping — Copilot format

Given the github-copilot profile with `hooks.format: "copilot"`,
When `hooks/hooks.json` is processed,
Then:
- The output file MUST be placed at `profile.hooks.location` (`.github/hooks/hooks.json`).
- Event names MUST be remapped using `profile.hooks.eventMap` (e.g. `SessionStart` → `sessionStart`).
- Events with no entry in the event map (e.g. `PreCompact`) MUST be dropped.
- The `${CLAUDE_PLUGIN_ROOT}/` prefix in command strings MUST be stripped.
- Timeout fields MUST be renamed from `timeout` to `timeoutSec`.

### Scenario 9: opencode synthesis

Given the opencode profile,
When `synthesizeFiles` runs after the per-file pass,
Then the generator MUST produce:
1. `opencode.json` — containing `$schema`, `mcp` (transformed from `.mcp.json` entries into the opencode `{type, command, environment, enabled}` shape), and `instructions` (glob path referencing `.opencode/instructions/*.md`).
2. `.opencode/plugins/ospec.js` — the JS hook bridge shim (verbatim from `opencode-plugin.js`).
And `.mcp.json` itself MUST be dropped from the opencode output (consumed by the config synthesizer).

### Scenario 10: Stale artifact pruning

Given a prior generation run that produced files in `outDir`,
When `writeTree` runs with a new set of desired files,
Then it MUST identify every managed root (top-level directories or files owned by the generator, including those automatically derived from desired file output paths and any additional roots explicitly declared via `profile.managedRoots`),
And MUST delete any file in those roots that is NOT in the desired output set (if a managed root itself is a file, the generator prunes it when it is not in the desired set),
And MUST then prune any directory left empty after deletion.
And it MUST NOT delete or touch files or directories that the generator never produces (non-managed roots).
And it MUST NOT use a whole-directory `rmSync` to avoid destructive blast radius.

### Scenario 11: Validation gate

Given a target profile with a `validate` field (argv array),
When the generator finishes writing the output tree,
Then it MUST spawn the validator as a child process with `shell: false` (no shell interpretation of arguments),
And it MUST substitute the `{out}` placeholder in validator args with the actual output path.
And if the command is `claude`, it resolves the binary path using the same PATH and WinGet LocalAppData fallbacks as the installation module.
And if spawning the validator child process fails (e.g. spawn error / file not found), the validation MUST return status code 1 and write the execution error to stderr rather than throwing an uncaught exception.
And if the validator exits with non-zero status OR its stdout matches `/(\d+)\s+errors?,\s*(\d+)\s+warnings?/i` with any error or warning count > 0, the validation MUST be considered failed.
And it MUST be possible to skip validation via `--no-validate` flag.

### Scenario 12: CLI entry point

Given the CLI is invoked as `node scripts/configure/cli.js --target <target> [--out dir] [--source dir] [--no-validate]`,
When arguments are parsed,
Then:
- `--target` MUST be one of `claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`; an unknown target causes exit code 2.
- `--out` defaults to `dist/<target>` relative to cwd.
- `--source` defaults to cwd.
- If `--target` is missing or invalid, the CLI MUST write a usage hint to stderr and set `process.exitCode = 2`.
- On success, the CLI MUST print a summary of generated file paths to stdout.
- On validation failure, the validator's output MUST be forwarded to stdout/stderr and the CLI exit code MUST reflect the validator's exit code (non-zero).
- If the CLI execution encounters an uncaught error, it MUST write the fatal error stack or message to stderr and terminate with exit code 1.

(Previously: five accepted targets; `cursor` is the sixth, validated by `scripts/configure/validate-cursor.js`.)

### Scenario 13: MCP Placeholder Normalization (Per-Profile Opt-In)

A target profile MAY declare MCP placeholder normalization by setting `mcpPlaceholders` (or an equivalent profile config key) to a truthy value. When a profile opts in, the transform MUST rewrite every `${input:NAME}` substring found in `.mcp.json` `env`, `args`, `url`, and `headers` string values to `${NAME:-}` before adding the file to the output tree. Profiles that do not opt in — notably `vscode` — MUST NOT have their `.mcp.json` modified.

#### Scenario: All four string fields normalized
- GIVEN a profile opts in and the source `.mcp.json` has `${input:KEY}` in `env`, `args`, `url`, and `headers` values
- WHEN `transform` rewrites `.mcp.json`
- THEN every occurrence in all four fields MUST be rewritten to `${KEY:-}`
- AND no `${input:` substring MUST remain in any of those fields

#### Scenario: github-copilot profile opts in
- GIVEN the github-copilot profile has MCP placeholder normalization enabled
- AND the source `.mcp.json` contains `${input:CONTEXT7_API_KEY}` in an `env` block
- WHEN the generator produces the github-copilot output
- THEN the output `.mcp.json` MUST contain `${CONTEXT7_API_KEY:-}` and MUST NOT contain `${input:`

#### Scenario: No input placeholders in source — output unchanged
- GIVEN a profile opts in but the source `.mcp.json` contains no `${input:` occurrences
- WHEN `transform` processes `.mcp.json`
- THEN the output MUST be identical to the source (no spurious mutations)

#### Scenario: vscode profile does not opt in — source preserved
- GIVEN the vscode profile does NOT declare MCP placeholder normalization
- WHEN the generator produces the vscode output
- THEN the output `.mcp.json` MUST preserve every `${input:NAME}` occurrence verbatim

### Scenario 14: No Residual Input Placeholders (Post-Generation Invariant)

After the generator writes the output tree, no `${input:` substring MUST remain in any generated `.mcp.json` for `claude` or `github-copilot`, nor in any `opencode.json` for `opencode`. The `opencode` guarantee is provided by the existing `${input:NAME}` → `{env:NAME}` transform in `transformMcpServers` and MUST remain intact. The `vscode` output is exempt — `${input:}` is its native syntax and MUST be preserved.

#### Scenario: claude output contains no residual placeholders
- GIVEN the source `.mcp.json` contains one or more `${input:NAME}` values
- WHEN the generator produces the claude output
- THEN the generated `.mcp.json` MUST NOT contain any `${input:` substring

#### Scenario: github-copilot output contains no residual placeholders
- GIVEN the source `.mcp.json` contains one or more `${input:NAME}` values
- WHEN the generator produces the github-copilot output
- THEN the generated `.mcp.json` MUST NOT contain any `${input:` substring

#### Scenario: opencode output — existing transform remains correct
- GIVEN the source `.mcp.json` contains `${input:NAME}` in an `env` block
- WHEN the generator produces the opencode `opencode.json`
- THEN all MCP server `environment` values MUST use `{env:NAME}` form
- AND the `opencode.json` MUST NOT contain any `${input:` substring

#### Scenario: vscode output — input placeholders preserved
- GIVEN the source `.mcp.json` contains `${input:CONTEXT7_API_KEY}` in an `env` block
- WHEN the generator produces the vscode output
- THEN the output `.mcp.json` MUST retain `${input:CONTEXT7_API_KEY}` unchanged

### Scenario 15: Validator MCP Residual Placeholder Detection

`validate-github-copilot.js` and `validate-opencode.js` MUST each include a check that fails — emitting at least one error and exiting with non-zero status — when any `${input:` substring is found in the validated output tree. This catch ensures that a misconfigured or new profile that omits the opt-in flag is detected at the validation gate rather than silently shipping broken config to users.

#### Scenario: validate-github-copilot fails on residual placeholder
- GIVEN the github-copilot output tree contains a `.mcp.json` with a `${input:KEY}` value
- WHEN `validate-github-copilot.js` runs against that output
- THEN the validator MUST emit at least one error and MUST exit with non-zero status

#### Scenario: validate-opencode fails on residual placeholder
- GIVEN the opencode output tree contains an `opencode.json` with a `${input:KEY}` value
- WHEN `validate-opencode.js` runs against that output
- THEN the validator MUST emit at least one error and MUST exit with non-zero status

#### Scenario: clean output passes the placeholder check
- GIVEN the output tree contains no `${input:` substrings
- WHEN the relevant validator runs
- THEN the validator MUST NOT report an error from the MCP residual placeholder check

### Scenario 16: Source Fixture MCP Env Block (Test Coverage)

The source test fixture `__fixtures__/source/.mcp.json` MUST contain at least one MCP server entry with an `env` block whose values use `${input:NAME}` syntax. This ensures that golden-comparison tests and transform-unit tests exercise the placeholder normalization path; without this fixture entry, CI passes even when normalization is missing because the path is never triggered.

#### Scenario: Fixture triggers placeholder rewrite in transform tests
- GIVEN `__fixtures__/source/.mcp.json` contains an `env` block with a `${input:NAME}` value
- WHEN the transform test runs for the claude or github-copilot target
- THEN the test MUST assert the generated `.mcp.json` contains `${NAME:-}` and no `${input:` substring

#### Scenario: Fixture triggers {env:NAME} rewrite in opencode tests
- GIVEN `__fixtures__/source/.mcp.json` contains an `env` block with a `${input:NAME}` value
- WHEN the transform test runs for the opencode target
- THEN the test MUST assert `opencode.json` contains `{env:NAME}` and no `${input:` substring

### Requirement: Agent Files May Emit TOML For Codex-Style Profiles {#REQ-generator-001}

A target profile MAY declare `agentFile.format: "toml"`. When declared, step 6 of the
transform pipeline (agent file handling) MUST, instead of stripping frontmatter into
markdown, convert the agent's frontmatter `name`/`description` into top-level TOML keys,
fold the markdown body into a `developer_instructions` TOML string, resolve `model` and
`model_reasoning_effort` from `models.yaml` using the existing model-injection mechanism
(generator Scenario 6, including the `OMIT` sentinel behavior), and assign `sandbox_mode`
from the agent's declared capability marker. The emitted file MUST be written to
`profile.agentFile.to` and MUST NOT be included in the profile's plugin manifest bundle
(`profile.manifest`) — agent files emitted in TOML format are shipped outside the bundle.
The emitted TOML file's path, and every path it references, MUST additionally satisfy
the safe `./`-relative path contract (generator Requirement REQ-generator-004).
(Previously: no explicit path-safety contract was cross-referenced for the emitted TOML
path.)

#### Scenario: Agent frontmatter converted to TOML fields

- GIVEN an agent file with frontmatter `name`, `description`, and a capability marker
- WHEN a profile with `agentFile.format: "toml"` processes it
- THEN the output MUST be a TOML file at `profile.agentFile.to` with `name`,
  `description`, `developer_instructions`, and `sandbox_mode` keys populated from the
  source frontmatter, body, and capability marker respectively

#### Scenario: Missing models.yaml column omits model field

- GIVEN `models.yaml` has no column for the current target
- WHEN the TOML emitter resolves `model` for an agent
- THEN the `model` key MUST be omitted entirely from the TOML output (fail-soft, no error)

#### Scenario: TOML agents excluded from plugin bundle

- GIVEN a profile with `agentFile.format: "toml"` and a `profile.manifest` bundle
- WHEN the generator reshapes the manifest via `reshapeManifest`
- THEN the manifest output MUST NOT reference agent files or an `agents` key

#### Scenario: Emitted TOML path is safe and `./`-relative

- GIVEN a profile with `agentFile.format: "toml"` targets the codex payload
- WHEN the generator writes the TOML agent file
- THEN its output path MUST be `./`-relative with no `..` traversal segment

### Requirement: Command Files May Emit Invocable Skills For Codex-Style Profiles {#REQ-generator-002}

A target profile MAY declare `commandFile.format: "skill"`. When declared, step 7 of the
transform pipeline (command file handling) MUST emit each `commands/*.prompt.md` under a
`skills/commands/<name>/SKILL.md` path — namespaced under a `commands/` subdirectory,
never at the bare `skills/<name>/SKILL.md` path — instead of a passthrough command file.
This namespacing is REQUIRED because `skills/<name>/SKILL.md` is already the established
output path for existing context-doc skills (passed through unchanged by step 9), and a
command source file frequently shares its base name with one of those (e.g. both
`commands/sdd-apply.prompt.md` and `skills/sdd-apply/SKILL.md` exist in the source tree);
emitting the command-derived skill at the bare path would silently collide with, and
overwrite or be overwritten by, the unrelated context doc, with no error signal. The
transform MUST also rewrite named `${input:x}` variables to positional `$1`/`$ARGUMENTS`
(same substitution style already used by the `opencode` profile), and MUST translate any
`agent:` frontmatter routing key into an explicit prose instruction directing the reader
to spawn the named agent — the routing key itself MUST NOT appear in the emitted skill's
frontmatter. The emitted `name:` frontmatter field (and therefore the `$sdd-*` invocation
name) MUST be derived from the command's own base name, unaffected by the `commands/`
directory prefix.

#### Scenario: Command emitted as invocable skill

- GIVEN a command file `commands/sdd-spec.prompt.md` with `agent: sdd-spec` in
  frontmatter and one `${input:changeName}` reference in its body
- WHEN a profile with `commandFile.format: "skill"` processes it
- THEN the output MUST be `skills/commands/sdd-spec/SKILL.md` with frontmatter
  `name: sdd-spec` (invocable as `$sdd-spec`), the body MUST contain an explicit
  instruction to spawn the `sdd-spec` agent, and `${input:changeName}` MUST become `$1`

#### Scenario: Command-derived skill does not collide with an existing context-doc skill of the same base name

- GIVEN a source tree containing both `commands/sdd-apply.prompt.md` and the existing
  context-doc skill `skills/sdd-apply/SKILL.md`
- WHEN a profile with `commandFile.format: "skill"` transforms the full tree
- THEN the output MUST contain both `skills/commands/sdd-apply/SKILL.md` (the
  command-derived skill) and `skills/sdd-apply/SKILL.md` (the untouched context doc) as
  two distinct files — neither MUST overwrite the other

#### Scenario: No prompts directory produced

- GIVEN a profile with `commandFile.format: "skill"`
- WHEN the generator writes the output tree
- THEN no file MUST be emitted under a `prompts/` path for any command source file

### Requirement: Tool Map May Declare Degraded Prose Substitution For Ask-Tool-Less Targets {#REQ-generator-003}

A profile's `toolMap` entry for an abstract tool name MAY declare a degradation marker
instead of a literal tool name. When a degradation marker is declared for an abstract
name, every prose occurrence of that abstract name (agent, command, or passthrough
files) MUST be replaced with the profile-declared fallback instruction text describing
the equivalent manual protocol, rather than with a bare tool name substitution. Profiles
that map the abstract name to a literal string or array (the four existing targets)
MUST continue to receive plain tool-name substitution, unaffected by this requirement.

#### Scenario: AskUserQuestion degrades to chat protocol text

- GIVEN a profile declares a degradation marker for the abstract `AskUserQuestion` name
- WHEN an agent file references `AskUserQuestion` in prose
- THEN the emitted output MUST contain the profile's declared chat-protocol instruction
  text in place of `AskUserQuestion`, and MUST NOT contain a bare tool-name substitution

#### Scenario: Existing targets unaffected

- GIVEN the `claude`, `vscode`, `github-copilot`, and `opencode` profiles, none of which
  declare a degradation marker
- WHEN their outputs are generated
- THEN `AskUserQuestion` (or `vscode/askQuestions`) substitution MUST remain identical to
  current behavior (a literal target tool name)

### Requirement: Codex Published Payload Path and Metadata Safety {#REQ-generator-004}

When the generator produces the `codex` target's published payload (the tree consumed
by `install-codex.js` / `codex-marketplace.js`), every file path referenced inside
generated manifest/config artifacts (`.codex-plugin/plugin.json`, TOML
agent files) MUST be emitted as a safe relative path rooted at `./` (e.g.
`./scripts/hooks/session-start.js`), MUST NOT contain `..` path-traversal segments, and
MUST NOT resolve to an absolute filesystem path. The Codex payload MUST NOT contain
`.mcp.json` or a manifest `mcpServers` field: Codex scopes plugin MCPs independently
from user MCPs, so bundling the canonical definitions would start duplicate processes.
The canonical source `.mcp.json` remains installer input and is registered through the
native `codex mcp` CLI with valid normalized names.

#### Scenario: Safe relative paths emitted for codex payload

- GIVEN the generator produces the `codex` target's published payload
- WHEN a hook or plugin manifest entry references a runtime script path
- THEN the emitted path MUST be `./`-relative, contain no `..` segment, and MUST NOT be
  an absolute filesystem path

#### Scenario: Bundled MCP configuration fails validation

- GIVEN a generated Codex payload contains `.mcp.json` or declares `mcpServers` in the
  plugin manifest
- WHEN the codex validator runs against the generated payload
- THEN it MUST emit at least one error and MUST exit with non-zero status

#### Scenario: Conformant payload passes validation

- GIVEN all payload paths are `./`-relative with no traversal and no bundled MCP
  configuration is present
- WHEN the codex validator runs
- THEN it MUST NOT report an error from this check

### Requirement: Intentional SDD Agent Model-Tier Migration {#REQ-generator-005}

`models.yaml` MUST be the single source of truth for which SDD agent maps to
which cost tier (`premium`, `default`, or `cheap`). The validator MUST NOT
hardcode or restore a prior agent→tier partition. It MUST only enforce
structural invariants: the complete 17-agent SDD roster is present, each SDD
agent uses a known tier, no unexpected `sdd-*` agents appear, review agents and
`_default` stay on `default`, duplicate YAML keys are rejected, and Codex tier
pins remain Sol/medium, Terra/medium, and Luna/low.

The generator MUST apply the tier declared in `models.yaml` consistently for
every supported generated target that defines a model value for the selected
tier. Targets without a model column MUST preserve the existing fail-soft
omission behavior. Codex output MUST contain the exact model and
reasoning-effort pair pinned for that tier. Contract tests MUST derive the
agent→tier partition from `models.yaml`, reject incomplete or structurally
invalid policies, and verify generated model parity against that YAML mapping.

#### Scenario: Complete SDD agent roster is accepted from models.yaml

- GIVEN `models.yaml` assigns every required SDD agent to a known tier
- WHEN the model-tier contract is validated
- THEN every listed SDD agent MUST occur in exactly one known tier
- AND the validator MUST accept the mapping without comparing it to a hardcoded prior partition

#### Scenario: Agent tier reassignment in models.yaml is honored

- GIVEN `sdd-propose` is reassigned from one known tier to another in `models.yaml`
- WHEN model-capable target outputs are generated
- THEN each output MUST resolve `sdd-propose` from that target's model definition for the newly declared tier
- AND validation MUST NOT fail solely because the assignment differs from a previous policy

#### Scenario: Default tier resolves to Terra medium on Codex

- GIVEN any SDD agent assigned to `default` in `models.yaml` is generated for Codex
- WHEN model policy is injected
- THEN its model MUST be `gpt-5.6-terra`
- AND its reasoning effort MUST be `medium`

#### Scenario: Cheap tier resolves to Luna low on Codex

- GIVEN any SDD agent assigned to `cheap` in `models.yaml` is generated for Codex
- WHEN model policy is injected
- THEN its model MUST be `gpt-5.6-luna`
- AND its reasoning effort MUST be `low`

#### Scenario: Structural policy defects fail the contract

- GIVEN a policy is missing a required SDD agent, uses an unknown tier, adds an unexpected `sdd-*` agent, drifts a reviewer off `default`, or breaks a Codex pin
- WHEN the complete mapping contract runs
- THEN validation MUST fail with the matching structural error code
- AND generation parity MUST NOT be reported as passing

#### Scenario: Model-capable targets preserve tier parity

- GIVEN the `models.yaml` mapping and tier definitions
- WHEN all model-capable target generators process the same agent roster
- THEN each generated agent MUST use the model belonging to its YAML-declared tier for that target
- AND contract tests MUST fail if any target resolves an agent from a different tier

#### Scenario: Target without a model column remains fail-soft

- GIVEN a supported target declares no model column for the selected tier
- WHEN it generates an agent from the required roster
- THEN it MUST preserve the baseline omission behavior rather than inventing a model
- AND the tier-parity contract MUST NOT treat that omission as a mismatch

### Requirement: Rules May Emit Cursor MDC Files {#REQ-generator-006}

A target profile MAY declare `rules.strategy: "to-mdc"`. When declared, each
`rules/*.instructions.md` (or profile-equivalent rules source) MUST be emitted under
`profile.rules.dir/` as a `.mdc` file with Cursor rule frontmatter containing
`description`, `globs`, and `alwaysApply`. The transform MUST also synthesize
`agents-protocol.mdc` from repository `AGENTS.md` when the profile declares a
`rules.synthesize` entry for that source. Other strategies
(`inline-into-orchestrator`, `to-instructions`, `to-instructions-config`) MUST remain
unchanged.

#### Scenario: Instruction rule emitted as mdc

- GIVEN a profile with `rules.strategy: "to-mdc"` and a source rules file
- WHEN the transform processes that rules file
- THEN the output MUST be a `.mdc` under `profile.rules.dir/` with `description`,
  `globs`, and `alwaysApply` frontmatter keys

#### Scenario: AGENTS.md synthesized as agents-protocol.mdc

- GIVEN the profile declares `rules.synthesize` from `AGENTS.md` to base
  `agents-protocol`
- WHEN the transform completes
- THEN `agents-protocol.mdc` MUST exist in the rules output directory

### Requirement: Hooks May Emit Cursor CamelCase Event Map {#REQ-generator-007}

A target profile MAY declare `hooks.format: "cursor"`. When declared, the transform
MUST reshape `hooks/hooks.json` into Cursor schema: top-level `version: 1`, camelCase
event keys via `profile.hooks.eventMap`, and command strings that invoke
`ospec-hooks-launch.js` with the mapped phase under the runtime placeholder
`__OSPEC_CURSOR_ROOT__`. Source events absent from the event map (including
`SubagentStop`) MUST be dropped. Nested/copilot/codex hook formats MUST remain
unaffected.

#### Scenario: Cursor hooks emit mapped camelCase events

- GIVEN the cursor profile with `hooks.format: "cursor"` and a verified eventMap
- WHEN `hooks/hooks.json` is transformed
- THEN output MUST use camelCase events from the map, retain `version: 1`, and embed
  `__OSPEC_CURSOR_ROOT__` in launcher commands
- AND `SubagentStop` MUST NOT appear when unmapped

#### Scenario: Unmapped source events are dropped

- GIVEN a source hooks file contains an event with no eventMap entry
- WHEN cursor hooks reshape runs
- THEN that event MUST be absent from the emitted `hooks.json`

### Requirement: Review Agents May Emit Readonly Frontmatter {#REQ-generator-008}

A target profile MAY declare an agent-readonly policy (explicit reviewer id list or
equivalent). When declared, each listed review agent MUST emit `readonly: true` in
output frontmatter. Non-listed agents MUST NOT gain `readonly` solely from this
policy. For the `cursor` profile the six `review-*` agents MUST be covered.

#### Scenario: Cursor review agents are readonly

- GIVEN the cursor profile's readonly policy lists the six `review-*` agents
- WHEN those agents are transformed
- THEN each emitted agent file MUST include `readonly: true`

#### Scenario: Non-review agents omit readonly

- GIVEN an SDD phase agent not listed in the readonly policy
- WHEN the cursor profile transforms it
- THEN the emitted frontmatter MUST NOT include `readonly: true`

### Requirement: Cursor Target Profile And Tool Map {#REQ-generator-009}

The generator MUST register `cursor` as a sixth supported target in the CLI profile
registry. The cursor profile MUST declare a Cursor-native `toolMap`: `read→Read`,
`edit→Write`+`StrReplace` (primary `Write`), `search→Grep`+`Glob` (primary `Grep`),
`execute→Shell`, `agent→Task`, and degradation markers for `vscode/askQuestions` and
`AskUserQuestion` per REQ-generator-003 describing a structured numbered chat
question_gate, STOP-and-wait, and `state.yaml` approval persistence. Cursor output
MUST inject `model:` from the `models.yaml` `cursor:` column for every SDD agent that
resolves a model. The cursor validator MUST fail on leftover `vscode/` ask-tool
residue, bare `AskUserQuestion`, or unmapped abstract tool names in emitted **agent**
bodies and agent frontmatter. Command files MAY retain `${input:…}` and `agent:`
frontmatter in this change; `validate-cursor` MUST NOT fail solely because commands
still contain `${input:…}`. Command `${input:}` / `agent:` strip is out of scope.

#### Scenario: Cursor is accepted as CLI target

- GIVEN `node scripts/configure/cli.js --target cursor`
- WHEN arguments are parsed
- THEN the CLI MUST accept `cursor` and default `--out` to `dist/cursor`

#### Scenario: Cursor toolMap substitutes native names

- GIVEN an agent prose reference to an abstract edit/search/execute/agent tool
- WHEN the cursor profile transforms the file
- THEN prose MUST use Cursor-native primary names (`Write`, `Grep`, `Shell`, `Task`)

#### Scenario: Ask tools degrade on cursor

- GIVEN agent prose references `vscode/askQuestions` or `AskUserQuestion`
- WHEN the cursor profile transforms the file
- THEN output MUST contain the degrade chat-gate instruction and MUST NOT retain those
  literal tool names

#### Scenario: Cursor model column injected

- GIVEN `models.yaml` defines a `cursor:` value for an SDD agent tier
- WHEN cursor generation runs
- THEN each resolved SDD agent frontmatter MUST include `model:` from that column

#### Scenario: Validator rejects vscode ask residue

- GIVEN a generated cursor **agent** still contains `vscode/askQuestions`, bare
  `AskUserQuestion`, or an unmapped abstract tool name in its body or frontmatter
- WHEN `validate-cursor.js` runs
- THEN it MUST emit an error and exit non-zero
- AND leftover `${input:…}` or `agent:` keys in **command** files alone MUST NOT
  cause validation failure

### Requirement: models.yaml List Parsing And Pre-Transform Policy Gate {#REQ-generator-010}

`parseModels` MUST accept YAML list items (`- value`) under the current mapping parent, converting an empty nested object into an array when the first list item appears. Duplicate mapping keys MUST throw with a line-numbered error. Before invoking `transform`, `runConfigure` MUST call `validateSddModelPolicy(models)` and, when `valid` is false, MUST return `exitCode: 1` with empty `files` and a stderr message containing the structured policy errors — it MUST NOT write an output tree for an invalid policy.

#### Scenario: YAML list items are parsed under a parent key

- GIVEN `models.yaml` contains a mapping key whose children are `- item` list entries
- WHEN `parseModels` runs
- THEN that key's value MUST be an array of the parsed list scalars
- AND subsequent non-list siblings MUST continue to parse under the correct parent

#### Scenario: Duplicate key fails closed

- GIVEN `models.yaml` repeats the same mapping key at one indent level
- WHEN `parseModels` runs
- THEN it MUST throw an error naming the duplicate key and 1-based line number

#### Scenario: Invalid SDD model policy aborts configure

- GIVEN `validateSddModelPolicy` returns `{ valid: false, errors: [...] }`
- WHEN `runConfigure` proceeds past model load
- THEN it MUST return `exitCode: 1` without writing transformed files
- AND `validation.stderr` MUST include the serialized policy errors

### Requirement: Codex Review And Apply/Verify Sandbox Validator Rules {#REQ-generator-011}

For the Codex target, `validate-codex.js` MUST require every generated agent TOML whose basename starts with `review-` to declare `approval_policy = "never"`. For `sdd-apply.toml` and `sdd-verify.toml` it MUST require a `[sandbox_workspace_write]` table and `network_access = false`.

#### Scenario: Review agent TOML missing approval_policy fails

- GIVEN a Codex agent file `review-risk.toml` lacks `approval_policy = "never"`
- WHEN the Codex validator runs
- THEN it MUST emit an error naming that file and the missing policy

#### Scenario: Apply/verify sandbox network must be disabled

- GIVEN `sdd-apply.toml` or `sdd-verify.toml` omits `[sandbox_workspace_write]` or leaves network access enabled
- WHEN the Codex validator runs
- THEN it MUST emit an error for the missing table and/or disabled-network requirement

### Requirement: Copilot Validator Skips Binary Content And Accepts Injectable FS {#REQ-generator-012}

`validate-github-copilot.js` MUST accept an optional filesystem injection for tests. When scanning for forbidden text, it MUST skip buffers that match known binary magic prefixes, contain a NUL byte, or fail fatal UTF-8 decode, rather than treating them as text. Each validation check MUST be wrapped so an unexpected throw becomes a labeled error instead of aborting the whole validate call.

#### Scenario: Binary file is not scanned as forbidden text

- GIVEN the output tree contains a PE/ELF/Mach-O binary or a file with embedded NUL bytes
- WHEN forbidden-text validation runs
- THEN that file MUST be skipped without a decode error
- AND text files MUST still be scanned for forbidden residues

### Requirement: Cursor Installed-Tree Validator {#REQ-generator-013}

In addition to generated-tree validation, `validate-cursor.js` MUST export `validateInstalled` that re-checks required paths, agents, and rules; rejects unresolved `__OSPEC_CURSOR_ROOT__` placeholders in installed `hooks.json`; requires each hook command to point inside the installed Cursor root's `scripts/hooks/`; forbids `SubagentStop` events; and requires the platform `ospec-hooks` binary to exist (and be executable on non-Windows). Generated-tree `validate` MUST still require version `1`, allowlisted Cursor hook events, and `__OSPEC_CURSOR_ROOT__` in generated commands.

#### Scenario: Installed hooks retain unresolved placeholder

- GIVEN an installed Cursor `hooks.json` still contains `__OSPEC_CURSOR_ROOT__`
- WHEN `validateInstalled` runs
- THEN it MUST emit an error for the unresolved placeholder

#### Scenario: Required binary missing under installed root

- GIVEN the installed Cursor tree lacks `scripts/hooks/ospec-hooks` (with host extension)
- WHEN `validateInstalled` runs
- THEN it MUST emit a required-binary-missing error

## Invariants

- The transform function (`transform`) MUST be pure: it MUST NOT read from the filesystem, network, or process environment; the input `files` array MUST NOT be mutated.
- Output files MUST be sorted lexicographically by path so generation is deterministic across operating systems and CI runners.
- The runtime script bundler MUST resolve `require()` paths statically (regex match only) without executing the scripts.
- The custom `models.yaml` parser MUST have zero external runtime dependencies (no `yaml` / `js-yaml` package).
- Validator commands MUST always be spawned with `shell: false` to prevent path injection.
- Stale pruning MUST be scoped to managed roots only; unrelated destination files MUST NOT be removed.
