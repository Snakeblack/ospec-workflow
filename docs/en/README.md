# ospec-workflow (English overview)

> The canonical internal docs are in Spanish under `docs/`. This is the English
> entry point for evaluation and onboarding; the root [README](../../README.md)
> has the full English guide.

**ospec-workflow** is an impact-driven development (IDD) harness for AI coding
agents, generated for seven targets — **Claude Code, VS Code (Copilot Chat),
GitHub Copilot CLI, opencode, Codex CLI, Cursor and Antigravity** — from a
single source tree. Spec-driven development (SDD) with OpenSpec remains
available as an optional mode. All state lives in your repository — no
database, no services.

## IDD in one paragraph

Ask for a code change in your own words. The router sends it to the `idd`
skill, which runs it through the `ospec` CLI: the agent records the intent,
asks the open facts (behaviors neither the request nor the code settle) all at
once, declares the files it will touch, and follows `ospec next`. Signals
derived from those files and from the real diff add obligations: checks for
every change, a reproduction test for a bug, a red → green pair under strict
TDD, contract and test for a public surface, a migration test for persistent
data, a bounded trust review for a security boundary, and a living document
for multi-unit work. Only evidence the CLI records from runs it observes
satisfies an obligation, and the change is done when `ospec close` succeeds
and archives it under `idd/archive/`.

## Core guarantees

- **No self-approval**: the agent stops at four gates (ambiguous intent, open
  facts, irreversible operation, ADR amended or contradicted), and only an
  explicit answer from you resolves one.
- **Evidence over claims**: "tests pass" satisfies nothing; `ospec check` and
  `ospec run` record what actually ran on the current tree.
- **Recoverable state**: `idd/<change>/state.yaml` is owned by the CLI and
  survives new sessions and context compaction.
- **Proportional ceremony**: a one-line fix owes checks; a schema migration
  owes a migration test and a rollback plan.

## Install (Claude Code)

```bash
claude plugin marketplace add https://github.com/snakeblack/ospec-workflow.git#release
claude plugin install ospec-workflow@ospec-tools
```

Then declare your checks once in `idd/config.yaml` at the project root:

```yaml
checks:
  test: npm test
```

For the other targets, run `npm run setup:<target>` from a checkout — see
[`docs/plugin-installation.md`](../plugin-installation.md). Capability
differences per host are declared in
[`docs/target-capabilities.md`](../target-capabilities.md).

## Optional SDD mode

SDD runs a change through planned phases (proposal, specs, design, tasks,
apply, verify, archive) with OpenSpec artifacts and an orchestrator. It is not
installed by default: add `--with-sdd` to any installer
(`npm run setup:claude -- --with-sdd`), then run a `/sdd-*` command or ask for
spec-driven work ("do SDD for X"). The marketplace build ships without it. To
turn IDD off in a project, declare `mode: sdd` in `idd/config.yaml`.

| Command | Use |
|---|---|
| `/sdd-new <change>` | Full cycle with specs for substantial changes |
| `/sdd-lite <change>` | Reduced cycle for trivial/small work |
| `/sdd-continue` | Resume from filesystem state (new session, post-compact) |
| `/sdd-verify` | Validate implementation against specs |
| `/sdd-archive` | Close the change; sync delta specs into the baseline |

## Where to read next

- IDD contract: [`openspec/specs/idd/spec.md`](../../openspec/specs/idd/spec.md).
- SDD methodology: [`docs/sdd-metodologia.md`](../sdd-metodologia.md) ·
  workflows: `docs/sdd-workflows.md` (Spanish).
- Role guides (Spanish, 10 minutes each): `docs/onboarding/tech-lead.md`,
  `developer.md`, `reviewer.md`.
- The harness dogfoods itself: recent changes were built with IDD
  (`idd/archive/`), earlier ones with SDD (`openspec/changes/archive/`).
