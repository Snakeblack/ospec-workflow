# Agent Plugin Shape Audit

Audit date: 2026-06-02

This is an Agent Plugin refactor audit, not a VS Code extension refactor. The repository should remain a declarative VS Code Agent Customization / Agent Plugin package made of a plugin manifest, custom agents, skills, instruction files, MCP configuration, and documentation. Do not convert it into an extension architecture.

## 1. Current Structure Map

| Path | Classification | Notes |
| --- | --- | --- |
| `.plugin/plugin.json` | plugin manifest | Current plugin entrypoint. It declares `ospec-workflow`, version `1.0.0`, and points to `agents/` and `skills/`. Treat as authoritative unless a later task explicitly requires root `plugin.json` migration. |
| `.mcp.json` | MCP configuration | Defines one Context7 stdio MCP server via `npx @upstash/context7-mcp@1.0.31` and `CONTEXT7_API_KEY` input. Retain for external documentation/API context. |
| `agents/` | custom agent directory | Contains the orchestrator plus SDD phase/custom agents. |
| `skills/` | agent skill directory | Contains SDD executor skills, shared support material, and reusable workflow/communication/testing skills. |
| `rules/` | instruction files | Contains Copilot instruction files for SDD common protocol, OpenSpec persistence, and Strict TDD evidence. |
| `docs/` | documentation only | Spanish documentation for SDD methodology, OpenSpec, workflows, phases, TDD/review, plus this audit area. |
| `README.md` | documentation only | Repository overview and usage map. It references `.atl/skill-registry.md`, which is absent in the audited tree. |
| `llm-refactor-instruction.md` | documentation only / prompt file candidate | Roadmap and task instructions for an LLM executor. It is not an Agent Plugin prompt file today because it is not under a prompt/slash-command location and has no prompt-file frontmatter. |
| `.atl/skill-registry.md` | missing / unknown | README and SDD protocols expect it, but it does not exist. This is not fatal for the audit; it means project-specific compact rules are unavailable. |

No `*.prompt.md` files were found. No hook configuration files were found. No extension implementation files or extension contribution manifests were found in the repository structure.

## 2. Valid Agent Plugin Assets

### Plugin Manifest

| Asset | Classification | Validity |
| --- | --- | --- |
| `.plugin/plugin.json` | plugin manifest | Valid Agent Plugin entrypoint for the current repository layout. It is minimal but correctly points at `agents/` and `skills/`. |

### Custom Agents

Every existing agent is classified below.

| Agent file | Classification | Invocation role | Notes |
| --- | --- | --- | --- |
| `agents/sdd-orchestrator.agent.md` | custom agent | user-invocable orchestrator | Coordinates SDD workflow and allowlisted phase agents. This should remain the primary user entrypoint. |
| `agents/sdd-init.agent.md` | custom agent | internal phase executor | Initializes OpenSpec, testing context, and skill registry. Not user-invocable. |
| `agents/sdd-foundation.agent.md` | custom agent | internal phase executor | Builds foundation docs/config for empty projects. Not user-invocable. |
| `agents/sdd-explore.agent.md` | custom agent | internal phase executor | Explores code/options/risks. Not user-invocable. |
| `agents/sdd-propose.agent.md` | custom agent | internal phase executor | Writes proposal or lite proposal artifacts. Not user-invocable. |
| `agents/sdd-spec.agent.md` | custom agent | internal phase executor | Writes change-local OpenSpec specs. Not user-invocable. |
| `agents/sdd-design.agent.md` | custom agent | internal phase executor | Writes technical design artifacts. Not user-invocable. |
| `agents/sdd-tasks.agent.md` | custom agent | internal phase executor with handoff | Writes tasks and review workload forecast. Not user-invocable. |
| `agents/sdd-apply.agent.md` | custom agent | internal phase executor | Implements planned tasks and persists apply progress. Not user-invocable. |
| `agents/sdd-verify.agent.md` | custom agent | internal phase executor | Verifies implementation with tests/evidence and writes verify report. Not user-invocable. |
| `agents/sdd-archive.agent.md` | custom agent | internal phase executor | Archives verified changes and syncs specs. Not user-invocable. |
| `agents/sdd-onboard.agent.md` | custom agent | internal guided workflow agent | Teaches a real SDD cycle. Not user-invocable in frontmatter, though its skill says it may run inline through the orchestrator. |

