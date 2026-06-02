Verdict: Aligned with caveats

# Official VS Code Agent Plugin Alignment Report

Date: 2026-06-02

Scope: formal verification of this repository against current official VS Code Agent Customization / Agent Plugin documentation and the GitHub Copilot CLI `plugin.json` schema reference.

Mode: verification only. No runtime plugin assets were intentionally edited during this verification. The only permitted output artifact is this report.

Skill resolution: none. `.atl/skill-registry.md` is absent, so no project skill registry rules were loaded.

## Executive Summary

The repository is aligned with the official Agent Plugin model as a declarative plugin bundle, not a VS Code extension. The manifest location and core component fields are compatible with current official documentation, agents and skills follow the documented file conventions, hooks and MCP are declared through documented manifest fields, and the docs correctly warn about preview, trust, local execution, and policy constraints.

The remaining caveats are mostly documentation maturity and runtime-verification limits: the public docs clearly support plugin command directories and slash commands, but the exact `commands/*.md` wrapper format is less explicitly documented than `.agent.md` and `SKILL.md`; `rules/` appears to be a VS Code wizard-generated plugin-bundled location, while public custom-instruction docs emphasize `.github/instructions/`; and actual VS Code loading behavior must still be verified inside a VS Code build with Agent Plugins enabled.

No ACTION REQUIRED finding was proven from repository files alone.

## Official Documentation Consulted

The following pages were consulted live during this verification:

| Source | Status | Summarized official facts used |
| --- | --- | --- |
| VS Code Agent Plugins, `https://code.visualstudio.com/docs/agent-customization/agent-plugins` | HTTP 200 | Agent Plugins are preview bundles of agent customizations. A plugin can provide slash commands, agent skills, custom agents, hooks, and MCP servers. Plugins use `plugin.json`, support component paths such as `skills`, `agents`, `hooks`, and `mcpServers`, recognize `.plugin/plugin.json`, and can use `${PLUGIN_ROOT}` in plugin-relative hook/MCP commands. |
| VS Code Custom Agents, `https://code.visualstudio.com/docs/agent-customization/custom-agents` | HTTP 200 | Custom agents are `.agent.md` files with YAML frontmatter and instructions. They can define tools, subagent restrictions, handoffs, `target`, and `user-invocable: false` for agents hidden from direct user selection. |
| VS Code Agent Skills, `https://code.visualstudio.com/docs/agent-customization/agent-skills` | HTTP 200 | Agent Skills are directories containing a required `SKILL.md`. The skill file has YAML frontmatter, and the directory name must match the `name` field. The user-supplied `/agent-customization/skills` URL currently returned 404, so the current official `/agent-skills` page was used. |
| VS Code Custom Instructions, `https://code.visualstudio.com/docs/agent-customization/custom-instructions` | HTTP 200 | Custom instructions use `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, root or workspace/user `*.instructions.md`, optional `applyTo`, and configurable instruction locations. `.github/instructions` is documented as a workspace custom-instructions location. |
| VS Code Agent Hooks, `https://code.visualstudio.com/docs/agent-customization/hooks` | HTTP 200 | Hooks are preview deterministic shell commands at lifecycle points. Documented events include `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `SubagentStart`, `SubagentStop`, and `Stop`. Hooks receive structured JSON and can return JSON. Organization policy can disable hooks. |
| GitHub Copilot CLI plugin reference, `https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference#pluginjson` | HTTP 200 | `plugin.json` requires kebab-case `name`, supports optional metadata including `description`, `version`, and `author`, and supports component path fields `agents`, `skills`, `commands`, `hooks`, and `mcpServers`. Supported manifest locations include `.plugin/plugin.json`, root `plugin.json`, `.github/plugin/plugin.json`, and `.claude-plugin/plugin.json`. |

## Findings

