# Delta for generator

## ADDED Requirements

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

## MODIFIED Requirements

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

All four scripts and their transitive `require()` dependencies MUST be present in the dist of ALL six targets (`claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`) under `scripts/lib/`.
And it MUST NOT include test files (`.test.js`) or generator-only modules (`target-*`, `frontmatter`, `model-resolver`, `configure/`) in the runtime script bundle. Transitive dependencies are subjected to the same exclusion check, preventing excluded files from being resolved or bundled.
If reading an individual file fails during script gathering, the generator MUST log a warning to stderr and skip that file rather than failing the build.
And it MUST silently skip any root that does not exist on disk.

The canonical `SOURCE_ROOTS` are:
`.claude-plugin/plugin.json`, `hooks/hooks.json`, `.mcp.json`, `agents/`, `commands/`, `rules/`, `skills/`.

(Previously: applied to five targets; `cursor` is now a sixth target whose dist must also carry the full runtime script bundle.)

#### Scenario: Skill entry-point scripts present in dist

- GIVEN the source tree contains the four skill entry-point scripts under `scripts/lib/`
- WHEN `gatherRuntimeScripts` runs during generation for any of the six targets (`claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`)
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

## Clarifications

### Session 2026-07-25

- Q: ¿`validate-cursor` / el contrato de `dist/cursor` DEBE fallar ante cualquier `${input:…}` (incluidos commands), o solo ante residuo `vscode/`/`AskUserQuestion` en agents, dejando el strip de `${input:…}`/`agent:` en commands diferido? → A: Fail on leftover `vscode/`, `AskUserQuestion`, or unmapped abstract tool names in agent bodies/frontmatter only; command `${input:…}`/`agent:` MAY remain this change and MUST NOT alone fail the validator (strip deferred).
