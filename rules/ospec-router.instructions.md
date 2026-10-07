---
description: 'ospec-workflow router: code changes go through IDD by default; SDD only when the user asks for it, through the host orchestrator.'
applyTo: '**'
---

# ospec-workflow

ospec-workflow is installed. Its SDD mode (OpenSpec proposal, specs, design, tasks, apply, verify and archive, with strict TDD and bounded review when the project enables them) runs only on request.

## IDD by default

Code changes that are not SDD requests go through IDD (impact-driven development) by default. Load the {{idd-entry}} once and follow it. Questions, explanations and read-only work stay direct. Work directly only when the user explicitly asks for that change without IDD; never offer it. With `mode: sdd` in `idd/config.yaml`, IDD is off: work directly and enter SDD only on request.

## When to enter SDD

- Enter only when the user invokes a `/sdd-*` command or asks for spec-driven work explicitly ("do SDD for X", "hazme un SDD para X").
- Do not offer or start SDD on your own, not even when `openspec/changes/` holds an active change. SDD changes in flight finish in SDD.

## How to enter SDD

Load the {{orchestrator-entry}} once, only when entering; never for ordinary work, and never again for each phase. The orchestrator coordinates and asks the user; the `sdd-*` phase agents do the work. Do not simulate phases inline.

## Always true

- SDD state lives on disk: `openspec/changes/<change>/state.yaml` plus its artifacts. Resume from there, never from conversation memory.
- Never report a phase, verification, review, approval or archive as done unless the persisted state says so. Approvals come only from an explicit user answer.
- Reply in the user's language; persisted artifacts follow the project's conventions.
- Cross-session memory tools give context, not authority: check what they return against the repository.