### Agent Skills

Every existing skill is classified below.

| Skill file | Classification | Invocation role | Notes |
| --- | --- | --- | --- |
| `skills/_shared/SKILL.md` | agent skill support package | not invokable | Shared SDD reference package. Valid as a non-user-invocable support skill. |
| `skills/sdd-init/SKILL.md` | agent skill | delegate-only SDD phase skill | Runtime contract for `sdd-init`. |
| `skills/sdd-foundation/SKILL.md` | agent skill | delegate-only SDD phase skill | Runtime contract for `sdd-foundation`. |
| `skills/sdd-explore/SKILL.md` | agent skill | delegate-only SDD phase skill | Runtime contract for `sdd-explore`. |
| `skills/sdd-propose/SKILL.md` | agent skill | delegate-only SDD phase skill | Runtime contract for `sdd-propose`. |
| `skills/sdd-spec/SKILL.md` | agent skill | delegate-only SDD phase skill | Runtime contract for `sdd-spec`. |
| `skills/sdd-design/SKILL.md` | agent skill | delegate-only SDD phase skill | Runtime contract for `sdd-design`. |
| `skills/sdd-tasks/SKILL.md` | agent skill | delegate-only SDD phase skill | Runtime contract for `sdd-tasks`. |
| `skills/sdd-apply/SKILL.md` | agent skill | delegate-only SDD phase skill | Runtime contract for `sdd-apply`. |
| `skills/sdd-verify/SKILL.md` | agent skill | delegate-only SDD phase skill | Runtime contract for `sdd-verify`. |
| `skills/sdd-archive/SKILL.md` | agent skill | delegate-only SDD phase skill | Runtime contract for `sdd-archive`. |
| `skills/sdd-onboard/SKILL.md` | agent skill | orchestrator/interactive SDD workflow skill | Skill body says it is intended to run inline through the orchestrator rather than as a delegated subagent. Valid, but topology should be documented carefully. |
| `skills/branch-pr/SKILL.md` | agent skill | reusable workflow skill | PR creation/branch workflow rules. |
| `skills/chained-pr/SKILL.md` | agent skill | reusable workflow skill | Review-budget and stacked/chained PR rules. |
| `skills/work-unit-commits/SKILL.md` | agent skill | reusable workflow skill | Commit and PR slicing rules. |
| `skills/issue-creation/SKILL.md` | agent skill | reusable workflow skill | GitHub issue creation and issue-first checks. |
| `skills/judgment-day/SKILL.md` | agent skill | reusable review workflow skill | Dual/adversarial review workflow. It delegates in its own workflow, so it depends on skill registry availability. |
| `skills/go-testing/SKILL.md` | agent skill | reusable testing skill | Go testing guidance. |
| `skills/context7-mcp/SKILL.md` | agent skill | MCP-backed documentation skill | Uses Context7 MCP for current library/framework documentation. Supports retaining `.mcp.json`. |
| `skills/cognitive-doc-design/SKILL.md` | agent skill | reusable documentation skill | Documentation design and review-facing writing guidance. |
| `skills/comment-writer/SKILL.md` | agent skill | reusable communication skill | Human-facing comments/review replies. |
| `skills/skill-creator/SKILL.md` | agent skill | skill authoring skill | Creates LLM-first skills and references style guidance. |
| `skills/skill-registry/SKILL.md` | agent skill | registry maintenance skill | Creates `.atl/skill-registry.md`; the registry is missing now. |
| `skills/caveman/SKILL.md` | agent skill / slash command candidate | communication style skill | Trigger text includes `/caveman`. It is a skill today, not a prompt file. |
| `skills/caveman-commit/SKILL.md` | agent skill / slash command candidate | commit-message skill | Trigger text includes `/commit` and `/caveman-commit`. It is a skill today, not a prompt file. |
| `skills/caveman-compress/SKILL.md` | agent skill / slash command candidate | explicit file-transform skill | Trigger text includes `/caveman:compress`. It has local scripts and security docs. |
| `skills/caveman-help/SKILL.md` | agent skill / slash command candidate | help skill | Trigger text includes `/caveman-help`. It is a skill today, not a prompt file. |
| `skills/caveman-review/SKILL.md` | agent skill / slash command candidate | terse review skill | Trigger text includes `/review` and `/caveman-review`. It is a skill today, not a prompt file. |

