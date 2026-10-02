# Delta for generator

## ADDED Requirements

### Requirement: Engram Addendum Is Confined to the Claude Target {#REQ-generator-018}

The generator MUST include the Engram session-memory addendum rule only in `claude` output and MUST exclude it from `github-copilot`, `opencode`, `codex`, `cursor`, `vscode` and `antigravity` profiles. Generated output of every target MUST NOT contain an Engram MCP server entry or Engram memory hook. The only change to non-Claude output attributable to this change MUST be the host-neutral memory table text in `sdd-phase-common`. Tests MUST self-generate output in a temporary directory (not read the root `dist/`).

#### Scenario: Claude output includes the addendum

- GIVEN a Claude build is generated
- WHEN the rules tree is listed
- THEN the Engram addendum is present and `.mcp.json` has no `engram` entry

#### Scenario: Non-Claude targets exclude the addendum

- GIVEN builds for each non-Claude target
- WHEN each tree is searched for the addendum file and `engram` MCP/hook entries
- THEN none is found

#### Scenario: Only the neutral table text differs

- GIVEN a non-Claude build before and after this change
- WHEN the two trees are diffed
- THEN the sole difference is the `sdd-phase-common` memory table wording
