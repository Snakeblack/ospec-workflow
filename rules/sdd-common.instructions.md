---
description: 'Shared SDD protocol for Copilot orchestrator and phase agents.'
applyTo: '**'
---

# SDD Common Protocol

Use this file as a compact shared protocol. The detailed source contracts remain in `agents.md`, `AGENTS.md`, `skills/sdd-*/SKILL.md`, and `skills/_shared/*.md`.

## Boundaries

- `sdd-orchestrator` coordinates phases and may invoke allowlisted phase agents.
- Internal phase agents are executors. They do their assigned phase work themselves and do not launch subagents.
- Phase agents must not call recursive or nested subagent orchestration unless the orchestrator explicitly owns that step.
- Do not create or modify Copilot workspace folders as part of this bundle.

## Empty Project Foundation

- If `openspec/config.yaml` exists but says `project.status: empty`, stack arrays are empty, or architecture is `none-detected`, route new-project work through `sdd-foundation` before normal SDD changes.
- `sdd-foundation` may write foundation docs and update `openspec/config.yaml`; it must not create application code or scaffolds.
- When `sdd-foundation` returns `blocked` with `next_question`, surface that single question and stop.

## Skill loading compatibility

1. Prefer an injected `## Project Standards (auto-resolved)` block when the orchestrator can extract compact rules.
2. If the registry is index-only, pass exact `SKILL.md` paths under `## Skills to load before work`.
3. If neither exists, continue with phase rules and report `skill_resolution: none`.
4. Phase agents must report `skill_resolution` in their result envelope.
5. Communication skills affect assistant replies, not persisted SDD artifacts. Task-specific variants apply only to their output type. File-transform skills require explicit user invocation.

## Review workload guard

Protect reviewer cognitive load with a 400 changed-line default budget. `sdd-tasks` must include these exact lines near the top of `tasks.md`:

```text
Decision needed before apply: Yes|No
Chained PRs recommended: Yes|No
Chain strategy: stacked-to-main|feature-branch-chain|size-exception|pending
400-line budget risk: Low|Medium|High
```

`sdd-apply` must not start oversized work unless the orchestrator provides a resolved delivery path: chained/stacked slice or accepted `size:exception`.

## Return envelope

Every phase returns:

- `status`: `success`, `partial`, or `blocked`
- `executive_summary`: 1-3 sentences
- `artifacts`: paths written or `inline`
- `next_recommended`: next phase or `none`
- `risks`: discovered risks or `None`
- `skill_resolution`: `injected`, `fallback-registry`, `fallback-path`, or `none`

`sdd-foundation` may also return `open_questions` and one `next_question` when blocked.
