# Delta for generator

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Source tree loading ampliado

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
And it MUST NOT include test files (`.test.js`) or generator-only modules (`target-*`, `frontmatter`, `model-resolver`, `configure/`) in the runtime script bundle.
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

(Previously: `--target` accepted four values; `codex` is registered as the fifth entry in the `scripts/configure/cli.js` registry, validated by `scripts/configure/validate-codex.js`.)
