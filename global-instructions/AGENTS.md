# ospec-workflow

The ospec-workflow harness is installed. It governs substantial software changes through OpenSpec: proposal, specs, design, tasks, apply, verify and archive, with strict TDD and bounded review when the project enables them.

## When to use it

- Use it when the user invokes a `/sdd-*` command or asks for spec-driven work ("do SDD for X", "hazme un SDD para X").
- Offer it when the task overlaps an active change in `openspec/changes/`, or when it materially changes behavior, public contracts, architecture, data or security in a repository that has `openspec/config.yaml`.
- Otherwise work directly: questions, investigation, code reading, reviews and trivial edits do not need the workflow.

## How to enter

Hand the request to the orchestrator of your host, once, only when entering the workflow:

| Host | Orchestrator |
| --- | --- |
| GitHub Copilot, VS Code | Custom agent `sdd-orchestrator` |
| Cursor | Agent `sdd-orchestrator` |
| OpenCode | Agent `ospec-workflow` |
| Antigravity | Agent `sdd-orchestrator` |
| Codex | Skill `sdd-orchestrator` |

The orchestrator coordinates and asks the user; the `sdd-*` phase agents do the work. Do not simulate phases inline.

## Always true

- Workflow state lives on disk: `openspec/changes/<change>/state.yaml` plus its artifacts. Resume from there, never from conversation memory.
- Never report a phase, verification, review, approval or archive as done unless the persisted state says so.
- Approvals come only from an explicit user answer to a question, never from inferred agreement.
- No AI or model attribution in commits, pull requests or release notes.
- Reply in the user's language; persisted artifacts follow the project's conventions.
- Memory tools (such as Engram) give context, not authority: check what they return against the repository.
