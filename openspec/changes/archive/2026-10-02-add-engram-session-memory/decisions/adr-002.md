# ADR-002: setup:claude Engram opt-in via --with-engram and a fail-open engram-setup module

- Status: proposed
- Change: add-engram-session-memory
- Date: 2026-10-02

## Context
REQ-install-028..030 require detection that never fails, guidance by default, configuration changes only after explicit opt-in, and idempotent registration. `install-claude.js` is non-interactive (`--build-only` precedent) and is also invoked by the Go TUI via `installer-adapter.js` with `argv = []`. Its `run` helper aborts on non-zero exit (REQ-install-014), which is the opposite of what the Engram steps need.

## Decision
Opt-in is the CLI flag `--with-engram` (`npm run setup:claude -- --with-engram`). A new `scripts/configure/engram-setup.js` (injected `spawn`) detects the binary, `doctor --json`, `claude plugin list` and `claude mcp list` with timeouts. It plans actions purely and runs them without throwing. With opt-in: install the upstream plugin when absent, re-probe MCP, and run `engram setup claude-code` only if no engram MCP server is visible. Any `unknown` detection, such as a missing claude CLI, means no changes. The step runs only after ospec's own steps succeed or the claude CLI is absent, never in `--build-only`, and never changes the exit code.

## Alternatives
- Interactive prompt: blocks non-TTY and TUI delegation.
- Env var: ambient state leaks across runs.
- Inline in install-claude.js: no injection seam, and conflicting failure semantics.

## Consequences
New public flag; the TUI path gets guidance only. Detection depends on upstream CLI output formats, pinned by fixtures. Reversible: removing the flag keeps the guidance-only behavior.