| Severity | Area | Finding | Repository Evidence | Recommended Fix |
| --- | --- | --- | --- | --- |
| OK | Manifest location and schema | The plugin manifest is in a recognized location and uses compatible fields. `name` is kebab-case, `version` is semver-shaped, and component paths resolve. | `.plugin/plugin.json` declares `name`, `description`, `version`, `author`, `agents`, `commands`, `skills`, `mcpServers`, and `hooks`; local JSON parse confirmed all referenced paths exist. | None. Keep `.plugin/plugin.json` as the primary manifest. |
| OK | Declarative plugin, not extension | The repository shape is a declarative Agent Plugin, not a VS Code extension. | No `package.json` was found. Extension drift search found only documentation/prohibition text in `llm-refactor-instruction.md` and `docs/refactor/*.md`, not runtime extension code. | None. Continue blocking VS Code extension scaffolding unless explicitly approved. |
| OK | Custom-agent files | Agent files follow the documented `.agent.md` convention with YAML frontmatter and agent instructions. | `agents/*.agent.md` contain `name`, `description`, `tools`, `user-invocable`, and `target: vscode` frontmatter. | None. |
| OK | User-facing agent topology | Exactly one SDD agent is user-facing, and it is the orchestrator. Phase agents are hidden from users. This is appropriate for a subagent topology. | `agents/sdd-orchestrator.agent.md` has `user-invocable: true` and lists phase agents under `agents`. All other `agents/sdd-*.agent.md` files have `user-invocable: false`. | None. Manual VS Code verification should still confirm picker visibility. |
| OK | Skills | Skill folders follow the Agent Skills standard. | All 28 direct `skills/*/` directories contain `SKILL.md`; each parsed frontmatter `name` matches its parent directory, including `_shared`. | None. |
| CAVEAT | Commands | The manifest-level `commands` component path is documented, and Agent Plugins are documented as providing slash commands. The exact public VS Code docs for the Markdown command wrapper shape are thinner than the docs for agents and skills. The current files are plausible and conservative because they are thin wrappers routed to `sdd-orchestrator`. | `.plugin/plugin.json` has `commands: "commands/"`. Each `commands/*.md` has frontmatter `name`, `description`, and `agent: sdd-orchestrator`, and the body explicitly avoids direct phase-agent invocation. | Manually verify in VS Code that `/sdd-new`, `/sdd-lite`, `/sdd-continue`, `/sdd-apply`, `/sdd-verify`, and `/sdd-archive` appear and route to `sdd-orchestrator`. If a future public command-file schema differs, update these wrappers to that schema. |
| CAVEAT | `rules/` vs `.github/instructions/` | Keeping `rules/` is acceptable as a VS Code plugin-wizard-generated, plugin-bundled instruction location, but it is not as clearly described in the public custom-instructions docs as `.github/instructions/`. `.github/instructions/` should be framed as a workspace mirror/location, not required plugin runtime. | `rules/*.instructions.md` exists. `.github/instructions/*.instructions.md` is absent. `docs/plugin-installation.md` already says `rules/` contains plugin-bundled instruction files generated by the VS Code plugin creation flow and `.github/instructions/` is only a workspace mirror. | Keep `rules/` and keep docs explicit about its wizard-generated plugin role. If `.github/instructions/` is added, treat it as a workspace mirror and keep mirrored files synchronized. Manually verify whether installed VS Code loads `rules/` instructions from the plugin. |
| OK | Hooks | Hook declaration uses supported lifecycle events and plugin-root path token correctly. | `hooks.json` declares `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, and `PreCompact`; JSON parse confirmed each event is in the documented supported set and every command uses `${PLUGIN_ROOT}/scripts/hooks/...`. | None. Manual VS Code verification should confirm hooks actually fire and `${PLUGIN_ROOT}` expands in the target VS Code build. |
| OK | Hook scripts | Hook scripts are deterministic local PowerShell automation, not extension UI/API code. They are fail-safe when hook input schema is unknown. | `scripts/hooks/persist-session-state.ps1`, `scripts/hooks/validate-tool-use.ps1`, and `scripts/hooks/validate-openspec-artifacts.ps1` read JSON/stdin, inspect paths/state, and exit with JSON/no-op behavior. | None. Keep trust documentation prominent because hooks execute local code. |
| OK | MCP config | MCP is declared in the manifest and `.mcp.json` has the documented top-level shape. | `.plugin/plugin.json` has `mcpServers: ".mcp.json"`. `.mcp.json` has top-level `mcpServers` and server `io.github.upstash/context7`. | None. Manual VS Code verification should confirm the server appears, `npx` is available, and `CONTEXT7_API_KEY` is requested through the VS Code input flow. |
| OK | Installation docs | Installation docs correctly present this as an Agent Plugin, not an extension or VSIX workflow, and include preview/trust/policy warnings. | `docs/plugin-installation.md` says this is not a VS Code extension workflow, mentions Agent Plugins preview, trust review for hooks/MCP, `chat.pluginLocations`, and organization policy limitations. | None. |
| OK | Validation checklist | The validation checklist is materially aligned with current official manifest fields and hook events. | `docs/refactor/plugin-validation-checklist.md` checks `.plugin/plugin.json`, manifest paths, agent frontmatter, one user-facing orchestrator, skills, MCP, supported hook events, command wrappers, mirrors, and extension-migration hazards. | None. Consider adding the current `/agent-skills` URL if the checklist later grows a references section. |
| CAVEAT | Runtime/plugin UI proof | File inspection cannot prove VS Code preview feature availability, marketplace/source install behavior, org policy, trust prompts, command discovery, skill matching, hook firing, MCP startup, or plugin-bundled `rules/` loading. | This verification ran static JSON/frontmatter/path checks and live documentation consultation only. | Run the manual VS Code verification checklist below in a VS Code build with Agent Plugins preview enabled. |

## Manual VS Code Verification Required

These items cannot be proven from repository files alone:

1. The repository appears in the Agent Plugins view when installed from source or added via `chat.pluginLocations`.
2. `sdd-orchestrator` appears in the chat agent picker, while phase agents do not appear as direct user-facing agents.
3. The orchestrator can invoke the phase agents as subagents under the current VS Code subagent settings and policy.
4. `/sdd-new`, `/sdd-lite`, `/sdd-continue`, `/sdd-apply`, `/sdd-verify`, and `/sdd-archive` appear as slash commands and route to `sdd-orchestrator`.
5. Agent Skills are discovered from `skills/` and load when triggered.
6. Hooks fire for `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, and `PreCompact`; each hook receives structured input, and `${PLUGIN_ROOT}` resolves to the plugin root.
7. The Context7 MCP server appears in the MCP server list, starts through `npx`, and requests `CONTEXT7_API_KEY` through a trusted VS Code input path.
8. Plugin-bundled `rules/` instructions are actually loaded by the installed plugin. If not, use `.github/instructions/` only as a workspace mirror or follow the latest VS Code wizard output.
9. Organization policy and trust prompts permit Agent Plugins, hooks, MCP, and custom-agent/subagent behavior.

