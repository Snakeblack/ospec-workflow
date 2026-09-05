# ADR-001: Shared agent-identity module with manual Go mirror

- Status: accepted
- Change: extend-bench-agent-coverage
- Date: 2026-09-05

## Context
Agent identity conventions (`sdd-` prefix matching, review allowlist) are duplicated across
`subagent-stop.js`, `subagentstop.go`, and `benchmark.js`, which is exactly why prefixed names
and non-sdd agents fall through. The repo already mirrors JS libs to Go manually
(`scripts/lib/result-envelope.js` ↔ `internal/resultenvelope`) with mirrored parity tests.

## Decision
Create `scripts/lib/agent-identity.js` as the single JS authority and mirror it in a new Go
package `internal/agentidentity`, exported for cross-runtime parity tests. Hook-local
`derivePhaseKey` copies are deleted; all consumers (phase-cost emitter JS/Go, `validCostRow`)
import the shared resolution.

## Alternatives
- Codegen from a single source: no existing JS→Go codegen mechanism; building one for ~40 lines
  is overengineering.
- Go as source of truth: both consuming hooks and the bench are JS-first today.
- Keep per-site logic: that duplication is the bug class being fixed.

## Consequences
One logical point of truth; Go/JS drift is caught by mirrored parity test tables (same
enforcement style as resultenvelope). Adding a new harness agent later means editing the closed
set in exactly two mirrored files.
