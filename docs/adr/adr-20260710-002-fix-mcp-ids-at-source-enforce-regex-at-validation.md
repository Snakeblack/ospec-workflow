# ADR-20260710-002: Fix MCP ids at source, enforce regex at validation

- Status: accepted
- Change: codex-target-phase-2
- Date: 2026-07-10
- Archive Date: 2026-07-10

## Context
Codex rejects MCP server ids that violate `^[a-zA-Z0-9_-]+$`. The repo `.mcp.json` ships
`io.github.upstash/context7` and `microsoft/markitdown`, which fail host initialization
(field report §6). REQ-generator-004 requires generation-time validation to fail on such
ids.

## Decision
Rename the two ids in source `.mcp.json` to `context7` and `markitdown`, and add a
`validate-codex.js` check that scans the generated `.mcp.json` and fails (non-zero) on any
id outside `^[a-zA-Z0-9_-]+$`. Do not auto-rewrite ids in the transform.

## Alternatives
- Codex-only id sanitizer in `normalizeMcpPlaceholders` — rejected: hides drift, could
  collide distinct ids, and the spec's "invalid id fails validation" scenario wants a hard
  failure rather than a silent fix.

## Consequences
Source ids become target-neutral and valid everywhere; the validator stays a pure
regression gate over the published payload. Data-model change to `.mcp.json`. Reversible
by restoring the previous ids (but that reintroduces the host failure).

## Implementation Details
- File: `.mcp.json` — Renamed MCP server ids (`io.github.upstash/context7` → `context7`, `microsoft/markitdown` → `markitdown`)
- File: `scripts/configure/validate-codex.js` — Added `validateMcpIds()` check for `^[a-zA-Z0-9_-]+$` pattern
- Tests: `scripts/configure/validate-codex.test.js` — MCP id validation tests

## Resolved By Specs
- REQ-generator-004: Codex Published Payload Path and Metadata Safety