### Instruction Files

| Asset | Classification | Notes |
| --- | --- | --- |
| `rules/sdd-common.instructions.md` | instruction file | Shared SDD protocol for orchestrator and phase agents. Valid Agent Customization instruction artifact. |
| `rules/sdd-openspec.instructions.md` | instruction file | OpenSpec persistence and artifact path rules. Valid Agent Customization instruction artifact. |
| `rules/sdd-strict-tdd.instructions.md` | instruction file | Strict TDD forwarding/evidence protocol. Valid Agent Customization instruction artifact. |

### MCP Configuration

| Asset | Classification | Decision | Rationale |
| --- | --- | --- | --- |
| `.mcp.json` | MCP configuration | retain | The `context7-mcp` skill explicitly depends on current library/framework documentation lookup. Keeping MCP avoids converting documentation lookup into local plugin logic and fits Agent Plugin customization. |

### Prompt File / Slash Command Candidates

| Asset or command family | Classification | Notes |
| --- | --- | --- |
| `/sdd-init`, `/sdd-foundation`, `/sdd-explore`, `/sdd-apply`, `/sdd-verify`, `/sdd-archive`, `/sdd-onboard` | slash command candidates | Documented in `README.md` and orchestrator instructions. They are currently represented through agent/skill behavior, not prompt files. |
| `/sdd-new`, `/sdd-continue`, `/sdd-ff`, `/sdd-lite` | slash command candidates | Meta-commands handled by `sdd-orchestrator`; not prompt files today. |
| `/caveman`, `/commit`, `/caveman-commit`, `/caveman:compress`, `/caveman-help`, `/review`, `/caveman-review` | slash command candidates | Triggered by skill descriptions. Keep as skills unless a later ergonomics task extracts prompt files. |
| `llm-refactor-instruction.md` | prompt file candidate | Could later be split into task prompts, but currently should be treated as documentation/instruction roadmap only. |

### Hook Candidates

No existing hook artifacts were found. Potential future hook use should be limited to deterministic lifecycle automation only, after agents/skills/manifest normalization. No current file should be reclassified as a hook without a dedicated hooks task.

### Documentation Only

| Path | Classification | Notes |
| --- | --- | --- |
| `README.md` | documentation only | User-facing overview and command map. |
| `docs/README.md` | documentation only | Documentation index. |
| `docs/openspec.md` | documentation only | OpenSpec explanation. |
| `docs/sdd-fases.md` | documentation only | Phase documentation. |
| `docs/sdd-metodologia.md` | documentation only | Methodology documentation. |
| `docs/sdd-workflows.md` | documentation only | Workflow documentation. |
| `docs/tdd-y-revision.md` | documentation only | TDD and review documentation. |
| `llm-refactor-instruction.md` | documentation only / prompt file candidate | Roadmap for future tasks. |
| `skills/*/references/*.md` | skill support documentation | Supporting references for skills; not standalone Agent Plugin assets. |
| `skills/_shared/*.md` | skill support documentation | Shared protocol/reference files consumed by SDD skills. |
| `skills/caveman-compress/README.md` | skill support documentation | Human-readable docs for the compression skill. |
| `skills/caveman-compress/SECURITY.md` | skill support documentation | Security explanation for the compression skill. |

## 3. Assets That Need Relocation Or Normalization

