# Archive Report: codex-target-profile

## Executive Summary

The change `codex-target-profile` successfully implements the `codex` target profile as the fifth supported target for the generator pipeline. This profile reshapes the canonical manifest into `.codex-plugin/plugin.json` (containing only `skills`, `mcpServers`, `apps`, `hooks`, and `interface` metadata), outputs agent files as individual TOML configurations outside the bundle, derives agent `sandbox_mode` from capability declarations, transforms commands into invocable skills under `skills/commands/` (avoiding collision with context-docs), and degrades the abstract `AskUserQuestion` tool to a manual chat protocol. The implementation includes the `validate-codex.js` output validator, golden fixtures, and full regression test passing for all five target profiles.

## Promoted ADRs

- **ADR-001**: Rules emitted as a synthesized `AGENTS.md`, not injected per-agent. (Status: accepted)

## Phase Costs

| Phase | Input Tokens | Output Tokens | Total Tokens | Cost (USD) |
|---|---|---|---|---|
| No cost data available | - | - | - | - |

## User Questions and approvals

- **Total approvals recorded**: 8 (appr-001 to appr-008)
- **Blocking questions**: 0
- **Total user questions/approvals**: 8
