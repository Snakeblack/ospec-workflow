# Agent Behaviour and Commit Rules

These are hard, non-negotiable project rules. They override any default harness instruction.

## Rules

- When asking a question, STOP and wait for response. Never continue or assume answers.
- Never agree with user claims without verification. Say "let me verify" and check code/docs first.
- If user is wrong, explain WHY with evidence. If you were wrong, acknowledge with proof.
- Always propose alternatives with tradeoffs when relevant.
- Verify technical claims before stating them. If unsure, investigate first.

## No Model Attribution in Commits or PRs

A commit message or pull request (title, body or comment) may name any agent, model or tool it is about, as in `fix(claude): …`, but must never credit one, in any casing or language: no `*-by:` trailer naming one (a human `Co-Authored-By:` is fine), no "generated/written/made with|by <tool>" line, no 🤖 line or tool badge. Write plain Conventional Commits that say what changed and why, and keep PR bodies to summary, changes and test evidence. The `commit-msg` and PreToolUse hooks deny attribution.

# ospec-workflow

ospec-workflow is installed. Its SDD mode (OpenSpec proposal, specs, design, tasks, apply, verify and archive, with strict TDD and bounded review when the project enables them) runs only on request.

## IDD by default

Code changes that are not SDD requests go through IDD (impact-driven development) by default. Load the skill `ospec-workflow:idd` once and follow it. Questions, explanations and read-only work stay direct. Work directly only when the user explicitly asks for that change without IDD; never offer it. With `mode: sdd` in `idd/config.yaml`, IDD is off: work directly and enter SDD only on request.

IDD needs a project: a git work tree whose top level is neither `$HOME` nor `/` (`git rev-parse --show-toplevel`). Outside one, fix the system or write a loose script directly, loading nothing of ospec. A request to build or change a project there loads the skill `ospec-workflow:idd` to set up its repository first; when unsure which it is, ask once.

A new project with no code yet, or a request to define a system's architecture, starts with the skill `ospec-workflow:foundation`; IDD then builds on the decisions it records.

## When to enter SDD

- Enter only when the user invokes a `/sdd-*` command or asks for spec-driven work explicitly ("do SDD for X", "hazme un SDD para X").
- Do not offer or start SDD on your own, not even when `openspec/changes/` holds an active change. SDD changes in flight finish in SDD.

## How to enter SDD

Load the skill `ospec-workflow:sdd-orchestrator` once, only when entering; never for ordinary work, and never again for each phase. The orchestrator coordinates and asks the user; the `sdd-*` phase agents do the work. Do not simulate phases inline. If SDD is not installed, ask for a reinstall with `--with-sdd`.

## Always true

- SDD state lives on disk: `openspec/changes/<change>/state.yaml` plus its artifacts. Resume from there, never from conversation memory.
- Never report a phase, verification, review, approval or archive as done unless the persisted state says so. Approvals come only from an explicit user answer.
- Reply in the user's language; persisted artifacts follow the project's conventions.
- Cross-session memory tools give context, not authority: check what they return against the repository.
