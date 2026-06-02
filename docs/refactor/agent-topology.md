# Agent Topology

Updated: 2026-06-02

This repository is a declarative VS Code Agent Plugin / Agent Customization package. `.plugin/plugin.json` remains the plugin entrypoint. The topology is intentionally agent-and-skill based, not a VS Code extension architecture.

## User Entry Point

| Agent | User invocable | Role |
| --- | --- | --- |
| `agents/sdd-orchestrator.agent.md` | `true` | The only user-facing SDD agent. It owns workflow routing, phase ordering, workload guard decisions, skill-rule injection, and allowed subagent launches. |

The orchestrator frontmatter keeps the `agents:` allowlist for SDD phase agents:

- `sdd-init`
- `sdd-foundation`
- `sdd-explore`
- `sdd-propose`
- `sdd-spec`
- `sdd-design`
- `sdd-tasks`
- `sdd-apply`
- `sdd-verify`
- `sdd-archive`
- `sdd-onboard`

## Phase Agents

All phase agents are hidden from direct user invocation with `user-invocable: false`. They are callable only by the orchestrator as subagents.

| Agent | Boundary | Required skill | Main artifacts |
| --- | --- | --- | --- |
| `agents/sdd-init.agent.md` | Executor only; does not delegate | `skills/sdd-init/SKILL.md` | `openspec/config.yaml`, OpenSpec directories, `.atl/skill-registry.md` when appropriate |
| `agents/sdd-foundation.agent.md` | Executor only; does not delegate | `skills/sdd-foundation/SKILL.md` | Foundation docs and `openspec/config.yaml` |
| `agents/sdd-explore.agent.md` | Executor only; does not delegate | `skills/sdd-explore/SKILL.md` | `openspec/changes/{change-name}/exploration.md` when persisted |
| `agents/sdd-propose.agent.md` | Executor only; does not delegate | `skills/sdd-propose/SKILL.md` | `proposal.md` or `proposal-lite.md` |
| `agents/sdd-spec.agent.md` | Executor only; does not delegate | `skills/sdd-spec/SKILL.md` | Change-local specs under `openspec/changes/{change-name}/specs/` |
| `agents/sdd-design.agent.md` | Executor only; does not delegate | `skills/sdd-design/SKILL.md` | `design.md` |
| `agents/sdd-tasks.agent.md` | Executor only; does not delegate | `skills/sdd-tasks/SKILL.md` | `tasks.md` with review workload forecast |
| `agents/sdd-apply.agent.md` | Executor only; does not delegate | `skills/sdd-apply/SKILL.md` | Implementation changes, task status updates, `apply-progress.md` |
| `agents/sdd-verify.agent.md` | Executor only; does not delegate | `skills/sdd-verify/SKILL.md` | `verify-report.md` |
| `agents/sdd-archive.agent.md` | Executor only; does not delegate | `skills/sdd-archive/SKILL.md` | `archive-report.md`, synced specs, archived change folder |
| `agents/sdd-onboard.agent.md` | Orchestrator-launched guided workflow executor; does not delegate | `skills/sdd-onboard/SKILL.md` | Real onboarding change artifacts under `openspec/changes/{change-name}/` |

## Rule Placement

| Rule type | Owner |
| --- | --- |
| Workflow ordering and phase routing | `agents/sdd-orchestrator.agent.md` |
| Allowed subagent list | `agents/sdd-orchestrator.agent.md` frontmatter |
| Review workload guard routing before apply | `agents/sdd-orchestrator.agent.md` |
| Phase execution details | Matching `skills/sdd-*/SKILL.md` files |
| Shared persistence and return envelope conventions | `skills/_shared/sdd-phase-common.md` |
| Executor boundaries | Each phase agent body plus shared phase common rules |

## Intentional Exception: `sdd-onboard`

`sdd-onboard` is not user-invocable, but it is also not a normal single-artifact phase. It remains an orchestrator-launched guided workflow because the matching skill teaches an end-to-end SDD cycle on a real codebase. Its agent boundary explicitly prevents nested delegation; the guided workflow behavior lives in `skills/sdd-onboard/SKILL.md`.

## Validation Notes

- Exactly one SDD agent should have `user-invocable: true`: `sdd-orchestrator`.
- Phase agents should not contain orchestration decisions or instructions to launch subagents.
- Phase agents should stay thin: identity, executor boundary, required skill, required artifacts, and result contract.
- `disable-model-invocation` is intentionally absent from agent frontmatter. Phase agents use `user-invocable: false` so they are hidden from users while remaining callable by the orchestrator.