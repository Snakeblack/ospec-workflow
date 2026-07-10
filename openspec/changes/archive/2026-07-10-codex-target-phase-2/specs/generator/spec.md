# Delta for generator

## ADDED Requirements

### Requirement: Codex Published Payload Path and Metadata Safety {#REQ-generator-004}

When the generator produces the `codex` target's published payload (the tree consumed
by `install-codex.js` / `codex-marketplace.js`), every file path referenced inside
generated manifest/config artifacts (`.codex-plugin/plugin.json`, `.mcp.json`, TOML
agent files) MUST be emitted as a safe relative path rooted at `./` (e.g.
`./scripts/hooks/session-start.js`), MUST NOT contain `..` path-traversal segments, and
MUST NOT resolve to an absolute filesystem path. The generator MUST also validate that
every MCP server id declared in the payload's `.mcp.json` matches
`^[a-zA-Z0-9_-]+$`; a payload containing an id outside this pattern MUST fail
generation-time validation (`--no-validate` bypasses this check like other validation
gates, per generator Scenario 11).

#### Scenario: Safe relative paths emitted for codex payload

- GIVEN the generator produces the `codex` target's published payload
- WHEN a hook or plugin manifest entry references a runtime script path
- THEN the emitted path MUST be `./`-relative, contain no `..` segment, and MUST NOT be
  an absolute filesystem path

#### Scenario: MCP id violating the safe pattern fails validation

- GIVEN the source `.mcp.json` declares an MCP server id containing a character outside
  `^[a-zA-Z0-9_-]+$` (e.g. a space or `/`)
- WHEN the codex validator runs against the generated payload
- THEN it MUST emit at least one error and MUST exit with non-zero status

#### Scenario: Conformant payload passes validation

- GIVEN all payload paths are `./`-relative with no traversal and every MCP id matches
  `^[a-zA-Z0-9_-]+$`
- WHEN the codex validator runs
- THEN it MUST NOT report an error from this check

## MODIFIED Requirements

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

## Clarifications

### Session 2026-07-10

- Q: (clarify-gate review) No material ambiguity found across the four delta specs. → A: Requirements are anchored to concrete baseline mechanisms (e.g. `$PLUGIN_ROOT` substitution in hooks REQ-hooks-003, `bypassPermissions` degradation in hooks §3.4.1) with exact regex/field-level acceptance criteria; no open decision point would change architecture, data model, or test scope. No questions asked.