| Asset | Current classification | Recommendation | Rationale |
| --- | --- | --- | --- |
| `.plugin/plugin.json` | plugin manifest | Normalize metadata in a later task, but keep `.plugin/plugin.json` as the entrypoint. | Manifest is minimal and lacks author/MCP references, but it is already the correct plugin-shaped entrypoint. No root migration is required by this audit. |
| `.atl/skill-registry.md` | missing / unknown | Recreate via `skills/skill-registry/SKILL.md` or `sdd-init` in a later task. | Orchestrator and SDD protocols expect compact rules from this registry. Missing registry means subagents run without project-specific compact standards. |
| `llm-refactor-instruction.md` | documentation only / prompt file candidate | Consider moving into `docs/refactor/` or splitting into dedicated prompt files in a later prompt-extraction task. | It is a root-level LLM roadmap, not an active plugin asset. Keeping it at root can blur source assets versus planning instructions. |
| Slash-command-like skill triggers | agent skill / slash command candidate | Keep as skills for now; consider prompt files only if UX requires visible command entrypoints. | No prompt files exist today. Extracting prompts before topology/skill normalization would create duplicate entrypoints. |
| `skills/sdd-onboard/SKILL.md` and `agents/sdd-onboard.agent.md` | agent skill + custom agent | Clarify topology in a later agent-hardening task. | The agent frontmatter marks `sdd-onboard` as not user-invocable, while the skill says it is designed to run inline by the orchestrator. This is valid but easy to misread. |
| `README.md` reference to `.atl/skill-registry.md` | documentation only | Update only after registry strategy is resolved. | README lists an expected registry file that is absent. |

## 4. Assets That Must Stay Unchanged

| Asset | Reason to keep unchanged in this task |
| --- | --- |
| `.plugin/plugin.json` | It is the declared Agent Plugin entrypoint, and this audit task is read-only except for writing the audit. |
| `.mcp.json` | It is valid MCP configuration and supports the Context7 skill. No removal is justified. |
| `agents/*.agent.md` | All agents are valid custom-agent artifacts. Topology changes belong to a later hardening task. |
| `skills/**/SKILL.md` | All `SKILL.md` files are valid agent skill artifacts or support packages. Normalization belongs to a later skill task. |
| `rules/*.instructions.md` | Valid instruction files. Rule normalization belongs to a later instruction-file task. |
| `README.md` and existing `docs/*.md` | Documentation should not be edited in this audit task. |
| `skills/**/references/*.md`, `skills/_shared/*.md`, `skills/caveman-compress/scripts/**` | Supporting skill assets. They are not misplaced and should stay attached to their skills. |

## 5. Risks And Unknowns

| Risk / unknown | Impact | Suggested follow-up |
| --- | --- | --- |
| `.atl/skill-registry.md` is missing. | Orchestrator cannot inject compact project rules; phase agents may report `skill_resolution: none`. | Run the registry generation workflow in a later task after deciding whether the registry belongs in the distributable plugin or in consuming projects. |
| Manifest is minimal and does not reference MCP. | VS Code Agent Plugin discovery may not know about MCP from the manifest alone, depending on loader expectations. | Normalize `.plugin/plugin.json` later to include MCP reference only if the Agent Plugin format supports that field for this layout. |
| Slash-command ergonomics are implicit. | Users may rely on README/orchestrator behavior rather than visible prompt files. | Extract prompt files later only for stable user-facing commands, without duplicating phase executor contracts. |
| Onboarding topology has mixed wording. | `sdd-onboard` can be mistaken for a normal phase subagent even though the skill says it should run inline through the orchestrator. | Clarify orchestrator/onboard instructions during agent-topology hardening. |
| `llm-refactor-instruction.md` lives at repository root. | Root planning instructions can be mistaken for active plugin assets. | Move or split later under `docs/refactor/` or prompt files if the roadmap task sequence continues. |
| MCP depends on `npx` and `CONTEXT7_API_KEY`. | Context7 features may fail in environments without Node/npm, network access, or the API key input. | Keep `.mcp.json`, but document setup and fallback behavior in installation docs. |
| No hook artifacts exist. | Lifecycle automation is absent; this is acceptable for the current shape. | Add hooks only in the dedicated hook task, after manifest/agents/skills are normalized. |

## Audit Decision

The repository is already shaped as an Agent Plugin customization package, not a VS Code extension. Keep `.plugin/plugin.json` as the plugin entrypoint, retain `.mcp.json` for Context7-backed documentation lookup, preserve all agents/skills/rules in place for this task, and treat missing `.atl/skill-registry.md` plus implicit slash-command UX as the main normalization risks.