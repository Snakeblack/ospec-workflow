# ADR-001: Uniform Canonical Agent Identity Resolution Across SubagentStop Hooks

- Status: proposed
- Change: canonicalize-cx0-context-measurement
- Date: 2026-09-05

## Context
In `SubagentStop`, host-prefixed agent names (`plugin-host:sdd-*`, `host:review-*`) were canonicalized for phase-cost emission, but raw names remained in `persistContextMeasurement` (JS), `persistResultEnvelope` (JS/Go), and `resolveDispatchStatus` (JS/Go). Consequently, prefixed dispatches failed `derivePhaseKey`, silently skipping CX0 context measurements and `state.yaml` envelope summaries, and bypassing `sdd-spec` fail-closed status guards.

## Decision
Canonicalize registered agent names via the shared `agent-identity` authority (`resolveCanonicalAgent` in JS, `agentidentity.ResolveCanonicalAgent` in Go) immediately after `resolveAgentName` across `persistContextMeasurement`, `persistResultEnvelope`, and `resolveDispatchStatus`. Pass canonical identities to `derivePhaseKey`, `validateEnvelope({ phase: canonicalAgent })`, and `ValidateForPhase`.

## Alternatives
- Ad-hoc prefix trimming at each site: rejected because it violates the Single Shared Authority rule (REQ-agent-identity-002) and risks Go/JS drift.
- Canonicalizing inside `resolveAgentName`: rejected because `runSubagentStop` needs the raw host agent name for runtime event diagnostics.
- Canonicalizing inside `derivePhaseKey`: rejected because envelope validation requires the canonical agent name (`sdd-spec`), not the derived phase key (`spec`).

## Consequences
CX0 context telemetry and `state.yaml` envelope summaries are reliably persisted for host-prefixed dispatches. The `sdd-spec` fail-closed integrity guard strictly enforces envelope contracts regardless of host prefixing. Parity between Go and JS is maintained with no migration needed.
