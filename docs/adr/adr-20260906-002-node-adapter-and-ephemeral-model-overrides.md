# ADR-002: Node adapter and ephemeral model overrides

- Status: proposed
- Change: go-installer-tui
- Date: 2026-09-06

## Context
Seven installers already own target-specific effects; canonical model policy supports only fixed tiers.

## Decision
Use a versioned private JSON plan/request boundary, revalidate requests, and inject per-agent values into the existing generator without writing canonical configuration.

## Alternatives
Go installer duplication diverges from existing guarantees. Temporary edits of models.yaml create shared mutable state. Synthetic tiers violate existing validation.

## Consequences
Go and adapter evolve together. Existing main callers retain defaults; Claude gains a compatible dependency seam. Native installation diagnostics and outcomes remain authoritative.