## Rules Directory Answer

Keeping `rules/` is acceptable for this repository because it was generated by the VS Code plugin creation flow and is documented locally as the plugin-bundled instruction location. The public custom-instructions page clearly documents `.github/instructions/` as a workspace instruction location, but it does not make `.github/instructions/` a required plugin runtime directory.

Therefore, frame the two directories this way:

| Directory | Correct framing |
| --- | --- |
| `rules/` | Plugin-bundled instruction files generated by the VS Code Agent Plugin wizard. Keep this as the plugin-owned instruction source unless a newer VS Code wizard/schema changes it. |
| `.github/instructions/` | Optional workspace mirror/location for repository-level custom instructions. It is useful for normal workspace Copilot behavior but should not be described as required for plugin runtime. If it exists, keep it synchronized with `rules/` or document intentional differences. |

## Recommended Follow-up Fixes

No repository changes are mandatory from this verification. Recommended follow-ups are operational/documentation hardening:

1. Run the manual VS Code verification checklist in a build with Agent Plugins preview enabled.
2. Update any future references from the stale `https://code.visualstudio.com/docs/agent-customization/skills` URL to the current `https://code.visualstudio.com/docs/agent-customization/agent-skills` URL.
3. If command discovery fails in manual VS Code testing, revise `commands/*.md` to the current command-file schema published or generated by the active VS Code plugin tooling.
4. If plugin-bundled instruction loading from `rules/` fails in manual VS Code testing, preserve `rules/` as wizard output but add or synchronize `.github/instructions/` as the workspace-facing mirror.

## Verification Evidence

| Check | Result |
| --- | --- |
| Official docs consulted live/current | Passed. HTTP 200 responses were received for Agent Plugins, Custom Agents, current Agent Skills, Custom Instructions, Agent Hooks, and GitHub `plugin.json` reference. The originally supplied `/agent-customization/skills` URL returned 404 and was replaced with current `/agent-customization/agent-skills`. |
| Manifest JSON parse | Passed. `.plugin/plugin.json` parsed and component paths resolved. |
| Hook/MCP JSON parse | Passed. `hooks.json` and `.mcp.json` parsed. Hook events are supported; MCP has top-level `mcpServers`. |
| Agent topology | Passed. Exactly one `user-invocable: true` SDD agent, `sdd-orchestrator`; all phase agents hidden. |
| Skill directory/name check | Passed. Every direct skill directory has `SKILL.md`; every frontmatter `name` matches its directory. |
| Extension migration scan | Passed with documentation-only matches. No `package.json`; no runtime VS Code extension API files found. |
| Runtime behavior | Not proven from files. Requires manual VS Code verification. |

Final alignment classification: Aligned with caveats.