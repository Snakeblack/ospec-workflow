# ADR-002: Dual-Phase Fail-Closed Filesystem Containment

- Status: proposed
- Change: k6a-worker-isolation
- Date: 2026-08-23

## Context
Worker execution must not modify files or escape outside declared `allowed_paths` boundaries via relative traversals (`../`) or symlinks, even in host environments lacking OS-level sandboxing.

## Decision
Implement `ValidateAllowedPaths` with canonical path resolution and symlink verification across both pre-flight (path declaration check) and post-flight (modified workspace inventory check) phases, failing closed with a structured `containment-violation/v1` payload upon any boundary escape attempt.

## Alternatives
- *Rely exclusively on OS process isolation*: Rejected because host environments may report isolation as `partial` or `unavailable`.
- *Post-execution check only*: Rejected because dangerous out-of-boundary operations could occur before verification.

## Consequences
Deterministic containment enforcement across all environments; violation telemetry is structured and actionable. Reversibility is high.
