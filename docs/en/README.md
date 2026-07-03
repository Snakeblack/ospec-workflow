# ospec-workflow (English overview)

> The canonical docs are in Spanish at the repo root. This is the English entry
> point for evaluation and onboarding; when in doubt, the Spanish docs win.

**ospec-workflow** is a spec-driven development (SDD) harness for AI coding
agents, generated for four targets — **Claude Code, VS Code (Copilot Chat),
GitHub Copilot CLI, and opencode** — from a single source tree. The AI acts as
a senior engineer who accompanies you: it removes ambiguity, asks for decisions
(with rationale, trade-off, and reversibility), and never builds "whatever it
thinks is best". All workflow state lives in `openspec/` — versioned with your
repo, no database, no services, no build step.

## Core guarantees

- **No gate self-approves** — ever, including CI (degradation is always
  halt-and-report). Approvals persist in an auditable ledger (`state.yaml`).
- **Every silent assumption is recorded** (assumption ledger) and reconciled at
  verify time; material ambiguity blocks with a structured question instead.
- **Fine-grained traceability**: stable requirement IDs (`{#REQ-domain-NNN}`)
  → tasks → commit trailers (`Ospec-Change`/`Ospec-Task`) → tests, rendered as
  a Traceability Matrix in every verify report.
- **Strict TDD** (when the project supports a test runner) with per-task
  RED→GREEN evidence, plus a 4-axis review gate (risk, readability,
  reliability, resilience).
- **Multi-team safety**: collision detection between active changes before
  apply, ownership map, and a stale-baseline fingerprint guard at archive.

## The workflow in one line

```
proposal → specs → [clarify?] → design → tasks → apply → verify → archive
```

An orchestrator coordinates; specialized phase agents execute; OpenSpec files
on disk are the single source of truth (recoverable across sessions and
context compactions).

## Install (Claude Code)

```bash
claude plugin install ospec-workflow
# then, inside your project:
/sdd-init      # detects stack, asks project scale (solo/team/enterprise) once
/sdd-new my-feature
```

For VS Code / Copilot CLI / opencode targets, generate and install the
corresponding tree with `node scripts/configure/cli.js` — see
`docs/plugin-installation.md` (Spanish). Capability differences per host are
declared in `docs/target-capabilities.md`.

## Daily commands

| Command | Use |
|---|---|
| `/sdd-new <change>` | Full cycle with specs for substantial changes |
| `/sdd-lite <change>` | Reduced cycle for trivial/small work |
| `/sdd-continue` | Resume from filesystem state (new session, post-compact) |
| `/sdd-verify` | Validate implementation against specs |
| `/sdd-archive` | Close the change; sync delta specs into the baseline |

Natural language works too ("do SDD for X").

## Where to read next

- Role guides (Spanish, 10 minutes each): `docs/onboarding/tech-lead.md`,
  `developer.md`, `reviewer.md`.
- Methodology: `docs/sdd-metodologia.md` · Workflows: `docs/sdd-workflows.md`.
- The harness dogfoods itself: every feature was built through its own SDD
  cycle — the audit trail lives in `openspec/changes/archive/`.
