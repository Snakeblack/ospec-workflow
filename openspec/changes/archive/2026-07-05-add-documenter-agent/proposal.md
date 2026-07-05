# Proposal: Add Documenter Agent

## Intent

Introduce a new documentation generation agent (`sdd-document`) to compile repository architecture, specs, and status into local Markdown wiki files. The agent provides an interactive launch gate to select the documentation scope, ensuring high quality (OpenWiki style) or flexible options.

## Scope

### In Scope
- Create `agents/sdd-document.agent.md` with instructions for generating wiki pages.
- Create `commands/sdd-document.prompt.md` to map `/sdd-document` to the orchestrator.
- Block agent launch with a `question_gate` offering Option A (Full Technical Wiki, OpenWiki style), Option B (SDD Status & Specs under `docs/wiki/`), and Option C (Custom freeform).
- Implement Option A output to match OpenWiki quality standards (`quickstart.md` + `openwiki/` structure).
- Register `sdd-document` in `models.yaml` under the `default` tier.
- Add `sdd-document` to the agent catalog in `agents` specification.

### Out of Scope
- Modifying the core generator transform logic.
- External wiki API integration (local files only).

## Capabilities

### New Capabilities
- `sdd-document`: Specification defining the behavior, interactive launch scope gate, and output directory structures of the wiki-generator agent.

### Modified Capabilities
- `agents`: Update the catalog to include the `sdd-document` executor, interactive scope gate, and `/sdd-document` command.

## Approach

1. **Agent Definition**: Write `agents/sdd-document.agent.md` defining its system instructions, frontmatter, and launch blocking logic.
2. **Interactive Launch Gate**: Configure the orchestrator/agent prompt to present a `question_gate` with options A (Recommended - OpenWiki style), B (Status/Specs under `docs/wiki/`), and C (Custom).
3. **Generation Output**: Program the agent to generate OpenWiki-quality docs under `openwiki/` for Option A, SDD summaries under `docs/wiki/` for Option B, and custom path structure for Option C.
4. **Command & Configuration**: Define `/sdd-document` in `commands/sdd-document.prompt.md`, add mapping to `models.yaml` under default tier, and update `openspec/specs/agents/spec.md`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `agents/sdd-document.agent.md` | New | Agent prompt, YAML metadata, and launch gate instructions |
| `commands/sdd-document.prompt.md` | New | Slash command definition mapping |
| `models.yaml` | Modified | Model tier registration for sdd-document |
| `openspec/specs/agents/spec.md` | Modified | Update agents catalog specification |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Option A output fails to reach OpenWiki quality standard | Medium | Establish strict structural and content templates for OpenWiki style |
| Freeform scope (Option C) leads to fuzzy outputs | Medium | Require validation/clarification of custom paths in prompt |
| Missing model mapping at runtime | Low | Verify mapping in `models.yaml` during validation |

## Rollback Plan

To revert the change:
1. Delete `agents/sdd-document.agent.md` and `commands/sdd-document.prompt.md`.
2. Revert modifications in `models.yaml` and `openspec/specs/agents/spec.md`.
3. Run `node scripts/configure/cli.js --target vscode` to regenerate and prune distribution targets.

## Dependencies

- None

## Success Criteria

- [ ] `sdd-document` is successfully registered in `models.yaml`.
- [ ] Running `/sdd-document` blocks at launch with a scope choice question gate.
- [ ] Option A generates high-quality files matching the OpenWiki quickstart/structure.
- [ ] Option B generates specs and status under `docs/wiki/`.
- [ ] Running the generator outputs target-specific files for the agent and command under `dist/`.
