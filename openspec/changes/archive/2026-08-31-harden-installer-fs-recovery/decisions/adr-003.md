# ADR-003: Target Context Propagation in Stale File Pruning

- Status: proposed
- Change: harden-installer-fs-recovery
- Date: 2026-08-31

## Context
When stale file pruning fails or mutations exhaust retries, errors previously lost their target identity (defaulting to a generic "installer" label) and lacked structured metadata.

## Decision
Pass explicit `retryOptions` containing `{ target: "<name>", ... }` to `pruneStaleFiles` in all installer targets (`antigravity`, `cursor`, `codex`, `copilot`, `opencode`), and preserve the structured enriched error properties (`code`, `cause`, `attempts`, `path`, `target`) from `mutateFs`.

## Alternatives
- Infer target from path strings: Rejected as brittle when custom destination paths are used.
- Custom domain error class hierarchy: Rejected to maintain lightweight CommonJS conventions without class bloat.

## Consequences
Diagnostic error messages explicitly identify the failing target and provide actionable guidance to close locking processes.
