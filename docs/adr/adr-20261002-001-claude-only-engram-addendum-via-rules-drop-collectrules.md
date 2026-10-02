# ADR-001: Claude-only Engram addendum via rules/ + profile drop, with collectRules honoring drop

- Status: proposed
- Change: add-engram-session-memory
- Date: 2026-10-02

## Context
The Engram trust-boundary and pointer protocol must reach only the Claude orchestrator (REQ-session-memory-009, REQ-generator-018). `rules/*.instructions.md` folds into every target. `collectRules` (`scripts/lib/target-transform.js`) accumulates rules without checking `drop`, so codex's synthesized `AGENTS.md` would leak a dropped rule.

## Decision
Create `rules/engram-session-memory.instructions.md`. Claude inlines it into `skills/sdd-orchestrator/SKILL.md`. Add the path to `drop` in github-copilot, opencode, codex, cursor, antigravity and vscode (vscode gets a new `drop` field). Make `collectRules` skip paths matched by `isDropped`. A generator test enumerates `PROFILES`, so a future target that forgets the drop fails CI.

## Alternatives
- Frontmatter `targets: [claude]` filter: excludes new targets by default, but adds a source-format contract with a single consumer.
- Prose in `agents/sdd-orchestrator.agent.md`: ships to all targets.

## Consequences
Uses the existing declarative pattern. The `collectRules` fix is behavior-preserving today because no profile drops a rules path. Each new target needs one drop line, enforced by test. Reversible by deleting the file and the drop entries.
