# ADR-20261003-001: Automatic Engram setup on every target installer, with a host-neutral addendum

- Status: accepted
- Change: engram-per-target (direct slice, v2.81.0)
- Date: 2026-10-03
- Supersedes: adr-20261002-001 (Claude-only addendum), adr-20261002-002 (opt-in `--with-engram`)
- Keeps: adr-20261002-003 (orchestrator-only saves, recall after state, non-authority)

## Context
New users of the harness had to configure Engram by hand on each host, even though upstream `engram setup <agent>` already handles the same hosts that ospec targets. Only `setup:claude` integrated Engram, and only with `--with-engram`. The addendum was dropped from every other target. Three more problems showed up in practice:
- On Windows, the upstream Claude prompt hook starts in a Git Bash safe mode. That mode silently disables prompt capture and save reminders.
- Copilot CLI (`~/.copilot`) has no upstream setup.
- Cursor ignores global rule files.

## Decision
- One fail-open module (`scripts/configure/engram-setup.js`) serves all seven targets through a target table: claude→`claude-code`, codex→`codex`, antigravity→`antigravity-cli`, opencode→`opencode`, cursor→`cursor`, vscode→`vscode-copilot`. Copilot CLI has no upstream setup, so its fallback merges a stdio `engram mcp --tools=agent` entry into `~/.copilot/mcp-config.json`, keeping every other server and never touching an unparseable file.
- The step is **automatic** whenever the `engram` binary is on PATH; `--no-engram` disables it. `--with-engram` is still accepted and does nothing. Without the binary, the step only prints install guidance. Each host counts as configured when it has the MCP server (`mem_*`) plus its memory-protocol piece. The single mutating action is the idempotent upstream setup, followed by a re-check.
- Each installer wraps its `main` with `withEngramStep`, which runs after a successful global install and never with `--dry-run`, `--dest` or a repo destination. The real step reaches `main` only through `deps.engramStep`, which the CLI entry and the TUI adapter inject. Upstream setup resolves the real home directory by itself, so embedded or test calls must never reach it by default.
- On Claude/Windows, a short Git Bash fork probe (dirname/date/jq/curl ×3, 1.5 s budget) decides the safe mode. If the probe is fast, `ENGRAM_CLAUDE_WINDOWS_BASH_SAFE_MODE=0` is merged into `~/.claude/settings.json`. If it is slow or fails, the safe mode stays on and a note is printed. A value the user already set is never overwritten.
- The addendum becomes host-neutral and ships to every target (all `drop` entries removed). It adds one hint: when the host injected no Engram context, the orchestrator MAY call `mem_context` once, under the same trust boundary.
- Generated output still never contains an Engram MCP entry or hook. Registration is an install-time effect only.

## Alternatives
- Keep opt-in: it contradicts the goal of zero manual setup for new users.
- Ship an Engram MCP entry in generated configs: it duplicates the upstream registration and its absolute command path, and it breaks hosts without Engram.
- Always disable the Windows safe mode: it risks hung prompts under Defender/EDR, which is exactly what the upstream mode exists to avoid.

## Consequences
A global install can modify host config outside ospec's own tree, through upstream setup and the Copilot/settings merges. Every such change is idempotent, fail-open, and can be avoided with `--no-engram`. Detection depends on upstream file locations and CLI output formats, which the test fixtures pin. Reversible: remove the module wiring and restore the drops.
