# SDD Methodology

Spec-Driven Development (SDD) is the discipline layer this plugin puts in front of implementation. The idea is simple: before touching code, the team agrees on the expected behavior, the technical approach, the tasks, and how to verify it.

This is not about going slower. It is about not building blind. Immediacy without a contract looks like productivity for ten minutes and becomes technical debt for months. That is where you have to get serious.

## Problem it solves

When AI is used without structure, the same failures keep showing up:

| Failure | Consequence |
| --- | --- |
| Implementation starts before understanding the domain. | The code solves an invented version of the problem. |
| Context lives only in the conversation. | It is lost to compaction, new sessions, or agent switches. |
| There are no testable specs. | Verification becomes "looks like it works". |
| Changes are enormous. | Review becomes expensive, slow, and superficial. |
| Tests are written at the end or are smoke. | They give false confidence and protect no real behavior. |

SDD attacks these points with persisted artifacts, separated phases, and explicit gates.

## Roles

| Role | Responsibility |
| --- | --- |
| Human | Decides the goal, validates tradeoffs, and accepts risk. AI does not lead the product. |
| `sdd-orchestrator` | Coordinates phases, applies guards, and delegates to specialized agents. |
| Phase agents | Execute one specific phase of the cycle (init, foundation, workspace, explore, propose, spec, clarify, design, tasks, apply, verify, archive, baseline, or onboard). |
| OpenSpec | Stores the shareable state: config, active changes, main specs, and archive. |
| Skills | Inject compact rules based on context: PRs, testing, commits, documentation, etc. |

The separation matters. An orchestrator that implements fills up with context and loses control. An executor that orchestrates breaks the flow. Each piece does its job.

## Principles

| Principle | Practical translation |
| --- | --- |
| Contract before code | First proposal, specs, and design; then implementation. |
| Evidence before opinion | Verify requires real tests, commands, and a compliance matrix. |
| Persistence before memory | Important state lives in `openspec/`, not only in chat. |
| Small reviews | 400 changed lines is the base review budget. |
| TDD when there is a runner | If Strict TDD is active, work follows RED/GREEN/TRIANGULATE/REFACTOR. |
| One agent, one responsibility | The orchestrator coordinates; executors execute. |

## Source of truth

There are three levels of truth:

| Level | Where it lives | What it represents |
| --- | --- | --- |
| Project context | `openspec/config.yaml` | Stack, commands, testing, Strict TDD, and rules. |
| Active change | `openspec/changes/{change-name}/` | Proposal, delta specs, design, tasks, progress, and verification. |
| Current behavior | `openspec/specs/{domain}/spec.md` | Main specs after archiving verified changes. |

The difference between an active change and a main spec is KEY. The active change says "this is what we want to modify". The main spec says "this is how the system works now".

## When to use SDD

Use SDD for:

- Features with observable behavior.
- APIs, UI flows, business rules, or integrations.
- Refactors with broad risk or impact.
- Changes that need agreement before implementation.
- AI-driven work where you want traceability and rollback.

Full SDD is not needed for:

- Typos.
- Very small mechanical changes.
- Trivial documentation adjustments.
- Disposable experiments.

For that intermediate space between "a typo" and "a normal change" there is `/sdd-lite`: it uses `proposal-lite.md -> tasks.md -> apply -> verify` for `trivial` or `small` changes without opening full specs/design. If the work stops being small along the way, it escalates to the standard flow.

The healthy rule: if someone would have to review the "what", the "why", or the "how", use SDD. If the change is bounded but you still want traceability and gates, use lite. If it is just fixing a typo, don't build a cathedral.
