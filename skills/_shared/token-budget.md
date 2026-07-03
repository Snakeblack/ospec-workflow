# Token Budget Protocol

## Default budgets

- Orchestrator permanent instructions: small and stable.
- Delegation prompt: paths + compact deltas.
- Project standards: max 5 compact skill blocks.
- Compact skill block: target 50-150 tokens. Hard cap 500 estimated tokens, enforced by lint (`scripts/docs-lint.test.js`, runs in pre-commit); the cap ratchets down as current offenders shrink — never raise it to admit a new fat skill.
- Full SKILL.md: fallback only.

## Never inline by default

- full proposal.md
- full design.md
- full tasks.md
- full verify-report.md
- full archive-report.md
- whole source files unless the task requires exact local context

## Prefer

- artifact paths;
- precise excerpts;
- compact rules;
- state.yaml summary;
- fresh subagent read.