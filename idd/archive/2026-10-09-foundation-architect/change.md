# foundation-architect

## Intent and acceptance

Rename sdd-foundation to foundation as a mode-independent capability that discovers like an architect (drivers, quality scenarios, constraints, architecture ADRs, technology record) and hands IDD its ADRs and idd/config.yaml, fixing its executor-boundary, capability and language contradictions

Acceptance: foundation ships in every install and runs directly (asking rounds of at most four questions) or delegated by the SDD orchestrator (returning a question_gate); sdd-foundation stays accepted as a legacy route phase; it writes architecture ADRs under docs/architecture/decisions and proposes idd/config.yaml checks, strict_tdd and impact paths for approval; the router sends new projects to it; specs, tests, models, docs and context ceilings follow

## Plan

1. **Rename and packaging.** `sdd-foundation` becomes `foundation` (skill, agent, route phase, model tables, rosters of `model-resolver` and the `i1-manifest` checker, orchestrator, rules, `_shared`, specs, docs, eval fixtures). The skill leaves the SDD package and ships in every install; `agents/foundation.agent.md` stays in it as the orchestrator's delegate (`isSddPackagePath`). The dispatcher reads a legacy `sdd-foundation` phase as `foundation`.
2. **Architect behavior.** `skills/foundation/SKILL.md` rewritten in English: two run modes (direct asks rounds itself; delegated returns a `question_gate`), rounds of at most four questions with a recommended answer and explicit assumptions, drivers as quality scenarios without invented measures, the simplest structure that meets them, reversible decisions deferred, data ownership and failure modes named, ADRs with options, consequences, fitness function and review trigger, a test strategy by risk.
3. **Bridge to IDD.** Foundation proposes `idd/config.yaml` (`checks`, `strict_tdd`, `impact`, `contracts.documents`) and writes it only after approval; its ADRs feed IDD's `adr-amend-or-contradict` gate; the router sends a project with no code to `{{foundation-entry}}`.
4. **Contradictions removed.** The executor no longer calls the host question tool, the skill declares `mcp: true` as REQ-skills-001 requires, no MCP server is installed by the agent, and the shared and project rules stop demanding one question at a time.

## Decisions

- **Mode-independent skill, SDD-only agent.** The user asked for the plain name; roadmap E2.3 asks for a mode-independent foundation. The agent pulls `sdd-phase-common.md` (37.7 KB of reads) and only the SDD orchestrator launches it, so it stays in the SDD package: a default install pays one skill (+244 B of listing) and the router line (+162–177 B always-on), not an idle agent.
- **Legacy phase alias in the dispatcher.** Existing `openspec/config.yaml` tables and persisted routes name `sdd-foundation`; refusing them would break projects on update. The alias is one map entry, normalized at parse time, and only for this phase.
- **Rounds instead of one question at a time.** Nine linear questions cost nine round trips; the roadmap's discovery cycle groups at most four per round, and `question_gate.questions` is already an array, so no runtime change is needed.
- **No automatic MCP setup.** A phase with `execute: false` cannot install a server, and silently registering one is a supply-chain risk; the user pastes, converts or skips the document instead.
- **Not done here (roadmap E2.1, E2.2, E2.4, E3.1):** the knowledge map as a machine contract, the deterministic `ospec foundation next` engine, the ADR lint and the active `adr-impact-declaration` obligation.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-09T13:06:03.288Z)
- ev-2: living-doc-current for living-doc (2026-10-09T13:06:03.448Z)
<!-- ospec:evidence:end -->
