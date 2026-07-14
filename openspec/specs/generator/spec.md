# Domain Spec: generator

## Overview

The generator is the build pipeline that transforms the canonical source plugin tree into target-native file distributions for five supported targets: `claude`, `vscode`, `github-copilot`, `opencode`, and `codex`. It is composed of a pure transform layer (`scripts/lib/target-transform.js`) and an IO shell (`scripts/configure/cli.js`) that handles filesystem reads, writes, and validation.

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
| `scripts/lib/federation-marker.js` | enroll runtime |
| `scripts/lib/federation-explore.js` | explore runtime |
| `scripts/lib/workspace-general-baseline.js` | general-baseline runtime |
| `scripts/lib/federation-baseline-orchestrator.js` | baseline-orchestrator runtime |

All four scripts and their transitive `require()` dependencies MUST be present in the dist of ALL five targets (`claude`, `vscode`, `github-copilot`, `opencode`, `codex`) under `scripts/lib/`.
And it MUST NOT include test files (`.test.js`) or generator-only modules (`target-*`, `frontmatter`, `model-resolver`, `configure/`) in the runtime script bundle. Transitive dependencies are subjected to the same exclusion check, preventing excluded files from being resolved or bundled.
If reading an individual file fails during script gathering, the generator MUST log a warning to stderr and skip that file rather than failing the build.
And it MUST silently skip any root that does not exist on disk.

The canonical `SOURCE_ROOTS` are:
`.claude-plugin/plugin.json`, `hooks/hooks.json`, `.mcp.json`, `agents/`, `commands/`, `rules/`, `skills/`.

(Previously: applied to four targets only; `codex` is now a fifth target whose dist must also carry the full runtime script bundle.)

#### Scenario: Skill entry-point scripts present in dist

- GIVEN the source tree contains the four skill entry-point scripts under `scripts/lib/`
- WHEN `gatherRuntimeScripts` runs during generation for any of the five targets (`claude`, `vscode`, `github-copilot`, `opencode`, `codex`)
- THEN `federation-marker.js`, `federation-explore.js`, `workspace-general-baseline.js`, and `federation-baseline-orchestrator.js` MUST each appear in the collected runtime file set
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
5. Rules files (`rules/` prefix) — either inlined into the orchestrator agent, emitted as instruction files, or passed through, depending on `profile.rules.strategy`.
6. Agent files (matching `profile.agentFile.from`) — handled via `handleAgent` (frontmatter strip, model injection, tool name substitution); or emitted as an orchestrator skill when the profile sets `orchestrator.emitAs: "skill"`; or emitted as a TOML file per `agentFile.format: "toml"` (generator Requirement: Agent Files May Emit TOML For Codex-Style Profiles), excluded from the plugin manifest bundle in that case.
7. Command files (matching `profile.commandFile.from`) — handled via `handleCommand` (frontmatter strip, variable substitution); or emitted as an invocable skill per `commandFile.format: "skill"` (generator Requirement: Command Files May Emit Invocable Skills For Codex-Style Profiles).
8. **`.mcp.json` for profiles with MCP placeholder normalization enabled** (`profile.mcpPlaceholders` truthy) — every `${input:NAME}` occurrence in `env`, `args`, `url`, and `headers` string values MUST be rewritten to `${NAME:-}` before the file is added to the output tree; intercepted here and MUST NOT reach step 9.
9. Passthrough (skills, shared docs with `.md` extension) — tool name substitution in prose applied; binary/other files copied as-is.

And synthesized files (e.g. `opencode.json`, the opencode JS plugin shim) MUST be appended after the per-file pass.
And the output file array MUST be sorted deterministically by path (lexicographic ascending) regardless of OS filesystem read order.

(Previously: `.mcp.json` fell through to step 8 (passthrough) for all profiles including claude and github-copilot, leaving `${input:NAME}` placeholders unresolved in those outputs. Step count was 8; it is now 9. Steps 6 and 7 additionally now support alternate TOML/skill output formats per profile declaration, in addition to their prior markdown-only behavior.)

### Scenario 3: Rules strategy dispatch

Given a profile with a `rules.strategy` field,
When a `rules/*.md` file is processed,
Then:
- If `strategy` is `"inline-into-orchestrator"`: the file MUST be dropped from output (content is folded into the orchestrator agent/skill by a separate collector).
- If `strategy` is `"to-instructions"`: the file MUST be emitted under `profile.rules.dir/` with the target extension and an `applyTo` frontmatter key added.
- If `strategy` is `"to-instructions-config"`: the file MUST be emitted under `profile.rules.dir/` and referenced from the synthesized config file (e.g. `opencode.json`); no `applyTo` key is added.

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
- `--target` MUST be one of `claude`, `vscode`, `github-copilot`, `opencode`, `codex`; an unknown target causes exit code 2.
- `--out` defaults to `dist/<target>` relative to cwd.
- `--source` defaults to cwd.
- If `--target` is missing or invalid, the CLI MUST write a usage hint to stderr and set `process.exitCode = 2`.
- On success, the CLI MUST print a summary of generated file paths to stdout.
- On validation failure, the validator's output MUST be forwarded to stdout/stderr and the CLI exit code MUST reflect the validator's exit code (non-zero).
- If the CLI execution encounters an uncaught error, it MUST write the fatal error stack or message to stderr and terminate with exit code 1.

(Previously: `--target` accepted four values; `codex` is registered as the fifth entry in the `scripts/configure/cli.js` registry, validated by `scripts/configure/validate-codex.js`.)

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

## Invariants

- The transform function (`transform`) MUST be pure: it MUST NOT read from the filesystem, network, or process environment; the input `files` array MUST NOT be mutated.
- Output files MUST be sorted lexicographically by path so generation is deterministic across operating systems and CI runners.
- The runtime script bundler MUST resolve `require()` paths statically (regex match only) without executing the scripts.
- The custom `models.yaml` parser MUST have zero external runtime dependencies (no `yaml` / `js-yaml` package).
- Validator commands MUST always be spawned with `shell: false` to prevent path injection.
- Stale pruning MUST be scoped to managed roots only; unrelated destination files MUST NOT be removed.
